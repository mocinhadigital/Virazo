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
    <section className="pt-0 pb-10 sm:pb-14">
      <div className="mx-auto flex max-w-6xl flex-col items-start px-4 sm:px-6 lg:px-8">
        <h2 className="text-left text-[15px] font-semibold text-white/90">
          Nossos estilos de vídeo virais
        </h2>
        <svg
          viewBox="0 0 48 60"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className="mt-2 h-11 w-11 text-white/35"
        >
          <path d="M20 8C15 24 33 30 24 48" />
          <path d="M15 40l9 9 9-9" />
        </svg>
      </div>

      <div className="relative mt-5 overflow-hidden">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-[#05050a] to-transparent sm:w-24" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-[#05050a] to-transparent sm:w-24" />

        <div className="animate-marquee flex w-max gap-3 hover:[animation-play-state:paused]">
          {looped.map((file, i) => (
            <div
              key={`${file}-${i}`}
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
        </div>
      </div>
    </section>
  );
}
