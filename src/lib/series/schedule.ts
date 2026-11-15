// Calcula o próximo horário de geração a partir de um "HH:MM". O horário da série vale
// no relógio de BRASÍLIA (America/Sao_Paulo, UTC-3 o ano inteiro): é o que o cliente vê e
// o mesmo relógio usado na virada do limite diário. (Antes valia no relógio do servidor da
// Vercel, que é UTC: "09:00" virava 06:00 em Brasília.) Usado na criação da série e sempre
// que o usuário reativa uma série pausada ou muda o horário/frequência; a geração
// automática avança `next_generation_at` sozinha via record_series_generation (migration
// 0044), usando a mesma regra.
const BRASILIA_OFFSET_MS = -3 * 3600_000;

export function computeNextGenerationAt(horario: string, fromDate: Date = new Date()): string {
  const [hours, minutes] = horario.split(":").map(Number);
  // "Relógio de Brasília" representado nos campos UTC.
  const local = new Date(fromDate.getTime() + BRASILIA_OFFSET_MS);
  const candidate =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hours, minutes, 0, 0) - BRASILIA_OFFSET_MS;
  const next = candidate > fromDate.getTime() ? candidate : candidate + 24 * 3600_000;
  return new Date(next).toISOString();
}

export const HORARIO_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
