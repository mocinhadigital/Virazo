import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminUserId } from "@/lib/admin/requireAdmin";
import { planAllowsLongVideos } from "@/lib/video/durations";

// Mensagem padrão quando o plano não permite 60s (a mesma devolvida pelo banco
// em reserve_daily_video_slot, migration 0042).
export const LONG_VIDEO_NOT_ALLOWED_MESSAGE =
  "long_video_not_allowed: Vídeos de 60s disponíveis nos planos Pro e Ultra.";

// Este usuário pode gerar vídeo de 60s? Pro e Ultra sim; Diário e sem plano não;
// admin sim. É uma conferência ANTECIPADA (ao salvar uma série, ao agendar um
// episódio) — quem decide de verdade na hora de gerar é o banco.
export async function userCanUseLongVideos(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("subscriptions")
    .select("plan")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ plan: string }>();
  if (planAllowsLongVideos(data?.plan)) return true;
  return isAdminUserId(userId);
}
