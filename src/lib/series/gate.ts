import "server-only";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { isAdminUserId } from "@/lib/admin/requireAdmin";
import { PLANS, type PlanKey } from "@/lib/billing/plans";
import { startOfDayInBrasilia } from "@/lib/billing/dailyLimit";
import { effectiveDuration, planAllowsLongVideos, videoSlotCost } from "@/lib/video/durations";
import { areLongVideosEnabled } from "@/lib/video/featureFlags";

// Conferência ANTECIPADA (só leitura) do agendador: este cliente pode receber um episódio
// agora? Evita tentar gerar (e registrar "erro") para quem não tem plano ou já usou os
// vídeos do dia. Espelha a regra de reserve_daily_video_slot (migration 0042), que continua
// sendo a palavra final na hora de reservar a vaga.
export type GenerationGate = { ok: true } | { ok: false; reason: "no_subscription" | "limit" | "not_enough_slots" };

export async function checkGenerationGate(userId: string, seriesDuration: string): Promise<GenerationGate> {
  if (await isAdminUserId(userId)) return { ok: true };

  const service = createServiceRoleClient();
  const { data: sub } = await service
    .from("subscriptions")
    .select("plan")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ plan: string }>();
  const plan = sub?.plan as PlanKey | undefined;
  if (!plan || !PLANS[plan]) return { ok: false, reason: "no_subscription" };

  const duration = effectiveDuration(seriesDuration, areLongVideosEnabled(), planAllowsLongVideos(plan));
  const cost = videoSlotCost(duration);
  const limit = PLANS[plan].dailyVideoLimit;

  const dayStart = startOfDayInBrasilia(new Date());
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600_000);
  const { data: videos } = await service
    .from("videos")
    .select("duration, status, reserved_at, caption_failed")
    .eq("user_id", userId)
    .gte("created_at", dayStart.toISOString())
    .lt("created_at", dayEnd.toISOString())
    .returns<{ duration: string; status: string; reserved_at: string | null; caption_failed: boolean }[]>();

  const tenMinutesAgo = Date.now() - 10 * 60_000;
  const used = (videos ?? [])
    .filter(
      (v) =>
        !v.caption_failed &&
        (v.status === "Pronto" ||
          (v.status === "Processando" && !!v.reserved_at && new Date(v.reserved_at).getTime() > tenMinutesAgo)),
    )
    .reduce((sum, v) => sum + videoSlotCost(v.duration), 0);

  // O agendador NÃO usa o bônus do Pro (só o clique do cliente usa): acabou o limite do dia = adia.
  if (used >= limit) return { ok: false, reason: "limit" };
  return used + cost > limit ? { ok: false, reason: "not_enough_slots" } : { ok: true };
}
