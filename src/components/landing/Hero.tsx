import Link from "next/link";
import { Star, Wand2 } from "lucide-react";

const avatarGradients = [
  "from-amber-400 to-orange-500",
  "from-emerald-400 to-teal-500",
  "from-sky-400 to-blue-500",
  "from-orange-400 to-rose-500",
];

export default function Hero() {
  return (
    <section id="topo" className="relative overflow-hidden pt-10 pb-16 sm:pt-16 sm:pb-20">
      <div className="pointer-events-none absolute inset-0 bg-radial-fade" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[320px] noise-grid" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-md flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1 pl-1.5 pr-3 text-xs font-medium text-zinc-300">
            <div className="flex -space-x-1.5">
              {avatarGradients.map((gradient, i) => (
                <span
                  key={i}
                  className={`h-5 w-5 rounded-full bg-gradient-to-br ${gradient} ring-2 ring-[#05050a]`}
                />
              ))}
            </div>
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              4,9 · +12 mil criadores
            </span>
          </div>

          <h1 className="mt-5 text-[2.5rem] font-bold leading-[1.05] tracking-tight text-white sm:text-5xl">
            Vídeos virais,
            <br />
            <span className="text-gradient">sem você aparecer</span>
          </h1>

          <p className="mt-4 max-w-[300px] text-sm leading-snug text-zinc-400 sm:max-w-sm sm:text-base">
            Roteiro, narração, legenda e edição gerados por IA — pronto pra
            postar em minutos.
          </p>

          <Link
            href="/login?mode=signup"
            className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#FF6B5B] to-[#FFB84D] px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-[#FF6B5B]/25 transition-transform active:scale-95 sm:w-auto sm:hover:scale-[1.03]"
          >
            <Wand2 className="h-4 w-4" />
            Criar meu vídeo grátis
          </Link>

          <p className="mt-3 text-xs text-zinc-500">
            Grátis para começar · sem cartão de crédito
          </p>
        </div>
      </div>
    </section>
  );
}
