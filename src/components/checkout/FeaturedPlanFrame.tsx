import type { ReactNode } from "react";
import { FEATURED_BADGE } from "@/lib/billing/planHighlight";

// Moldura do plano recomendado: selo "MAIS RECOMENDADO" em cima e borda em
// gradiente roxo/rosa/laranja (as cores do Virazo). O cartão de dentro precisa
// ter fundo opaco e cantos 2px menores que `radiusClass` — assim o gradiente
// aparece só como borda.
export default function FeaturedPlanFrame({
  children,
  className = "",
  radiusClass = "rounded-[22px]",
}: {
  children: ReactNode;
  className?: string;
  radiusClass?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-[#A855F7] via-[#EC4899] to-[#F97316] px-3.5 py-1 text-[11px] font-extrabold tracking-wider text-white shadow-lg shadow-pink-500/30">
        {FEATURED_BADGE}
      </span>
      <div
        className={`h-full bg-gradient-to-br from-[#A855F7] via-[#EC4899] to-[#F97316] p-[2px] shadow-[0_0_44px_-12px_rgba(236,72,153,0.55)] ${radiusClass}`}
      >
        {children}
      </div>
    </div>
  );
}
