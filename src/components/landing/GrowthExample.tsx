import { TrendingUp } from "lucide-react";
import SectionHeading from "./SectionHeading";

const GROWTH_POINTS = [
  { label: "Semana 1", views: 12_000 },
  { label: "Semana 4", views: 340_000 },
  { label: "Semana 8", views: 1_200_000 },
  { label: "Semana 12", views: 3_400_000 },
];

function formatViews(views: number): string {
  if (views >= 1_000_000) {
    return `${(views / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`;
  }
  if (views >= 1_000) {
    return `${Math.round(views / 1000)} mil`;
  }
  return `${views}`;
}

export default function GrowthExample() {
  const maxViews = GROWTH_POINTS[GROWTH_POINTS.length - 1].views;

  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Consistência gera resultado"
          title="Publicar todo dia, sem esforço, é o que faz a diferença"
          description="Uma série publicada com constância tende a crescer com o tempo — veja um exemplo de trajetória."
        />

        <div className="card-glass mt-10 rounded-2xl p-6 sm:p-8">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            <TrendingUp className="h-3.5 w-3.5 text-[#FF6B5B]" />
            Exemplo de série publicada diariamente
          </div>

          <div className="mt-6 flex items-end justify-between gap-3 sm:gap-6">
            {GROWTH_POINTS.map(({ label, views }) => {
              const heightPercent = Math.max(8, (views / maxViews) * 100);
              return (
                <div key={label} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-xs font-bold text-white sm:text-sm">
                    {formatViews(views)}
                  </span>
                  <div className="flex h-32 w-full items-end sm:h-40">
                    <div
                      className="w-full rounded-t-lg bg-gradient-to-t from-[#FF6B5B] to-[#FFB84D]"
                      style={{ height: `${heightPercent}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-zinc-500">{label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <p className="mx-auto mt-4 max-w-lg text-center text-xs text-zinc-500">
          Exemplo ilustrativo de crescimento ao longo do tempo — não representa um canal real nem
          garante resultado. O desempenho depende de nicho, consistência e algoritmo de cada
          plataforma.
        </p>
      </div>
    </section>
  );
}
