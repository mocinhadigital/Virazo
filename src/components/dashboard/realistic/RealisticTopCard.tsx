"use client";

import { Sparkles } from "lucide-react";
import { useDashboard } from "../DashboardContext";
import { REALISTIC_EXAMPLES } from "./realisticExamples";

// Card fixo no topo do /dashboard: apresenta o Vídeo Realista ✨ (produto
// avulso) a quem já está logado. Sempre visível.
export default function RealisticTopCard() {
  const { realisticCredits, openRealisticBuy, openRealisticWizard } = useDashboard();

  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-amber-300/20 bg-gradient-to-br from-[#4C3BFF]/15 via-[#A855F7]/10 to-amber-300/10 p-4 sm:p-5">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-300/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-200">
            <Sparkles className="h-3.5 w-3.5" />
            Novo
          </span>
          <h2 className="mt-2 text-lg font-bold leading-tight text-white sm:text-xl">Novo: Vídeo Realista ✨</h2>
          <p className="mt-1 text-sm text-zinc-300">Vídeos com pessoas e cenas de verdade se movendo.</p>
          <p className="mt-2 text-xs text-zinc-400">
            Seus créditos realistas: <strong className="text-white">{realisticCredits}</strong>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openRealisticBuy}
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#4C3BFF]/25"
            >
              Ver exemplos e comprar
            </button>
            {realisticCredits > 0 && (
              <button
                type="button"
                onClick={openRealisticWizard}
                className="inline-flex items-center justify-center rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-white/5"
              >
                Criar vídeo realista
              </button>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5" aria-hidden="true">
          {REALISTIC_EXAMPLES.map((example, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={example.src}
              src={example.poster}
              alt=""
              loading="lazy"
              className={`aspect-[9/16] w-12 rounded-lg object-cover ring-1 ring-white/10 sm:w-16 ${i === 2 ? "hidden sm:block" : ""}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
