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
  return (
    <section className="overflow-hidden py-10 sm:py-14">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-left text-lg font-semibold text-white sm:text-xl">
          Nossos estilos de vídeo virais
        </h2>
        <ChevronDown className="mt-1.5 h-4 w-4 text-zinc-600" />
      </div>

      <div className="relative mt-4 sm:mt-5">
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-[#05050a] to-transparent sm:w-24" />

        <div className="mx-auto max-w-6xl pl-4 sm:pl-6 lg:pl-8">
          <div className="scrollbar-none flex gap-3 overflow-x-auto pb-1">
            {FILES.map((file) => (
              <div
                key={file}
                className="w-44 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] sm:w-56 lg:w-64"
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
            <div className="w-1 shrink-0 sm:w-2" aria-hidden="true" />
          </div>
        </div>
      </div>
    </section>
  );
}
