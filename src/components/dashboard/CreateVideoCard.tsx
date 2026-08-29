"use client";

import { useState } from "react";
import { Wand2 } from "lucide-react";
import { useDashboard } from "./DashboardContext";

export default function CreateVideoCard() {
  const [topic, setTopic] = useState("");
  const { openWizard } = useDashboard();

  return (
    <section
      id="criar"
      className="relative scroll-mt-20 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#FF6B5B] to-[#FFB84D] p-5 sm:p-8"
    >
      <div className="pointer-events-none absolute inset-0 noise-grid opacity-20" />

      <div className="relative">
        <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
          Criar novo vídeo
        </h2>
        <p className="mt-1.5 max-w-md text-sm text-white/80">
          Descreva o tema e a IA gera roteiro, narração, legenda e edição
          automaticamente.
        </p>

        <textarea
          rows={2}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Ex.: 5 dicas para produtividade no trabalho remoto..."
          className="mt-5 w-full resize-none rounded-2xl border border-white/20 bg-black/20 px-4 py-3.5 text-sm text-white placeholder:text-white/50 backdrop-blur-sm focus:border-white/40 focus:outline-none"
        />

        <button
          type="button"
          onClick={() => openWizard({ topic })}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-zinc-900 shadow-xl shadow-black/20 transition-transform active:scale-95 sm:w-auto sm:hover:scale-[1.03]"
        >
          <Wand2 className="h-4 w-4" />
          Gerar vídeo com IA
        </button>
      </div>
    </section>
  );
}
