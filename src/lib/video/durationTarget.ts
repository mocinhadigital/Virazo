// Regra de duração do vídeo FINAL (o MP4 entregue ao cliente), igual para
// todos os planos e para as séries. Nunca abaixo da duração escolhida.
// Arquivo sem "server-only": só constantes e contas, sem dependências.
export const DURATION_RULES: Record<string, { min: number; max: number }> = {
  "30s": { min: 30, max: 33 },
  "60s": { min: 60, max: 64 },
};

// Roteiro: nº de cenas e palavras por cena. Medido com a voz da ElevenLabs
// em pt-BR (~2,3 palavras/s, já contando as pausas entre cenas): 9 cenas x 8
// palavras ≈ 31s e 18 cenas x 8 palavras ≈ 62s. Antes eram 5-8 palavras por
// cena (~58 palavras) e o vídeo de 30s saía com ~26s.
export const WORDS_PER_SCENE = { min: 7, max: 9 };

// Duração média de uma cena narrada, usada para calcular quantas cenas de
// reforço faltam quando a narração sai curta.
export const SECONDS_PER_SCENE = 3.5;

export function durationRule(duration: string) {
  return DURATION_RULES[duration] ?? null;
}

// Faixa "segura" antes da montagem: sobra uma folga para o arredondamento de
// quadros e o preenchimento do AAC, que podem somar/tirar alguns centésimos.
export const SAFETY_MARGIN = 0.25;
export const ASPIRATION_FRACTION = 0.35; // alvo = min + 35% da faixa (ex.: 31,05s em 30s)
export const MIN_TEMPO = 0.93; // desacelera a voz até 7% (imperceptível) para completar
export const LAST_RESORT_MIN_TEMPO = 0.85; // só se as cenas de reforço não bastarem

export type FitPlan =
  | { kind: "ok" }
  | { kind: "tempo"; tempo: number }
  | { kind: "extend"; missingSeconds: number };

// Passar do máximo da faixa é aceito (entrega normal, sem erro): só o MÍNIMO
// é garantido. Abaixo dele: desacelera um pouco a voz ou acrescenta cenas.
export function planFit(totalSeconds: number, rule: { min: number; max: number }): FitPlan {
  if (totalSeconds >= rule.min + SAFETY_MARGIN) return { kind: "ok" };
  const aim = rule.min + (rule.max - rule.min) * ASPIRATION_FRACTION;
  const tempo = totalSeconds / aim;
  if (tempo >= MIN_TEMPO) return { kind: "tempo", tempo };
  return { kind: "extend", missingSeconds: aim - totalSeconds };
}
