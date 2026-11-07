"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { useDashboard } from "../DashboardContext";

const STORAGE_KEY = "virazo:realistic-notified";

function readNotified(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeNotified(ids: Set<string>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids].slice(-200)));
  } catch {
    // sem armazenamento: o aviso pode repetir, nunca quebra
  }
}

// Aviso flutuante (celular e computador) que aparece UMA vez por vídeo normal
// que acabou de ficar pronto. Vídeos de série e vídeos já prontos ao abrir a
// página não disparam. Se o assistente do vídeo está aberto, o aviso aparece na
// tela "Vídeo pronto!" dele, então aqui só marca como visto.
export default function RealisticPostVideoNotice() {
  const { videos, isWizardOpen, openRealisticBuy } = useDashboard();
  const [visible, setVisible] = useState(false);
  const seen = useRef<Map<string, string> | null>(null);
  const wizardOpen = useRef(isWizardOpen);

  useEffect(() => {
    wizardOpen.current = isWizardOpen;
  }, [isWizardOpen]);

  useEffect(() => {
    const previous = seen.current;
    const next = new Map(videos.map((v) => [v.id, v.status]));
    seen.current = next;
    if (!previous) return; // primeira leitura: só registra o que já existia

    const notified = readNotified();
    let fire = false;
    for (const v of videos) {
      if (v.status !== "Pronto" || v.seriesId || v.id.startsWith("temp-")) continue;
      if (previous.get(v.id) === "Pronto" || notified.has(v.id)) continue;
      // Novo (nunca visto) ou que acabou de virar Pronto.
      notified.add(v.id);
      fire = true;
    }
    if (fire) {
      writeNotified(notified);
      if (!wizardOpen.current) setVisible(true);
    }
  }, [videos]);

  if (!visible) return null;
  return (
    <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 sm:bottom-6 sm:justify-end sm:px-6">
      <div className="flex w-full max-w-sm items-start gap-3 rounded-2xl border border-amber-300/25 bg-[#12101f] p-4 shadow-2xl shadow-black/50">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">Seu vídeo está pronto! ✅</p>
          <p className="mt-1 text-xs leading-snug text-zinc-300">
            Quer um com pessoas e cenas de verdade se movendo? Conheça o{" "}
            <strong className="text-amber-200">Vídeo Realista ✨</strong>.
          </p>
          <button
            type="button"
            onClick={() => {
              setVisible(false);
              openRealisticBuy();
            }}
            className="mt-3 inline-flex rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-4 py-2 text-xs font-semibold text-white"
          >
            Ver exemplos e comprar
          </button>
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          aria-label="Fechar aviso"
          className="shrink-0 text-zinc-500 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
