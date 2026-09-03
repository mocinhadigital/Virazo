import SectionHeading from "./SectionHeading";

const FILES = [
  "v-32m.webp",
  "v-11-4m.webp",
  "v-1-5m.webp",
  "v-280-4k.webp",
  "v-270-7k.webp",
  "v-226-2k.webp",
  "v-205-8k.webp",
  "v-102k.webp",
  "v-64-1k.webp",
];

export default function ViralGallery() {
  const looped = [...FILES, ...FILES];

  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Exemplos reais"
          title="Nossos estilos de vídeo virais"
          description="Vídeos gerados no formato certo para viralizar — retrato, legendado, pronto pra postar."
        />
      </div>

      <div className="relative mt-8 overflow-hidden sm:mt-10">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[#05050a] to-transparent sm:w-32" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[#05050a] to-transparent sm:w-32" />

        <div className="animate-marquee flex w-max gap-4 hover:[animation-play-state:paused]">
          {looped.map((file, i) => (
            <div
              key={`${file}-${i}`}
              className="w-36 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] sm:w-44"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/assets/viral/${file}`}
                alt="Exemplo de vídeo viral gerado"
                className="aspect-[9/16] w-full object-cover"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
