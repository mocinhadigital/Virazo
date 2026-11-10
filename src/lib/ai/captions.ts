import "server-only";
import { toFile } from "groq-sdk";
import { groq } from "./groq";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

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
const MAX_429_WAIT_MS = 120_000; // desiste só depois de ~2 min esperando vaga
let nextSlotAt = 0;

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

function retryDelayMs(err: unknown): number | null {
  const e = err as { status?: number; message?: string; headers?: Record<string, string> };
  if (e?.status !== 429 && !/\b429\b/.test(e?.message ?? "")) return null;
  const header = Number(e.headers?.["retry-after"]);
  const m = /try again in ([\d.]+)s/i.exec(e.message ?? "");
  const hinted = Number.isFinite(header) && header > 0 ? header : m ? Number(m[1]) : 0;
  // Espera sugerida + folga aleatória (evita todos voltarem no mesmo instante).
  return Math.max(hinted, 2) * 1000 + Math.random() * 4000;
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
      const delay = Date.now() - startedAt < MAX_429_WAIT_MS ? retryDelayMs(err) : null;
      if (delay === null) throw err;
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
