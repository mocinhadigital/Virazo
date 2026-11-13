import "server-only";
import { toFile } from "groq-sdk";
import { groq } from "./groq";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { notifyAdmins } from "@/lib/alerts/adminAlert";

export type WordTiming = {
  word: string;
  start: number;
  end: number;
};

export type Transcript = {
  text: string;
  durationSeconds: number;
  words: WordTiming[];
};

// O tipo do groq-sdk só declara `{ text: string }` para a transcrição, mas a
// API (compatível com o formato Whisper/OpenAI) também devolve `duration` e
// `words` quando response_format é "verbose_json" com timestamp_granularities
// — não está refletido no .d.ts do pacote.
type VerboseTranscription = {
  text: string;
  duration?: number;
  words?: WordTiming[];
};

// Groq: 20 requisições/min no plano atual. Espaça as chamadas desta instância
// (uma a cada ~3,3s ≈ 18/min) e, em 429, espera o tempo que a API pede e tenta
// de novo — várias instâncias/clientes ao mesmo tempo só ficam mais lentos,
// nunca recebem erro.
const MIN_INTERVAL_MS = 3300;
// Espera interna por 429 de "limite por minuto" (dicas de poucos segundos). Se a
// Groq pedir uma espera maior que isso (limite da hora/do dia), não adianta
// esperar aqui: o erro sobe com retryAfterMs e quem chamou decide (ver
// transcribeResilient, que entrega o vídeo sem legenda).
const MAX_429_WAIT_MS = 20_000;
export const LONG_LIMIT_MS = 60_000;
let nextSlotAt = 0;

// Só para testes automatizados: pula a fila de horários e as folgas aleatórias,
// para simular a Groq sem esperar nem ocupar a fila real de produção.
export const captionTestHooks = { skipGate: false };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForLocalSlot() {
  const now = Date.now();
  const at = Math.max(now, nextSlotAt);
  nextSlotAt = at + MIN_INTERVAL_MS;
  if (at > now) await sleep(at - now);
}

// Fila de horários GLOBAL no Postgres (migration 0038): todas as instâncias
// da Vercel reservam um horário (≥ 3,3s depois do anterior) e esperam até ele,
// então o total nunca passa de ~18/min. Se a migration ainda não foi
// aplicada (ou o banco falhar), cai no espaçamento local — nunca bloqueia.
let dbGateBroken = false;
async function waitForSlot() {
  if (captionTestHooks.skipGate) return;
  if (!dbGateBroken) {
    try {
      const { data, error } = await createServiceRoleClient().rpc("claim_groq_slot", {
        p_interval_ms: MIN_INTERVAL_MS,
      });
      if (!error && typeof data === "number") {
        if (data > 0) await sleep(data);
        return;
      }
      dbGateBroken = !!error && /claim_groq_slot|does not exist|schema cache/i.test(error.message);
      if (error) console.warn("[captions] fila global do Groq indisponível:", error.message);
    } catch (err) {
      console.warn("[captions] fila global do Groq indisponível:", err);
    }
  }
  await waitForLocalSlot();
}

// Quanto a Groq pede para esperar (ms), lendo o cabeçalho retry-after ou a frase
// "try again in 14m30.5s" (aceita h, m, s e ms). null = não é erro 429.
export function rateLimitWaitMs(err: unknown): number | null {
  const e = err as { status?: number; message?: string; headers?: Record<string, string> | Headers };
  if (e?.status !== 429 && !/\b429\b/.test(e?.message ?? "")) return null;
  const rawHeader = e.headers instanceof Headers ? e.headers.get("retry-after") : e.headers?.["retry-after"];
  const header = Number(rawHeader);
  if (Number.isFinite(header) && header > 0) return header * 1000;
  const phrase = /try again in\s+([0-9hms.\s]+)/i.exec(e.message ?? "");
  if (phrase) {
    let ms = 0;
    for (const t of phrase[1].matchAll(/(\d+(?:\.\d+)?)\s*(ms|h|m|s)/gi)) {
      const n = Number(t[1]);
      const unit = t[2].toLowerCase();
      ms += unit === "h" ? n * 3_600_000 : unit === "m" ? n * 60_000 : unit === "s" ? n * 1000 : n;
    }
    if (ms > 0) return ms;
  }
  return 2000; // 429 sem dica: espera curta
}

// Espera sugerida + folga aleatória (evita todos voltarem no mesmo instante).
function withJitter(ms: number): number {
  if (captionTestHooks.skipGate) return ms;
  return Math.max(ms, 2000) + Math.random() * 4000;
}

export async function transcribeForCaptions(
  audio: Buffer,
  filename = "narration.mp3",
  language: "pt" | "en" | "es" = "pt",
): Promise<Transcript> {
  let response;
  const startedAt = Date.now();
  for (;;) {
    await waitForSlot();
    try {
      response = await groq.audio.transcriptions.create({
        model: "whisper-large-v3-turbo",
        file: await toFile(audio, filename),
        response_format: "verbose_json",
        timestamp_granularities: ["word"],
        language,
      });
      break;
    } catch (err) {
      const hinted = rateLimitWaitMs(err);
      if (hinted === null) throw err;
      const delay = withJitter(hinted);
      if (hinted > LONG_LIMIT_MS || Date.now() - startedAt + delay > MAX_429_WAIT_MS) {
        throw Object.assign(err instanceof Error ? err : new Error(String(err)), { retryAfterMs: hinted });
      }
      console.warn(`[captions] Groq 429, nova tentativa em ${(delay / 1000).toFixed(1)}s`);
      await sleep(delay);
    }
  }

  const verbose = response as unknown as VerboseTranscription;
  const words = verbose.words ?? [];

  return {
    text: verbose.text,
    durationSeconds: verbose.duration ?? (words.length > 0 ? words[words.length - 1].end : 0),
    words,
  };
}

// ---------------------------------------------------------------------------
// Legenda que nunca derruba o vídeo
// ---------------------------------------------------------------------------

// Marca de que a legenda de um vídeo falhou (e o vídeo seguiu sem ela). Quem
// monta o vídeo passa um destes e, no fim, devolve a vaga/bônus/créditos do
// cliente (ver applyCaptionFailureNoCharge).
export type CaptionState = { failed: boolean; reason: string | null };

// Esperas entre as tentativas quando a Groq falha por limite ou instabilidade.
export const CAPTION_RETRY_DELAYS_MS = [5_000, 10_000, 20_000, 30_000];
// Teto de tempo gasto tentando (as esperas + as chamadas), para não estourar o
// prazo da geração do vídeo.
const CAPTION_RETRY_MAX_TOTAL_MS = 110_000;

type ErrorKind = "retryable" | "long_limit" | "fatal";

function classifyGroqError(err: unknown): ErrorKind {
  const wait = rateLimitWaitMs(err);
  if (wait !== null) return wait > LONG_LIMIT_MS ? "long_limit" : "retryable";
  const e = err as { status?: number; name?: string; message?: string; cause?: unknown };
  if (typeof e?.status === "number") {
    return e.status >= 500 || e.status === 408 || e.status === 409 ? "retryable" : "fatal";
  }
  // Sem status: queda de rede/timeout (groq-sdk: APIConnectionError).
  const text = `${e?.name ?? ""} ${e?.message ?? ""} ${String((e?.cause as { message?: string })?.message ?? "")}`;
  return /connection|fetch failed|network|ECONN|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|EPIPE|socket|timeout|timed out/i.test(text)
    ? "retryable"
    : "fatal";
}

function shortReason(err: unknown): string {
  const e = err as { status?: number; message?: string };
  const msg = (e?.message ?? String(err)).replace(/\s+/g, " ").slice(0, 300);
  return e?.status ? `HTTP ${e.status}: ${msg}` : msg;
}

// Transcreve com paciência: em limite por minuto ou instabilidade espera alguns
// segundos e tenta de novo (5s, 10s, 20s, 30s). Se continuar falhando (ou se o
// erro não tem conserto por tentativa, como limite do dia ou chave inválida),
// NÃO lança: devolve uma transcrição sem palavras (o vídeo sai sem legenda, com a
// duração `measuredSeconds` medida no próprio áudio), marca `state` e avisa o
// admin por e-mail (no máximo 1 por hora).
export async function transcribeResilient(args: {
  audio: Buffer;
  filename?: string;
  language?: "pt" | "en" | "es";
  // Duração real do áudio (ffmpeg), usada se a transcrição falhar.
  measuredSeconds: number;
  state?: CaptionState;
  // Onde isso aconteceu (ex.: id do vídeo), só para o aviso.
  context?: string;
  // Só para testes.
  delaysMs?: number[];
  maxTotalMs?: number;
}): Promise<Transcript> {
  const delays = args.delaysMs ?? CAPTION_RETRY_DELAYS_MS;
  const maxTotal = args.maxTotalMs ?? CAPTION_RETRY_MAX_TOTAL_MS;
  const startedAt = Date.now();
  let lastError: unknown;

  for (let attempt = 0; ; attempt++) {
    try {
      return await transcribeForCaptions(args.audio, args.filename, args.language);
    } catch (err) {
      lastError = err;
      if (classifyGroqError(err) !== "retryable" || attempt >= delays.length) break;
      const hinted = (err as { retryAfterMs?: number }).retryAfterMs ?? 0;
      const wait = Math.max(delays[attempt], hinted);
      if (Date.now() - startedAt + wait > maxTotal) break;
      console.warn(`[captions] Groq falhou (${shortReason(err)}); tentativa ${attempt + 2} em ${(wait / 1000).toFixed(0)}s`);
      await sleep(wait);
    }
  }

  const reason = shortReason(lastError);
  if (args.state) {
    args.state.failed = true;
    args.state.reason = reason;
  }
  console.error(`[captions] Groq continuou falhando — vídeo segue SEM legenda. ${reason}`);
  await notifyAdmins(
    "groq-captions",
    "[Virazo] Groq falhou nas legendas — vídeos saindo sem legenda",
    `A Groq (legendas) continuou falhando depois de ${delays.length + 1} tentativas e o vídeo foi entregue SEM legenda.\n\n` +
      `Motivo: ${reason}\n` +
      (args.context ? `Onde: ${args.context}\n` : "") +
      `Quando: ${new Date().toISOString()}\n\n` +
      `O cliente não é cobrado por esse vídeo (vaga do dia/bônus/créditos devolvidos) e vê o aviso para gerar de novo sem custo.\n` +
      `Se for limite de uso, veja o consumo no painel da Groq (console.groq.com) e considere o plano pago.\n` +
      `Você recebe no máximo 1 aviso por hora; novas falhas continuam registradas no log do servidor.`,
  );
  return { text: "", durationSeconds: args.measuredSeconds, words: [] };
}

// Devolve ao cliente o que esse vídeo custou (vaga do dia / bônus), porque ele
// saiu sem legenda. Chamada UMA vez, no fim da montagem. Nunca lança: se a
// migration 0041 ainda não foi aplicada, só registra e avisa.
export async function applyCaptionFailureNoCharge(
  videoId: string,
  kind: "video" | "realistic" = "video",
): Promise<boolean> {
  try {
    const { error } = await createServiceRoleClient().rpc(
      kind === "video" ? "mark_video_caption_failed" : "mark_realistic_caption_failed",
      { p_video_id: videoId },
    );
    if (!error) return true;
    console.error(`[captions] não foi possível devolver o custo do vídeo ${videoId}: ${error.message}`);
    await notifyAdmins(
      "groq-refund-failed",
      "[Virazo] Vídeo sem legenda NÃO foi devolvido ao cliente",
      `O vídeo ${videoId} (${kind}) saiu sem legenda, mas a devolução do custo falhou: ${error.message}\n` +
        `Provável causa: a migration 0041_caption_failure_no_charge.sql ainda não foi rodada no Supabase.`,
    );
  } catch (err) {
    console.error("[captions] falha ao devolver o custo:", err instanceof Error ? err.message : err);
  }
  return false;
}
