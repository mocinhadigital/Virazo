"use client";

import { BookOpen } from "lucide-react";
import { useDashboard } from "../DashboardContext";

// Botão fixo "Como usar" (no alto da tela): reabre o guia de boas-vindas quando a pessoa quiser.
export default function ComoUsarButton() {
  const { openGuide } = useDashboard();
  return (
    <button
      type="button"
      onClick={openGuide}
      className="inline-flex h-10 items-center gap-1.5 rounded-full border border-white/15 px-3.5 text-[13px] font-semibold text-zinc-200 hover:bg-white/5 hover:text-white"
    >
      <BookOpen className="h-4 w-4" />
      Como usar
    </button>
  );
}
