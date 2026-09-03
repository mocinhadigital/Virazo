const RPM_USD = 1.0;
const USD_TO_BRL = 5.07;

const EXAMPLES = [
  { file: "v-6-6m.webp", views: 6_600_000, brl: 33_462, usd: 6_600 },
  { file: "v-5-2m.webp", views: 5_200_000, brl: 26_364, usd: 5_200 },
  { file: "v-3-6m.webp", views: 3_600_000, brl: 18_252, usd: 3_600 },
  { file: "v-747-4k.webp", views: 747_000, brl: 3_789, usd: 747 },
];

function formatViews(views: number): string {
  if (views >= 1_000_000) {
    return `${(views / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`;
  }
  return `${Math.round(views / 1000)}K`;
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default function EarningsExamples() {
  return (
    <section className="py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-left text-[48px] leading-[1.15] font-semibold text-white/90">
          E quanto isso rende?
        </h2>
        <p className="mt-4 max-w-[46ch] text-left text-[17px] leading-[1.6] text-white/55">
          Assumindo um RPM médio de US$ 1,00, esse é o potencial de vídeos como os nossos:
        </p>

        <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {EXAMPLES.map(({ file, views, brl, usd }) => (
            <div key={file} className="card-glass overflow-hidden rounded-2xl">
              <div className="relative aspect-[9/16] w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/assets/viral/${file}`}
                  alt="Print real de vídeo com alta visualização"
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="p-3">
                <p className="text-[11px] text-zinc-500">
                  {formatViews(views)} views × {RPM_USD.toLocaleString("en-US", { style: "currency", currency: "USD" })} RPM
                </p>
                <p className="mt-1 text-base font-bold text-emerald-400 sm:text-lg">{formatBRL(brl)}</p>
                <p className="text-[11px] text-zinc-500">
                  ${usd.toLocaleString("en-US")} dólares
                </p>
              </div>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-6 max-w-xl text-center text-xs text-zinc-500">
          Estimativa com RPM médio de US$ 1,00 por mil views. O valor real varia por nicho, país e
          época do ano — e nem todo vídeo viraliza. Conversão aproximada de US$ 1,00 ={" "}
          {USD_TO_BRL.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}. Os prints de views
          acima são de canais reais.
        </p>
      </div>
    </section>
  );
}
