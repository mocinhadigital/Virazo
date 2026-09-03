import Link from "next/link";
import { Wand2 } from "lucide-react";

const AVATARS = [
  "/assets/avatars/avatar-1.webp",
  "/assets/avatars/avatar-2.webp",
  "/assets/avatars/avatar-3.webp",
  "/assets/avatars/avatar-4.webp",
];

export default function Hero() {
  return (
    <section id="topo" className="relative overflow-hidden pt-20 pb-24 sm:pt-28">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_50%_at_50%_0%,rgba(99,102,241,0.18)_0%,rgba(5,5,10,0)_70%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[320px] noise-grid" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pl-2 pr-4 text-sm font-medium text-zinc-300">
            <div className="flex -space-x-2">
              {AVATARS.map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={src}
                  src={src}
                  alt=""
                  className="h-7 w-7 rounded-full object-cover ring-2 ring-[#05050a]"
                />
              ))}
            </div>
            <span>Mais de 2.000 criadores</span>
          </div>

          <h1 className="mt-8 max-w-[960px] text-5xl font-extrabold leading-[0.95] tracking-tight text-white sm:text-6xl lg:text-[72px]">
            Vídeos virais no piloto
            <br />
            automático, sem
            <br />
            precisar aparecer
          </h1>

          <p className="mt-6 max-w-xl text-base leading-snug text-zinc-400 sm:text-lg">
            A IA cria seus vídeos todos os dias. Você só posta.
          </p>

          <Link
            href="/login?mode=signup"
            className="mt-10 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 px-8 py-4 text-base font-semibold text-white shadow-xl shadow-purple-600/25 transition-transform active:scale-95 sm:w-auto sm:hover:scale-[1.03]"
          >
            <Wand2 className="h-5 w-5" />
            Criar meu primeiro vídeo
          </Link>

          <p className="mt-4 text-xs text-zinc-500">
            Seu primeiro vídeo pronto em menos de 5 minutos.
          </p>
        </div>
      </div>
    </section>
  );
}
