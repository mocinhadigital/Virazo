"use client";

import type { ReactNode } from "react";
import { Loader2, X } from "lucide-react";

export type StoryChoiceOption = {
  id: string;
  emoji: string;
  title: string;
  description: string;
  onPick: () => void;
  // Destaque (a opção que o cliente já tem pronta, por exemplo).
  highlight?: boolean;
};

// A pergunta que vem ANTES de qualquer geração: "qual história você quer?". Opções grandes, uma
// embaixo da outra (boas para o dedo no celular). Nunca se gera uma história sem a pessoa ter
// escolhido aqui.
export default function StoryChoiceDialog({
  title = "Qual história você quer usar?",
  subtitle = "Escolha uma opção. Você lê a história antes de o vídeo ser feito.",
  options,
  busy = false,
  busyText = "Preparando…",
  notice,
  error,
  onClose,
}: {
  title?: string;
  subtitle?: string;
  options: StoryChoiceOption[];
  busy?: boolean;
  busyText?: string;
  notice?: ReactNode;
  error?: string | null;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={busy ? undefined : onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="relative w-full rounded-t-3xl border border-white/10 bg-[#141416] px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-6 sm:max-w-lg sm:rounded-3xl sm:px-6 sm:pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-zinc-500 hover:bg-white/5 hover:text-white disabled:opacity-40"
          aria-label="Fechar"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 className="pr-10 text-2xl font-bold leading-tight text-white">{title}</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-zinc-400">{subtitle}</p>

        {error && (
          <div className="mt-4 rounded-xl border border-red-400/30 bg-red-400/[0.08] px-3.5 py-2.5 text-sm font-medium text-red-300">
            {error}
          </div>
        )}
        {notice}

        <div className="mt-5 flex flex-col gap-3">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={option.onPick}
              disabled={busy}
              className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition-colors active:scale-[0.99] disabled:opacity-60 ${
                option.highlight
                  ? "border-[#4C3BFF]/60 bg-white/[0.07]"
                  : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
              }`}
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-2xl" aria-hidden="true">
                {option.emoji}
              </span>
              <span className="min-w-0">
                <span className="block text-[17px] font-semibold leading-snug text-white">{option.title}</span>
                <span className="mt-0.5 block text-[14px] leading-snug text-zinc-400">{option.description}</span>
              </span>
            </button>
          ))}
        </div>

        {busy && (
          <p className="mt-4 flex items-center justify-center gap-2 text-sm text-zinc-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            {busyText}
          </p>
        )}
      </div>
    </div>
  );
}
