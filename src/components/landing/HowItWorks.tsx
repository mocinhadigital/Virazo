import SectionHeading from "./SectionHeading";

const IMAGE_BASE = "https://bjxfrufuuosufnhnzajc.supabase.co/storage/v1/object/public/videos/_landing-images";

const steps = [
  {
    number: "01",
    title: "Crie uma série",
    description: "Escolha o nicho, o tom de voz e o estilo visual da sua série de vídeos.",
    image: `${IMAGE_BASE}/step-1-create-series.jpg`,
  },
  {
    number: "02",
    title: "A IA gera os vídeos",
    description:
      "Roteiro, narração, visual e legendas são criados automaticamente, prontos em minutos.",
    image: `${IMAGE_BASE}/step-2-ai-generates.jpg`,
  },
  {
    number: "03",
    title: "Você revisa e posta",
    description: "Aprove o resultado, baixe o arquivo ou publique direto na sua rede favorita.",
    image: `${IMAGE_BASE}/step-3-review-post.jpg`,
  },
];

export default function HowItWorks() {
  return (
    <section id="como-funciona" className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Como funciona"
          title="Três passos entre a ideia e o vídeo publicado"
          description="Todo o processo criativo acontece por trás — você só aprova o resultado."
        />

        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {steps.map(({ number, title, description, image }) => (
            <div key={number} className="card-glass overflow-hidden rounded-2xl">
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-white/[0.02]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image}
                  alt={title}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                <span className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#FF6B5B] to-[#FFB84D] text-xs font-bold text-white shadow-lg shadow-[#FF6B5B]/25">
                  {number}
                </span>
              </div>
              <div className="p-5">
                <h3 className="text-base font-semibold text-white">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
