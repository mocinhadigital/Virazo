"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BookOpen, HelpCircle, MessageCircle, X } from "lucide-react";
import { WHATSAPP_HELP_MESSAGE, whatsappUrl } from "@/lib/contact";
import { useDashboard } from "../DashboardContext";
import { helpFor } from "./helpTexts";

// Botão pequeno (?) sempre à mão: abre um texto curto sobre a tela em que a pessoa está, com
// atalho para o guia "Como usar" e para o suporte no WhatsApp. No celular fica logo acima do
// menu de baixo.
export default function HelpButton() {
  const pathname = usePathname();
  const { openGuide, helpHidden } = useDashboard();
  // A ajuda aberta "pertence" à tela em que foi aberta: ao mudar de tela ela some sozinha.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor !== null && openFor === pathname;
  const setOpen = (value: boolean) => setOpenFor(value ? (pathname ?? "") : null);
  const help = helpFor(pathname);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenFor(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Escondido enquanto cobriria o que a pessoa escreve (a ajuda aberta continua aberta).
  return (
    <>
      {!helpHidden && (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ajuda desta tela"
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-[#141416]/95 text-white shadow-lg shadow-black/40 backdrop-blur active:scale-95 lg:bottom-6 lg:right-6"
      >
        <HelpCircle className="h-6 w-6" strokeWidth={2} />
      </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[75] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Ajuda desta tela"
        >
          <div
            className="relative w-full rounded-t-3xl border border-white/10 bg-[#141416] px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-6 sm:max-w-md sm:rounded-3xl sm:pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-zinc-500 hover:bg-white/5 hover:text-white"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">Ajuda desta tela</p>
            <h2 className="mt-1 pr-10 text-xl font-bold text-white">{help.title}</h2>
            <ul className="mt-3 flex flex-col gap-2.5">
              {help.lines.map((line) => (
                <li key={line} className="text-[15px] leading-relaxed text-zinc-300">
                  {line}
                </li>
              ))}
            </ul>

            <div className="mt-5 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  openGuide();
                }}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/15 text-[15px] font-semibold text-zinc-100 hover:bg-white/5"
              >
                <BookOpen className="h-4 w-4" />
                Ver o guia “Como usar”
              </button>
              <a
                href={whatsappUrl(WHATSAPP_HELP_MESSAGE)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-[15px] font-semibold text-white hover:bg-emerald-400"
              >
                <MessageCircle className="h-4 w-4" />
                Falar com o suporte no WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
