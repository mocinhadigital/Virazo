import { ChevronDown } from "lucide-react";

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
    <section className="py-12 sm:py-16">
      <div className="mx-auto max-w-6xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="text-lg font-semibold text-white sm:text-xl">
          Nossos estilos de vídeo virais
        </h2>
        <ChevronDown className="mx-auto mt-2 h-4 w-4 text-zinc-600" />
      </div>

      <div className="relative mt-6 overflow-hidden sm:mt-8">
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
