import { createClient } from "@/utils/supabase/server";
import { mapSeriesRow, type SeriesRow } from "@/components/dashboard/seriesMapping";
import SeriesManager from "@/components/dashboard/series/SeriesManager";
import RealisticOnlyLock from "@/components/dashboard/RealisticOnlyLock";

export default async function SeriesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null; // layout já redireciona pra /login antes disso

  const { data } = await supabase
    .from("series")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .returns<SeriesRow[]>();

  const initialSeries = (data ?? []).map(mapSeriesRow);

  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-6 sm:gap-8">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">Minhas Séries</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Séries criam vídeos novos para você: só quando você pedir (o padrão) ou todo dia, no automático.
        </p>
      </div>

      <RealisticOnlyLock
        title="Séries"
        description="Séries que criam vídeos novos para você, só quando você pedir ou todo dia. Disponível nos planos do Virazo."
      >
        <SeriesManager initialSeries={initialSeries} />
      </RealisticOnlyLock>
    </div>
  );
}
