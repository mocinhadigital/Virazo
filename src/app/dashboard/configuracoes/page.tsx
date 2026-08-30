import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import SettingsManager from "@/components/dashboard/settings/SettingsManager";

type ProfileSettingsRow = {
  full_name: string | null;
  preferred_language: "pt" | "en" | "es";
};

export default async function ConfiguracoesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, preferred_language")
    .eq("id", user.id)
    .maybeSingle();
  const settings = profile as ProfileSettingsRow | null;

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">Configurações</h1>
        <p className="mt-1 text-sm text-zinc-400">Gerencie sua conta e preferências do Virazo.</p>
      </div>

      <SettingsManager
        email={user.email ?? ""}
        initialFullName={settings?.full_name ?? ""}
        initialPreferredLanguage={settings?.preferred_language ?? "pt"}
      />
    </div>
  );
}
