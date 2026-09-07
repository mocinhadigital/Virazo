import "server-only";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

// Semáforo GLOBAL (todas as instâncias da Vercel, todos os fluxos: geração
// por série, manual, retry E preview de voz) para nunca ultrapassar o limite
// real de concorrência da conta ElevenLabs (3 chamadas simultâneas). Vive no
// Postgres (migration 0016) — não numa trava em memória, que não protegeria
// chamadas de outras instâncias/funções serverless.
//
// Usa o cliente service-role porque é um recurso de infraestrutura
// compartilhado (não dado de um usuário específico) — precisa funcionar
// tanto numa rota com sessão de usuário (Gerar agora, retry, preview) quanto
// no cron sem sessão (run-scheduled).

const SLOT_TTL_SECONDS = 60; // cobre 1 chamada real + os retries internos do SDK; se a função morrer no meio, a vaga se autolibera sozinha depois disso — nunca trava o Virazo pra sempre.
const ACQUIRE_MAX_WAIT_MS = 45_000; // teto pra não estourar em cascata o maxDuration=300s das rotas
const ACQUIRE_POLL_BASE_MS = 250;
const MAX_RATE_LIMIT_RETRIES = 2; // poucas tentativas extras — a própria vaga já evita o 429 na maioria dos casos

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireSlot(owner: string): Promise<number> {
  const supabase = createServiceRoleClient();
  const deadline = Date.now() + ACQUIRE_MAX_WAIT_MS;
  let attempt = 0;

  for (;;) {
    const { data, error } = await supabase.rpc("acquire_elevenlabs_tts_slot", {
      p_owner: owner,
      p_ttl_seconds: SLOT_TTL_SECONDS,
    });

    if (error) {
      throw new Error(`Falha ao reservar vaga de concorrência da ElevenLabs: ${error.message}`);
    }
    if (data !== null && data !== undefined) {
      return data as number;
    }
    if (Date.now() > deadline) {
      throw new Error(
        "Todas as vagas de geração de voz estão ocupadas no momento — tente novamente em instantes.",
      );
    }

    attempt++;
    const backoff = Math.min(2000, ACQUIRE_POLL_BASE_MS * 2 ** attempt) * (0.5 + Math.random() * 0.5);
    await sleep(backoff);
  }
}

async function releaseSlot(slotNumber: number, owner: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.rpc("release_elevenlabs_tts_slot", {
    p_slot_number: slotNumber,
    p_owner: owner,
  });
  if (error) {
    console.error("[elevenlabsGate] falha ao liberar vaga:", error);
  }
}

// O SDK da ElevenLabs (BaseClient.d.ts) já expõe `statusCode` e `rawResponse`
// (com headers) no erro lançado após esgotar os próprios retries internos
// dele (requestWithRetries.js: 2 tentativas, já respeitando Retry-After e
// X-RateLimit-Reset). Isto aqui só detecta esse formato pra decidir se vale
// a pena tentar de novo NUM SLOT NOVO — não duplica a lógica de backoff do
// SDK, só cobre o caso de congestionamento que sobrar depois dela.
function readRateLimitInfo(err: unknown): { isRateLimit: boolean; retryAfterMs?: number } {
  const anyErr = err as { statusCode?: number; rawResponse?: { headers?: Headers | Record<string, string> } };
  if (anyErr?.statusCode !== 429) return { isRateLimit: false };

  const headers = anyErr.rawResponse?.headers;
  const retryAfterRaw =
    headers instanceof Headers ? headers.get("retry-after") : (headers as Record<string, string> | undefined)?.["retry-after"];
  const retryAfterSeconds = retryAfterRaw ? Number(retryAfterRaw) : NaN;

  return {
    isRateLimit: true,
    retryAfterMs: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : undefined,
  };
}

/**
 * Executa `fn` (uma chamada real de TTS à ElevenLabs) segurando uma vaga do
 * semáforo global durante toda a chamada — nunca mais de 3 chamadas
 * simultâneas em toda a aplicação, entre todos os usuários e instâncias.
 * Em 429 (esgotados os retries internos do SDK), libera a vaga, espera
 * (Retry-After se vier, senão backoff exponencial com jitter) e tenta de
 * novo numa vaga nova, poucas vezes. A vaga é sempre liberada em `finally`,
 * em sucesso ou erro — nunca fica presa segurando uma vaga.
 */
export async function withElevenLabsSlot<T>(owner: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    const attemptOwner = `${owner}#${attempt}`;
    const slot = await acquireSlot(attemptOwner);
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const rateLimit = readRateLimitInfo(err);
      if (!rateLimit.isRateLimit || attempt === MAX_RATE_LIMIT_RETRIES) {
        throw err;
      }
      const backoffMs = rateLimit.retryAfterMs ?? Math.min(8000, 500 * 2 ** attempt);
      await sleep(backoffMs * (0.5 + Math.random() * 0.5));
      // solta a vaga (no finally) e cai pro próximo `attempt`, que adquire uma vaga nova.
    } finally {
      await releaseSlot(slot, attemptOwner);
    }
  }

  // Inatingível (o loop sempre retorna ou lança) — só pra satisfazer o TS.
  throw lastError;
}
