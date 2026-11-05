import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Cliente com chave de serviço (as escritas em realistic_videos só passam
// pelo servidor). Sempre usado com o user_id já conferido pela rota.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ServiceClient = SupabaseClient<any, any, any>;

export function extractErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "body" in err) {
    const body = (err as { body?: unknown }).body;
    if (body && typeof body === "object" && "detail" in body) {
      const detail = (body as { detail?: unknown }).detail;
      if (typeof detail === "string") return detail;
      if (detail && typeof detail === "object" && "message" in detail) {
        const nested = (detail as { message?: unknown }).message;
        if (typeof nested === "string") return nested;
      }
    }
  }
  if (err instanceof Error) return err.message;
  return "Não foi possível gerar o vídeo.";
}

// Tira o prefixo "codigo: " das mensagens das funções do banco.
export function parseRealisticDbError(message: string): { code: string | null; message: string } {
  const match = /^(no_realistic_credits|already_started|too_many_in_progress):\s*(.*)$/.exec(message);
  return match ? { code: match[1], message: match[2] } : { code: null, message };
}

// ---------- novas tentativas para falhas passageiras de rede ----------

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// "fetch failed", conexão derrubada, DNS, timeout, 502/503/504... — coisas que
// costumam passar sozinhas se tentar de novo em instantes.
export function isTransientError(err: unknown): boolean {
  if (err === null || err === undefined) return false;
  const parts: string[] = [];
  if (err instanceof Error) {
    parts.push(err.name, err.message);
    const cause = (err as { cause?: unknown }).cause;
    if (cause instanceof Error) parts.push(cause.name, cause.message, String((cause as { code?: unknown }).code ?? ""));
    else if (cause) parts.push(String(cause));
  } else if (typeof err === "object" && "message" in err) {
    parts.push(String((err as { message: unknown }).message));
  } else {
    parts.push(String(err));
  }
  return /fetch failed|network|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|EPIPE|socket|UND_ERR|timeout|timed out|\b50[234]\b|temporarily|bad gateway|service unavailable/i.test(
    parts.join(" "),
  );
}

// Repete `fn` (até `attempts` vezes, com espera crescente) enquanto o erro for
// passageiro. Erro de verdade (regra, permissão, dado inválido) sobe na hora.
export async function retryTransient<T>(
  fn: () => Promise<T>,
  attempts = 4,
  baseMs = 600,
  maxMs = 30_000,
): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts - 1 || !isTransientError(err)) throw err;
      await sleep(Math.min(maxMs, baseMs * 2 ** i));
    }
  }
}

// Texto do erro COM a causa de baixo (code/mensagem). "fetch failed" sozinho
// não diz nada; a causa diz se foi timeout, conexão derrubada, DNS etc.
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const code = (cause as { code?: unknown }).code;
    return `${err.name}: ${err.message} (causa: ${code ? code + " " : ""}${cause.message})`;
  }
  return `${err.name}: ${err.message}`;
}

// Igual, para chamadas do Supabase, que devolvem { error } em vez de lançar.
export async function retryDb<T extends { error: { message: string } | null }>(
  fn: () => PromiseLike<T>,
  attempts = 4,
): Promise<T> {
  for (let i = 0; ; i++) {
    let result: T;
    try {
      result = await fn();
    } catch (err) {
      if (i >= attempts - 1 || !isTransientError(err)) throw err;
      await sleep(600 * 2 ** i);
      continue;
    }
    if (!result.error || i >= attempts - 1 || !isTransientError(result.error)) return result;
    await sleep(600 * 2 ** i);
  }
}
