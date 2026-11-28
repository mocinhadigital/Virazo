import "server-only";
import { isAdminUserId } from "@/lib/admin/requireAdmin";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { realisticCreditCost, realisticDurationFromLabel } from "./constants";
import { getRealisticCredits } from "./api";

// Recusa ANTES de salvar/gerar série Realista sem créditos (nunca vira erro na hora de gerar).
// Administradores ficam livres. Devolve a mensagem de recusa, ou null se pode seguir.
export const SERIES_NO_REALISTIC_CREDITS_ERROR =
  "no_realistic_credits: O Vídeo Realista é vendido à parte do seu plano. Você precisa de créditos realistas para usar este estilo.";

export async function realisticSeriesCreditsRefusal(userId: string, duration: string): Promise<string | null> {
  if (await isAdminUserId(userId)) return null;
  const cost = realisticCreditCost(realisticDurationFromLabel(duration));
  const credits = await getRealisticCredits(createServiceRoleClient(), userId);
  return credits < cost ? SERIES_NO_REALISTIC_CREDITS_ERROR : null;
}
