import { VISUAL_STYLES } from "@/components/dashboard/visualStyles";
import SectionHeading from "./SectionHeading";

export default function StylesCarousel() {
  // Duplica a lista pra criar um loop contínuo sem salto visível.
  const loopedStyles = [...VISUAL_STYLES, ...VISUAL_STYLES];

  return (
    <section id="estilos-visuais" className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Estilos visuais"
          title="Onze estilos, um vídeo pra cada ideia"
          description="Escolha o visual da sua série — a IA aplica o estilo em todas as cenas automaticamente."
        />
      </div>

      <div className="relative mt-10 overflow-hidden">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[#05050a] to-transparent sm:w-32" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[#05050a] to-transparent sm:w-32" />

        <div className="animate-marquee flex w-max gap-4 hover:[animation-play-state:paused]">
          {loopedStyles.map(({ name, thumbnail }, i) => (
            <div
              key={`${name}-${i}`}
              className="w-32 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] sm:w-40"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbnail}
                alt={name}
                className="aspect-[3/4] w-full object-cover"
                loading="lazy"
              />
              <span className="block px-2.5 py-2 text-center text-xs font-medium text-white">
                {name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
