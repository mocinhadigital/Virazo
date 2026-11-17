"use client";

import { useEffect, useState } from "react";
import { Clapperboard, Mic, PenLine, Sparkles, X, type LucideIcon } from "lucide-react";
import { useDashboard } from "../DashboardContext";

// Guia "Como usar": 4 telas curtas, em linguagem do dia a dia. Abre sozinho UMA vez (a conta guarda
// que já viu) e pode ser aberto de novo pelo botão "Como usar". No celular sobe de baixo (como uma
// folha); no computador fica no centro.
const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Sparkles,
    title: "Primeiro: o que você quer criar?",
    body: "Você pode criar um vídeo só (fica pronto em cerca de 1 minuto) ou uma série, que faz vídeos novos sozinha, no ritmo que você escolher.",
  },
  {
    icon: Clapperboard,
    title: "Escolha o tema e o estilo",
    body: "Diga sobre o que é o vídeo e escolha como as imagens vão parecer. É só tocar nas opções — sem complicação.",
  },
  {
    icon: PenLine,
    title: "Escreva sua história ou deixe a IA criar",
    body: "Antes de gerar, você escolhe: escrever a sua própria história ou deixar a IA criar. Você lê, muda o que quiser e só depois manda gerar.",
  },
  {
    icon: Mic,
    title: "Escolha a voz e a legenda, e gere",
    body: "Escolha quem narra e como a legenda aparece. Depois é só tocar em gerar: o vídeo fica pronto em cerca de 1 minuto e aparece em “Vídeos”.",
  },
];

export default function WelcomeGuide() {
  const { isGuideOpen } = useDashboard();
  if (!isGuideOpen) return null;
  return <GuidePanel />;
}

function GuidePanel() {
  const { closeGuide } = useDashboard();
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const Icon = step.icon;
  const isLast = index === STEPS.length - 1;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeGuide();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeGuide]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Como usar o Virazo"
    >
      <div className="relative w-full rounded-t-3xl border border-white/10 bg-[#141416] px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-6 sm:max-w-md sm:rounded-3xl sm:pb-6">
        <button
          type="button"
          onClick={closeGuide}
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-zinc-500 hover:bg-white/5 hover:text-white"
          aria-label="Fechar o guia"
        >
          <X className="h-5 w-5" />
        </button>

        <p className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
          Como usar · {index + 1} de {STEPS.length}
        </p>

        <span className="mt-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4C3BFF] to-[#A855F7]">
          <Icon className="h-7 w-7 text-white" strokeWidth={2} />
        </span>
        <h2 className="mt-4 text-2xl font-bold leading-tight text-white">{step.title}</h2>
        <p className="mt-3 text-[16px] leading-relaxed text-zinc-300">{step.body}</p>

        <div className="mt-6 flex items-center gap-1.5" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i <= index ? "bg-gradient-to-r from-[#4C3BFF] to-[#A855F7]" : "bg-white/[0.08]"}`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => (isLast ? closeGuide() : setIndex((i) => i + 1))}
          className="mt-6 inline-flex h-14 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] text-[17px] font-semibold text-white shadow-lg shadow-[#4C3BFF]/25 active:scale-[0.98]"
        >
          {isLast ? "Começar" : "Próximo"}
        </button>
        {!isLast ? (
          <button
            type="button"
            onClick={closeGuide}
            className="mt-2 inline-flex h-12 w-full items-center justify-center text-[15px] font-medium text-zinc-400 hover:text-white"
          >
            Pular
          </button>
        ) : (
          <p className="mt-3 text-center text-xs text-zinc-500">
            Para rever este guia, toque em “Como usar” no alto da tela.
          </p>
        )}
      </div>
    </div>
  );
}
