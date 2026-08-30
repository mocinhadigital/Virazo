import { TrendingUp } from "lucide-react";
import SectionHeading from "./SectionHeading";

const RPM_USD = 1.0;
const USD_TO_BRL = 5.0;

const ASSET_BASE = "https://bjxfrufuuosufnhnzajc.supabase.co/storage/v1/object/public/videos/_landing-images";

const EXAMPLES = [
  {
    niche: "Curiosidades históricas",
    views: 6_600_000,
    gradient: "from-cyan-400 to-blue-600",
    poster: `${ASSET_BASE}/earnings-historia.jpg`,
    video: `${ASSET_BASE}/earnings-historia.mp4`,
  },
  {
    niche: "Motivacional diário",
    views: 2_100_000,
    gradient: "from-orange-500 to-rose-500",
    poster: `${ASSET_BASE}/earnings-motivacional.jpg`,
    video: `${ASSET_BASE}/earnings-motivacional.mp4`,
  },
  {
    niche: "Receitas rápidas",
    views: 850_000,
    gradient: "from-emerald-400 to-teal-500",
    poster: `${ASSET_BASE}/earnings-receitas.jpg`,
    video: `${ASSET_BASE}/earnings-receitas.mp4`,
  },
];

function formatViews(views: number): string {
  if (views >= 1_000_000) {
    return `${(views / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`;
  }
  return `${Math.round(views / 1000)} mil`;
}

function formatUSD(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default function EarningsExamples() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Potencial de ganho"
          title="E quanto isso rende?"
          description="Plataformas como Facebook, YouTube e TikTok pagam por visualização monetizada — veja alguns exemplos."
        />

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {EXAMPLES.map(({ niche, views, gradient, poster, video }) => {
            const usd = views * (RPM_USD / 1000);
            const brl = usd * USD_TO_BRL;
            return (
              <div key={niche} className="card-glass overflow-hidden rounded-2xl">
                <div className={`relative aspect-[9/16] w-full bg-gradient-to-br ${gradient}`}>
                  <video
                    src={video}
                    poster={poster}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/10" />
                  <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                    <TrendingUp className="h-3 w-3" />
                    {formatViews(views)} views
                  </span>
                </div>
                <div className="p-4">
                  <h3 className="text-sm font-semibold text-white">{niche}</h3>
                  <p className="mt-2 text-xs text-zinc-500">
                    {formatViews(views)} views × {formatUSD(RPM_USD)} RPM
                  </p>
                  <p className="mt-1 text-xl font-bold text-white">
                    ≈ {formatBRL(brl)}
                    <span className="ml-1.5 text-xs font-medium text-zinc-500">
                      ({formatUSD(usd)})
                    </span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mx-auto mt-6 max-w-xl text-center text-xs text-zinc-500">
          Exemplos ilustrativos — resultados reais variam por nicho, plataforma, região e volume
          de audiência. Não representam garantia de ganhos.
        </p>
      </div>
    </section>
  );
}
