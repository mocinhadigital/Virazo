import { Play } from "lucide-react";
import SectionHeading from "./SectionHeading";

const VIDEOS = [
  { file: "v-32m.webp", views: "32M", pinned: true },
  { file: "v-11-4m.webp", views: "11,4M", pinned: false },
  { file: "v-1-5m.webp", views: "1,5M", pinned: false },
  { file: "v-280-4k.webp", views: "280,4K", pinned: false },
  { file: "v-270-7k.webp", views: "270,7K", pinned: false },
  { file: "v-226-2k.webp", views: "226,2K", pinned: false },
  { file: "v-205-8k.webp", views: "205,8K", pinned: false },
  { file: "v-102k.webp", views: "102K", pinned: false },
  { file: "v-64-1k.webp", views: "64,1K", pinned: false },
];

export default function ViralGallery() {
  const looped = [...VIDEOS, ...VIDEOS];

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
          {looped.map(({ file, views, pinned }, i) => (
            <div
              key={`${file}-${i}`}
              className="relative w-36 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] sm:w-44"
            >
              {pinned && (
                <span className="absolute left-2 top-2 z-10 rounded-md bg-[#FF6B5B] px-2 py-0.5 text-[10px] font-bold text-white">
                  Fixado
                </span>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/assets/viral/${file}`}
                alt="Exemplo de vídeo viral gerado"
                className="aspect-[9/16] w-full object-cover"
                loading="lazy"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
              <div className="absolute bottom-2 left-2 flex items-center gap-1 text-xs font-semibold text-white">
                <Play className="h-3 w-3 fill-white" />
                {views}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
