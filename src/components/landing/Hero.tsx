import Link from "next/link";
import LazyVideo from "./LazyVideo";

const AVATARS = [
  "/assets/avatars/avatar-1.webp",
  "/assets/avatars/avatar-2.webp",
  "/assets/avatars/avatar-3.webp",
  "/assets/avatars/avatar-4.webp",
];

export default function Hero() {
  return (
    <section id="topo" className="relative overflow-hidden pt-24 pb-20">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_50%_at_50%_0%,rgba(99,102,241,0.18)_0%,rgba(5,5,10,0)_70%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[320px] noise-grid" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Celular: texto em cima e o vídeo embaixo. Computador: texto à
            esquerda e o vídeo (em moldura de celular) à direita. */}
        <div className="grid items-center gap-14 lg:grid-cols-[1.15fr_0.85fr] lg:gap-10">
          <div className="mx-auto flex flex-col items-center text-center lg:mx-0 lg:items-start lg:text-left">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pl-2 pr-4 text-[13px] font-medium text-white/55">
              <div className="flex -space-x-2">
                {AVATARS.map((src) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={src}
                    src={src}
                    alt=""
                    className="h-6 w-6 rounded-full object-cover ring-2 ring-[#05050a]"
                  />
                ))}
              </div>
              <span>Mais de 2.000 criadores</span>
            </div>

            <h1 className="mt-8 max-w-[16ch] text-[clamp(44px,6vw,76px)] font-bold leading-[1.05] tracking-[-0.03em] text-white/92 lg:text-[clamp(44px,4.6vw,68px)]">
              Vídeos virais no piloto automático, sem precisar aparecer
            </h1>

            <p className="mt-6 max-w-[42ch] text-[17px] leading-relaxed text-white/55 md:text-[19px]">
              A IA cria seus vídeos todos os dias. Você só posta.
            </p>

            <Link
              href="/planos"
              className="mt-10 inline-flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-6 text-[15px] font-medium text-white/92 shadow-xl shadow-purple-600/25 transition-transform active:scale-95 sm:w-auto sm:hover:scale-[1.03]"
            >
              Criar meu primeiro vídeo
            </Link>

            <p className="mt-4 text-[14px] font-medium text-white/60">
              A partir de R$ 27/mês · 7 dias de garantia
            </p>

            <p className="mt-2 text-[14px] text-white/35">Seu primeiro vídeo pronto em 1 minuto.</p>
          </div>

          {/* Moldura de celular com um vídeo real do Virazo (sem som, em loop). */}
          <div className="relative mx-auto w-[min(66vw,250px)] lg:w-[290px]">
            <div className="pointer-events-none absolute -inset-8 rounded-full bg-[radial-gradient(closest-side,rgba(124,58,237,0.35),rgba(5,5,10,0))] blur-2xl" />
            <div className="relative rounded-[2.6rem] border border-white/15 bg-[#0b0b12] p-[9px] shadow-2xl shadow-purple-600/25 ring-1 ring-white/5">
              <div className="relative aspect-[9/16] overflow-hidden rounded-[2rem] bg-black">
                <LazyVideo
                  eager
                  src="/videos-exemplo/davi.mp4"
                  poster="/videos-exemplo/davi.jpg"
                  label="Exemplo de vídeo gerado pelo Virazo: Davi e Golias, em animação 3D"
                  wrapperClassName="h-full w-full"
                  className="h-full w-full object-cover"
                />
                <div className="pointer-events-none absolute left-1/2 top-2.5 h-[18px] w-[76px] -translate-x-1/2 rounded-full bg-black/90" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
