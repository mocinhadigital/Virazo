import Link from "next/link";
import VslPlayer from "./VslPlayer";

// Vídeo de vendas logo abaixo da apresentação (Hero). O botão leva à página
// de planos — mesmo destino dos outros botões principais da landing.
export default function VslSection() {
  return (
    <section id="video" className="pb-16 sm:pb-24">
      <div className="mx-auto max-w-[960px] px-5 md:px-6">
        <h2 className="text-center text-[clamp(26px,3.6vw,38px)] font-bold leading-[1.15] tracking-[-0.02em] text-white/92">
          Veja o Virazo em ação antes de assinar
        </h2>

        <div className="relative mt-8 sm:mt-10">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-3 rounded-[28px] bg-gradient-to-r from-blue-600/25 to-purple-600/25 blur-2xl sm:-inset-5"
          />
          <div className="relative">
            <VslPlayer src="/assets/vsl/virazo-vsl.mp4" poster="/assets/vsl/virazo-vsl-poster.jpg" />
          </div>
        </div>

        <div className="mt-8 flex justify-center sm:mt-10">
          <Link
            href="/planos"
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-8 text-[15px] font-semibold text-white shadow-xl shadow-purple-600/25 transition-transform active:scale-95 sm:w-auto sm:hover:scale-[1.03]"
          >
            Conhecer os planos e começar
          </Link>
        </div>
      </div>
    </section>
  );
}
