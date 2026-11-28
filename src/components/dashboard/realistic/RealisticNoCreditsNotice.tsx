"use client";

import { Sparkles } from "lucide-react";
import { useDashboard } from "../DashboardContext";

// Texto único (também usado no servidor, ver lib/realistic/seriesGate.ts).
export const REALISTIC_NO_CREDITS_TEXT =
  "O Vídeo Realista é vendido à parte do seu plano. Você precisa de créditos realistas para usar este estilo.";

// Aviso simples para quem escolheu Vídeo Realista sem créditos. "Ver pacotes" abre a compra.
// "Usar vídeo normal" só aparece se a tela souber voltar ao normal (onUseNormal) e a conta tiver
// plano: conta só de Vídeo Realista (sem plano) vê apenas "Ver pacotes".
export default function RealisticNoCreditsNotice({
  onUseNormal,
  normalLabel = "Usar vídeo normal",
  className = "",
}: {
  onUseNormal?: () => void;
  normalLabel?: string;
  className?: string;
}) {
  const { openRealisticBuy, realisticOnly } = useDashboard();
  const showNormal = !!onUseNormal && !realisticOnly;
  return (
    <div
      role="alert"
      className={`rounded-2xl border border-amber-300/30 bg-amber-300/[0.08] p-4 text-[14px] leading-relaxed text-amber-50 ${className}`}
    >
      <p>{REALISTIC_NO_CREDITS_TEXT}</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={openRealisticBuy}
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-5 text-sm font-semibold text-white"
        >
          <Sparkles className="h-4 w-4" />
          Ver pacotes
        </button>
        {showNormal && (
          <button
            type="button"
            onClick={onUseNormal}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-white/20 px-5 text-sm font-semibold text-white hover:bg-white/5"
          >
            {normalLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// O mesmo aviso numa janela, para quando o cliente toca em "Gerar" ou "Ligar automático"
// numa série Realista sem créditos (ou quando o servidor devolve a falta de créditos).
export function RealisticNoCreditsModal({
  onClose,
  onUseNormal,
  normalLabel,
}: {
  onClose: () => void;
  onUseNormal?: () => void;
  normalLabel?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <RealisticNoCreditsNotice
          className="bg-[#14110a]"
          normalLabel={normalLabel}
          onUseNormal={
            onUseNormal
              ? () => {
                  onClose();
                  onUseNormal();
                }
              : undefined
          }
        />
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-full py-2.5 text-sm font-medium text-white/60 hover:text-white"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
