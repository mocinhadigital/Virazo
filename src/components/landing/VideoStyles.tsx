import {
  Flame,
  BookOpen,
  Newspaper,
  ShoppingBag,
  Laugh,
  HeartPulse,
} from "lucide-react";
import SectionHeading from "./SectionHeading";

const styles = [
  {
    icon: Flame,
    title: "Motivacional",
    description: "Frases de impacto com narração envolvente para engajar.",
    gradient: "from-orange-500 to-rose-500",
  },
  {
    icon: BookOpen,
    title: "Storytelling",
    description: "Histórias curtas com ritmo pensado para prender atenção.",
    gradient: "from-slate-500 to-blue-700",
  },
  {
    icon: Newspaper,
    title: "Curiosidades",
    description: "Fatos e notícias transformados em vídeos rápidos.",
    gradient: "from-sky-400 to-blue-500",
  },
  {
    icon: ShoppingBag,
    title: "Marketing de produto",
    description: "Vitrines de produto com copy persuasiva automática.",
    gradient: "from-emerald-400 to-teal-500",
  },
  {
    icon: Laugh,
    title: "Humor & memes",
    description: "Conteúdo leve com timing de piada gerado pela IA.",
    gradient: "from-yellow-400 to-lime-500",
  },
  {
    icon: HeartPulse,
    title: "Bem-estar",
    description: "Dicas de saúde e mente com tom calmo e acolhedor.",
    gradient: "from-rose-400 to-orange-400",
  },
];

export default function VideoStyles() {
  return (
    <section id="estilos" className="py-14 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Estilos prontos"
          title="Um vídeo para cada tipo de conteúdo"
          description="Escolha um estilo e a IA adapta roteiro, voz e ritmo automaticamente para o seu nicho."
        />

        <div className="mt-8 grid grid-cols-2 gap-3 sm:mt-10 sm:gap-4 lg:grid-cols-3">
          {styles.map(({ icon: Icon, title, description, gradient }) => (
            <div
              key={title}
              className="card-glass group rounded-2xl p-4 transition-colors hover:bg-white/[0.05] sm:p-5"
            >
              <span
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br sm:h-11 sm:w-11 sm:rounded-xl ${gradient}`}
              >
                <Icon className="h-4 w-4 text-white sm:h-5 sm:w-5" strokeWidth={2} />
              </span>
              <h3 className="mt-3 text-sm font-semibold text-white sm:mt-4 sm:text-base">
                {title}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400 sm:mt-1.5 sm:text-sm">
                {description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
