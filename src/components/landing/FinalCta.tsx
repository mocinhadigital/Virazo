import Link from "next/link";
import { Wand2 } from "lucide-react";

export default function FinalCta() {
  return (
    <section className="px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
      <div className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#FF6B5B] to-[#FFB84D] px-6 py-14 text-center sm:px-12 sm:py-16">
        <div className="pointer-events-none absolute inset-0 noise-grid opacity-30" />

        <div className="relative">
          <h2 className="mx-auto max-w-xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Seu próximo vídeo viral já pode estar pronto em minutos
          </h2>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-white/85 sm:text-base">
            Comece grátis e veja a IA da Virazo criar um vídeo completo sem
            você precisar aparecer, gravar ou editar nada.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/login?mode=signup"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-zinc-900 shadow-xl shadow-black/20 transition-transform active:scale-95 sm:w-auto sm:hover:scale-[1.03]"
            >
              <Wand2 className="h-4 w-4" />
              Começar agora gratuitamente
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
