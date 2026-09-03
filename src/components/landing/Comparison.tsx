import Link from "next/link";
import { Check, Wand2 } from "lucide-react";
import SectionHeading from "./SectionHeading";

const OPTIONS = [
  {
    title: "Contratar um editor",
    highlight: false,
    points: ["R$ 100 a R$ 300 por vídeo", "Depende de outra pessoa, prazo e retrabalho"],
  },
  {
    title: "Fazer você mesmo",
    highlight: false,
    points: ["Roteiro, narração, edição, thumbnail e postagem", "Todo dia, sem parar"],
  },
  {
    title: "Virazo",
    highlight: true,
    points: ["Você escolhe o nicho", "A IA faz toda a criação pra você"],
  },
];

export default function Comparison() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Comparativo"
          title="Compare as opções"
          description="Compare o custo e o esforço de cada caminho."
        />

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {OPTIONS.map(({ title, highlight, points }) => (
            <div
              key={title}
              className={`rounded-2xl border p-6 ${
                highlight
                  ? "border-[#FF6B5B]/40 bg-gradient-to-br from-[#FF6B5B]/10 to-[#FFB84D]/10"
                  : "card-glass"
              }`}
            >
              <h3 className={`text-base font-semibold ${highlight ? "text-white" : "text-zinc-200"}`}>
                {title}
              </h3>
              <ul className="mt-4 flex flex-col gap-2.5">
                {points.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-sm text-zinc-400">
                    <Check
                      className={`mt-0.5 h-4 w-4 shrink-0 ${highlight ? "text-[#FF6B5B]" : "text-zinc-600"}`}
                    />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex justify-center">
          <Link
            href="/login?mode=signup"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#FF6B5B] to-[#FFB84D] px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-[#FF6B5B]/25 transition-transform active:scale-95 sm:hover:scale-[1.03]"
          >
            <Wand2 className="h-4 w-4" />
            Criar meu primeiro vídeo
          </Link>
        </div>
      </div>
    </section>
  );
}
