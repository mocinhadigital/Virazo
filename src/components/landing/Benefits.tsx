import {
  UserX,
  Zap,
  AudioLines,
  Captions,
  Smartphone,
  Infinity as InfinityIcon,
} from "lucide-react";
import SectionHeading from "./SectionHeading";

const benefits = [
  {
    icon: UserX,
    title: "Você nunca aparece",
    description:
      "Sem gravar, sem mostrar o rosto. A IA cuida de toda a parte visual.",
  },
  {
    icon: Zap,
    title: "Do texto ao vídeo em minutos",
    description:
      "Diga o tema e receba um vídeo completo pronto para publicar.",
  },
  {
    icon: AudioLines,
    title: "Vozes realistas com IA",
    description:
      "Narração natural em português, com escolha de tom e sotaque.",
  },
  {
    icon: Captions,
    title: "Legendas automáticas",
    description:
      "Legendas sincronizadas e estilizadas geradas sem esforço manual.",
  },
  {
    icon: Smartphone,
    title: "Formato certo pra cada rede",
    description:
      "Exportação otimizada para Reels, TikTok, Shorts e Stories.",
  },
  {
    icon: InfinityIcon,
    title: "Volume ilimitado de ideias",
    description:
      "Gere quantos vídeos quiser sem depender de roteirista ou editor.",
  },
];

export default function Benefits() {
  return (
    <section className="border-y border-white/[0.06] bg-white/[0.015] py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Por que a Virazo"
          title="Toda a produção, sem o trabalho de produzir"
          description="Menos tempo na edição, mais tempo publicando o que realmente engaja."
        />

        <div className="mt-12 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex items-start gap-4">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                <Icon className="h-5 w-5 text-[#4C3BFF]" strokeWidth={2} />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-white sm:text-base">
                  {title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                  {description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
