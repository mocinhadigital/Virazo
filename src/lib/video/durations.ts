// Durações "longas" (60s e 90s) ficam desligadas até LONG_VIDEOS_ENABLED=true
// na Vercel. Motivo: vídeos de 60s estouravam o limite de 300s da função
// da Vercel e ficavam presos em "Gerando". A montagem foi otimizada, mas a
// chave existe para religar só depois de confirmar em produção — e para
// desligar de novo sem novo código, se precisar.
//
// Arquivo sem "server-only": é usado também pelo wizard no navegador. Quem
// decide se está ligado é o servidor (featureFlags.ts), que repassa o valor.

export const LONG_DURATIONS = new Set(["60s", "90s"]);

// Usada quando uma duração longa chega com a chave desligada (série antiga
// configurada em 60s, "Tentar de novo" de um vídeo de 60s).
export const FALLBACK_DURATION = "30s";

export function isLongDuration(duration: string | null | undefined): boolean {
  return !!duration && LONG_DURATIONS.has(duration);
}

// Duração longa que o app oferece (o 90s existe só em séries muito antigas e
// nunca é oferecido nem aceito para vídeos novos).
export const OFFERED_LONG_DURATION = "60s";

// Quantos vídeos do limite do dia cada duração gasta. Espelha
// public.video_slot_cost (migration 0042) — a regra de verdade está no banco; isto
// é só para mostrar na tela e avisar antes de o cliente tentar.
export function videoSlotCost(duration: string | null | undefined): number {
  if (duration === "60s") return 2;
  if (duration === "90s") return 3;
  return 1;
}

// Vídeos de 60s: só planos Pro e Ultra (e admin, tratado por quem chama).
export function planAllowsLongVideos(plan: string | null | undefined): boolean {
  return plan === "pro" || plan === "ultra";
}

// Duração que realmente será usada. `longAllowed` = o plano do usuário permite
// vídeo longo (Pro/Ultra/admin); sem isso, cai em 30s em vez de falhar (série
// antiga em 60s de quem hoje é Diário). 90s nunca é gerado: vira 60s.
export function effectiveDuration(duration: string, longVideosEnabled: boolean, longAllowed = true): string {
  if (!isLongDuration(duration)) return duration;
  if (!longVideosEnabled || !longAllowed) return FALLBACK_DURATION;
  return OFFERED_LONG_DURATION;
}
