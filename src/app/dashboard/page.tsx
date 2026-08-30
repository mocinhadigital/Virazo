import CreateVideoCard from "@/components/dashboard/CreateVideoCard";
import StatsRow from "@/components/dashboard/StatsRow";
import StylePicker from "@/components/dashboard/StylePicker";
import RecentVideos from "@/components/dashboard/RecentVideos";
import SeriesSummaryCard from "@/components/dashboard/series/SeriesSummaryCard";

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
          Olá, Criador
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Pronto para criar seu primeiro vídeo?
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
