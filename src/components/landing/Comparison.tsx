import Link from "next/link";

const OPTIONS = [
  {
    title: "Contratar um editor",
    highlight: false,
    text: "R$ 100 a R$ 300 por vídeo. Depende de outra pessoa, prazo e retrabalho.",
  },
  {
    title: "Fazer você mesmo",
    highlight: false,
    text: "Roteiro, narração, edição, thumbnail e postagem. Todo dia, sem parar.",
  },
  {
    title: "Virazo",
    highlight: true,
    text: "Você escolhe o nicho. A IA faz toda a criação pra você.",
  },
];

export default function Comparison() {
  return (
    <section className="py-10">
      <div className="mx-auto max-w-[1100px] px-6">
        <div className="grid gap-4 md:grid-cols-3 md:gap-5">
          {OPTIONS.map(({ title, highlight, text }) => (
            <div
              key={title}
              className={`h-full rounded-[20px] p-7 ${
                highlight
                  ? "border border-white/15 bg-white/[0.04] shadow-[0_0_60px_rgba(255,255,255,0.06)]"
                  : "border border-red-500/10 bg-[#140c0d]"
              }`}
            >
              <h3
                className={`text-[17px] font-semibold ${
                  highlight ? "text-white/90" : "text-red-400/60"
                }`}
              >
                {title}
              </h3>
              <p
                className={`mt-3 text-[15px] leading-relaxed ${
                  highlight ? "text-white/90" : "text-white/35"
                }`}
              >
                {text}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-20 flex justify-center px-5">
        <Link
          href="/login?mode=signup"
          className="inline-flex h-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#4C3BFF] to-[#A855F7] px-6 text-[15px] font-medium text-white"
        >
          Criar meu primeiro vídeo
        </Link>
      </div>
    </section>
  );
}
