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

export function effectiveDuration(duration: string, longVideosEnabled: boolean): string {
  return !longVideosEnabled && isLongDuration(duration) ? FALLBACK_DURATION : duration;
}
