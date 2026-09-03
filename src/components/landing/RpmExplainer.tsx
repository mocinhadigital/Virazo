const RPM_IMAGES = [
  "/assets/rpm/rpm-1.webp",
  "/assets/rpm/rpm-2.webp",
  "/assets/rpm/rpm-3.webp",
];

export default function RpmExplainer() {
  return (
    <section className="py-10">
      <div className="mx-auto max-w-[1100px] px-6">
        <h2 className="text-left text-[48px] leading-[1.15] font-semibold text-white/90">
          O que é RPM?
        </h2>

        <p className="mt-4 max-w-[46ch] text-left text-[17px] leading-[1.6] text-white/55">
          Views viram dinheiro no Facebook, YouTube e TikTok. Essas plataformas pagam de 50
          centavos de dólar até 2 dólares por mil visualizações (o nome disso é RPM).
        </p>

        <div className="mt-12 grid gap-5 md:grid-cols-3 md:items-start">
          {RPM_IMAGES.map((src, i) => (
            <div
              key={src}
              className={`overflow-hidden rounded-[20px] border border-white/[0.08] bg-white shadow-[0_8px_40px_rgba(0,0,0,0.35)] transition-transform duration-300 hover:-translate-y-1.5 ${
                i === 1 ? "md:mt-8" : ""
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="Print de painel de monetização mostrando o RPM" className="w-full" loading="lazy" />
            </div>
          ))}
        </div>

        <p className="mt-8 text-left text-[13px] text-white/35">
          Prints reais de painéis de monetização.
        </p>
      </div>
    </section>
  );
}
