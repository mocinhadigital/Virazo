import Link from "next/link";

const AVATARS = [
  "/assets/avatars/avatar-1.webp",
  "/assets/avatars/avatar-2.webp",
  "/assets/avatars/avatar-3.webp",
  "/assets/avatars/avatar-4.webp",
];

export default function Hero() {
  return (
    <section id="topo" className="relative overflow-hidden pt-20 pb-20">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_50%_at_50%_0%,rgba(99,102,241,0.18)_0%,rgba(5,5,10,0)_70%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[320px] noise-grid" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex flex-col items-center text-center">
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

          <h1 className="mt-8 max-w-[16ch] text-[clamp(44px,6vw,76px)] font-bold leading-[1.05] tracking-[-0.03em] text-white/92">
            Vídeos virais no piloto automático, sem precisar aparecer
          </h1>

          <p className="mt-6 max-w-[42ch] text-[17px] leading-relaxed text-white/55 md:text-[19px]">
            A IA cria seus vídeos todos os dias. Você só posta.
          </p>

          <Link
            href="/login?mode=signup"
            className="mt-10 inline-flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-6 text-[15px] font-medium text-white/92 shadow-xl shadow-purple-600/25 transition-transform active:scale-95 sm:w-auto sm:hover:scale-[1.03]"
          >
            Criar meu primeiro vídeo
          </Link>

          <p className="mt-4 text-[14px] text-white/35">
            Seu primeiro vídeo pronto em menos de 5 minutos.
          </p>
        </div>
      </div>
    </section>
  );
}
