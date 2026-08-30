// Calcula o próximo horário de geração a partir de um "HH:MM" local do
// servidor. Usado na criação da série e sempre que o usuário reativa uma
// série pausada ou muda o horário/frequência (a geração automática em si
// avança `next_generation_at` sozinha via a função record_series_generation).
export function computeNextGenerationAt(horario: string, fromDate: Date = new Date()): string {
  const [hours, minutes] = horario.split(":").map(Number);
  const next = new Date(fromDate);
  next.setHours(hours, minutes, 0, 0);
  if (next.getTime() <= fromDate.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.toISOString();
}

export const HORARIO_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
