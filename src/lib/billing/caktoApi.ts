import "server-only";

// Cliente mínimo da API pública da Cakto (https://docs.cakto.com.br).
//
// Autenticação OAuth2 client_credentials: POST /public_api/token/ com
// client_id/client_secret em form-urlencoded devolve um Bearer válido por
// expires_in segundos (padrão 36000 = 10h). O endpoint de token tem limite
// de 20 req/min por IP — por isso o token fica em cache na memória da
// instância até perto de expirar, e pedidos simultâneos compartilham a
// mesma requisição de token em vez de cada um pedir o seu.

const BASE_URL = "https://api.cakto.com.br";
const REQUEST_TIMEOUT_MS = 10_000;
// Renova um pouco antes do fim para nenhuma chamada sair com token vencendo
// no meio do caminho.
const TOKEN_RENEW_MARGIN_MS = 5 * 60 * 1000;

let cachedToken: { value: string; expiresAt: number } | null = null;
let pendingToken: Promise<string> | null = null;

export function isCaktoApiConfigured(): boolean {
  return !!process.env.CAKTO_CLIENT_ID?.trim() && !!process.env.CAKTO_CLIENT_SECRET?.trim();
}

async function fetchAccessToken(): Promise<string> {
  const response = await fetch(`${BASE_URL}/public_api/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.CAKTO_CLIENT_ID!.trim(),
      client_secret: process.env.CAKTO_CLIENT_SECRET!.trim(),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    // Nunca loga o corpo da requisição (tem o client_secret) — só a resposta.
    const detail = await response.text().catch(() => "");
    throw new Error(`token da Cakto falhou (HTTP ${response.status}): ${detail.slice(0, 300)}`);
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("token da Cakto veio sem access_token");

  const expiresInMs = (data.expires_in ?? 36000) * 1000;
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + Math.max(expiresInMs - TOKEN_RENEW_MARGIN_MS, 60_000),
  };
  return data.access_token;
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  if (!pendingToken) {
    pendingToken = fetchAccessToken().finally(() => {
      pendingToken = null;
    });
  }
  return pendingToken;
}

// GET autenticado. Se a Cakto recusar o token (revogado antes da hora, por
// exemplo), descarta o cache e tenta uma única vez com um token novo.
export async function caktoGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);

  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getAccessToken();
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status === 401 && attempt === 0) {
      cachedToken = null;
      continue;
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`GET ${url.pathname} na Cakto falhou (HTTP ${response.status}): ${detail.slice(0, 300)}`);
    }

    return (await response.json()) as T;
  }

  throw new Error(`GET ${url.pathname} na Cakto: token recusado duas vezes`);
}
