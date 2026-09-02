import SectionHeading from "./SectionHeading";

const PLATFORMS = ["Facebook", "YouTube", "TikTok"];
const RPM_MIN = 0.5;
const RPM_MAX = 2.0;
const SCALE_MAX = 2.5;

export default function RpmExplainer() {
  const minPercent = (RPM_MIN / SCALE_MAX) * 100;
  const widthPercent = ((RPM_MAX - RPM_MIN) / SCALE_MAX) * 100;

  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Entenda o RPM"
          title="O que é RPM?"
          description="RPM é a receita que uma plataforma paga a cada mil visualizações monetizadas do seu vídeo."
        />

        <p className="mx-auto mt-6 max-w-2xl text-center text-sm leading-relaxed text-zinc-400">
          Facebook, YouTube e TikTok transformam visualizações em dinheiro através de anúncios
          exibidos nos vídeos. Cada plataforma paga uma faixa diferente, geralmente entre{" "}
          <span className="font-semibold text-white">US$ 0,50 e US$ 2,00 por mil views</span>,
          variando de acordo com nicho, idioma e país da audiência.
        </p>

        <div className="card-glass mx-auto mt-10 flex max-w-lg flex-col gap-5 rounded-2xl p-6">
          {PLATFORMS.map((platform) => (
            <div key={platform} className="flex items-center gap-4">
              <span className="w-16 shrink-0 text-xs font-medium text-zinc-400">{platform}</span>
              <div className="relative h-2 flex-1 rounded-full bg-white/[0.06]">
                <div
                  className="absolute h-2 rounded-full bg-gradient-to-r from-[#FF6B5B] to-[#FFB84D]"
                  style={{ left: `${minPercent}%`, width: `${widthPercent}%` }}
                />
              </div>
              <span className="w-24 shrink-0 text-right text-xs font-medium text-zinc-300">
                $0,50 – $2,00
              </span>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-4 max-w-lg text-center text-xs text-zinc-500">
          Faixa aproximada por mil visualizações monetizadas — varia por nicho, idioma e
          audiência.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {["rpm-1.webp", "rpm-2.webp", "rpm-3.webp"].map((file) => (
            <div key={file} className="overflow-hidden rounded-2xl border border-white/10 bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/assets/rpm/${file}`}
                alt="Print de painel de monetização mostrando o RPM"
                className="w-full rounded-lg"
                loading="lazy"
              />
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-zinc-500">Prints reais de painéis de monetização.</p>
      </div>
    </section>
  );
}
