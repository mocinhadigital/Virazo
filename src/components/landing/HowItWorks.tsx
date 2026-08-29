import { Lightbulb, Cpu, SlidersHorizontal, Send } from "lucide-react";
import SectionHeading from "./SectionHeading";

const steps = [
  {
    icon: Lightbulb,
    number: "01",
    title: "Escolha o tema",
    description:
      "Digite uma ideia, cole um texto ou selecione um estilo pronto de vídeo.",
  },
  {
    icon: Cpu,
    number: "02",
    title: "A IA cria tudo",
    description:
      "Roteiro, narração, imagens, legendas e trilha são gerados automaticamente.",
  },
  {
    icon: SlidersHorizontal,
    number: "03",
    title: "Ajuste ao seu gosto",
    description:
      "Troque a voz, o visual ou o texto em poucos cliques, se quiser personalizar.",
  },
  {
    icon: Send,
    number: "04",
    title: "Baixe e publique",
    description:
      "Exporte no formato ideal e publique direto no Reels, TikTok ou Shorts.",
  },
];

export default function HowItWorks() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Como funciona"
          title="Quatro passos entre a ideia e o vídeo publicado"
          description="Todo o processo criativo acontece por trás — você só aprova o resultado."
        />

        <div className="relative mt-14">
          <div className="absolute left-5 top-0 hidden h-full w-px bg-gradient-to-b from-[#FF6B5B]/50 via-[#FFB84D]/50 to-transparent sm:block lg:hidden" />

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-1 lg:grid-cols-4 lg:gap-6">
            {steps.map(({ icon: Icon, number, title, description }) => (
              <div key={number} className="relative flex gap-4 lg:flex-col lg:gap-0">
                <span className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#FF6B5B] to-[#FFB84D] text-sm font-bold text-white shadow-lg shadow-[#FF6B5B]/20">
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </span>
                <div className="lg:mt-5">
                  <span className="text-xs font-semibold text-zinc-500">
                    Passo {number}
                  </span>
                  <h3 className="mt-1 text-base font-semibold text-white">
                    {title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
                    {description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
