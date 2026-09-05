import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import SettingsManager from "@/components/dashboard/settings/SettingsManager";
import { PLANS, type PlanKey } from "@/lib/billing/plans";

type ProfileSettingsRow = {
  full_name: string | null;
  preferred_language: "pt" | "en" | "es";
};

type SubscriptionRow = {
  plan: PlanKey;
  current_period_end: string | null;
};

export default async function ConfiguracoesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: subscription }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, preferred_language")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("subscriptions")
      .select("plan, current_period_end")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("current_period_end", { ascending: false })
      .limit(1)
      .maybeSingle()
      .returns<SubscriptionRow>(),
  ]);
  const settings = profile as ProfileSettingsRow | null;
  const activePlan = subscription ? (PLANS[subscription.plan] ?? null) : null;

  return (
    <div className="mx-auto flex max-w-[640px] flex-col">
      <SettingsManager
        email={user.email ?? ""}
        initialFullName={settings?.full_name ?? ""}
        initialPreferredLanguage={settings?.preferred_language ?? "pt"}
        activePlanName={activePlan?.name ?? null}
        currentPeriodEnd={subscription?.current_period_end ?? null}
      />
    </div>
  );
}
