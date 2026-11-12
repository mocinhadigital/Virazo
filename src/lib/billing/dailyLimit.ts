// América/Manaus é UTC-4 e America/Sao_Paulo é UTC-3 o ano inteiro (o Brasil não
// tem horário de verão desde 2019) — por isso dá pra usar offsets fixos aqui,
// sem precisar de tabela de fusos.
const MANAUS_OFFSET_HOURS = -4;
const BRASILIA_OFFSET_HOURS = -3;

function startOfDayWithOffset(reference: Date, offsetHours: number): Date {
  const shifted = new Date(reference.getTime() + offsetHours * 3600_000);
  const startOfDayShifted = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), 0, 0, 0),
  );
  return new Date(startOfDayShifted.getTime() - offsetHours * 3600_000);
}

// Meia-noite em America/Manaus. Só o funil de vendas do admin usa (dia de
// Manaus nos relatórios); o limite diário de vídeos usa Brasília (abaixo).
export function startOfDayInManaus(reference: Date = new Date()): Date {
  return startOfDayWithOffset(reference, MANAUS_OFFSET_HOURS);
}

// Meia-noite em America/Sao_Paulo (horário de Brasília), convertida pro
// instante UTC correspondente — mesma lógica usada em SQL por
// `date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'`
// (ver migration 0040, reserve_daily_video_slot). Mantida em JS aqui só pra
// exibição no cliente — a checagem que realmente autoriza/bloqueia geração
// vive no banco, não aqui.
export function startOfDayInBrasilia(reference: Date = new Date()): Date {
  return startOfDayWithOffset(reference, BRASILIA_OFFSET_HOURS);
}

// Conta vídeos que já ocupam (ou ocuparam com sucesso) a cota diária do
// usuário — só pra exibição ("X de Y vídeos hoje"); não é o que autoriza
// geração de verdade (isso é feito atomicamente no banco).
export function countVideosUsedToday(
  videos: { status: string; createdAtIso: string }[],
  reference: Date = new Date(),
): number {
  const start = startOfDayInBrasilia(reference);
  return videos.filter((v) => {
    if (v.status !== "Pronto" && v.status !== "Processando") return false;
    return new Date(v.createdAtIso).getTime() >= start.getTime();
  }).length;
}

export type GenerationBlockReason = "no_subscription" | "daily_limit_reached" | "other";

export type ParsedGenerationError = {
  message: string;
  reason: GenerationBlockReason;
};

// reserve_daily_video_slot (migration 0019) prefixa a mensagem de erro com
// "no_subscription:"/"daily_limit_reached:" quando bloqueia a geração por
// esses motivos — usado tanto pelo wizard de vídeo avulso quanto por
// "Gerar agora" de série, pra decidir se abre o modal de planos em vez de
// só mostrar um erro genérico.
export function parseGenerationError(rawMessage: string): ParsedGenerationError {
  if (rawMessage.startsWith("no_subscription:")) {
    return { message: rawMessage.slice("no_subscription:".length).trim(), reason: "no_subscription" };
  }
  if (rawMessage.startsWith("daily_limit_reached:")) {
    return { message: rawMessage.slice("daily_limit_reached:".length).trim(), reason: "daily_limit_reached" };
  }
  return { message: rawMessage, reason: "other" };
}
