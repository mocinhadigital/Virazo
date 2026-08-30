import CreateVideoCard from "@/components/dashboard/CreateVideoCard";
import StatsRow from "@/components/dashboard/StatsRow";
import StylePicker from "@/components/dashboard/StylePicker";
import RecentVideos from "@/components/dashboard/RecentVideos";
import SeriesSummaryCard from "@/components/dashboard/series/SeriesSummaryCard";
import { createClient } from "@/utils/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let firstName: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    const fullName = (profile as { full_name: string | null } | null)?.full_name;
    firstName = fullName?.trim().split(/\s+/)[0] || null;
  }

  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
          Olá, {firstName ?? "Criador"}
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Pronto para criar seu próximo vídeo?
        </p>
      </div>

      <CreateVideoCard />
      <SeriesSummaryCard />
      <StatsRow />
      <StylePicker />
      <RecentVideos />
    </div>
  );
}
