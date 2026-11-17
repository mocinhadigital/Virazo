"use client";

import { useState, type ReactNode } from "react";
import { Loader2, RefreshCw, X } from "lucide-react";
import {
  checkScriptWords,
  countWords,
  scenesToParagraphs,
  type ScriptPayload,
} from "@/lib/script/limits";

export type DialogScript = {
  title: string;
  source: "ai" | "custom";
  scenes: { narration: string; imagePrompt: string }[];
};

// Quadro "ROTEIRO DO VÍDEO" (mesmo desenho do AutoShortz):
//  - leitura: o roteiro em parágrafos + "Gerar com este roteiro" + "Editar roteiro";
//  - edição: UMA caixa de texto com o contador de palavras e a faixa da duração + "Salvar e gerar" e "Voltar".
// Escrever, editar e refazer o roteiro não gastam nada do limite de vídeos: quem gasta é a
// geração, que só começa quando o cliente clica no botão principal.
export default function ScriptDialog({
  duration,
  script,
  loading = false,
  loadingText = "Escrevendo o roteiro…",
  error = null,
  notice = null,
  busy = false,
  busyText = "Preparando…",
  startInEdit = false,
  generateLabel = "Gerar com esta história",
  saveAndGenerateLabel = "Salvar e gerar",
  saveOnlyLabel,
  onGenerate,
  onSaveOnly,
  onRedo,
  redoLabel = "Pedir outra história",
  onRetry,
  onClose,
  footer,
}: {
  duration: string;
  // Roteiro de base. null = "escrever minha própria história" (caixa vazia).
  script: DialogScript | null;
  loading?: boolean;
  loadingText?: string;
  error?: string | null;
  notice?: string | null;
  busy?: boolean;
  busyText?: string;
  startInEdit?: boolean;
  generateLabel?: string;
  saveAndGenerateLabel?: string;
  // Só nas séries: salva o roteiro para o próximo episódio sem gerar agora.
  saveOnlyLabel?: string;
  onGenerate: (payload: ScriptPayload) => void | Promise<void>;
  onSaveOnly?: (payload: ScriptPayload) => void | Promise<void>;
  onRedo?: () => void;
  redoLabel?: string;
  onRetry?: () => void;
  onClose: () => void;
  footer?: ReactNode;
}) {
  const [editing, setEditing] = useState(startInEdit || script === null);
  const [text, setText] = useState(() => (script ? scenesToParagraphs(script.scenes) : ""));

  const words = countWords(text);
  const check = checkScriptWords(duration, words);
  const ok = !!check && check.state === "ok";
  const disabled = busy || loading;

  const base = {
    title: script?.title ?? "",
    source: script?.source ?? ("custom" as const),
    scenes: script?.scenes ?? [],
  };

  function startEditing() {
    setText(script ? scenesToParagraphs(script.scenes) : "");
    setEditing(true);
  }

  function back() {
    if (!script) {
      onClose();
      return;
    }
    setEditing(false);
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={disabled ? undefined : onClose}
    >
      <div
        className="relative flex max-h-[94vh] w-full flex-col rounded-t-3xl border border-white/10 bg-[#141416] p-6 sm:max-w-lg sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={disabled}
          className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:bg-white/5 hover:text-white disabled:opacity-40"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>

        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">A história do seu vídeo</p>
        <h2 className="mt-1 pr-8 text-xl font-bold text-white">{script?.title || "Escreva a sua história"}</h2>

        {error && (
          <div className="mt-4 rounded-xl border border-red-400/30 bg-red-400/[0.08] px-3.5 py-2.5 text-xs font-medium text-red-300">
            {error}
          </div>
        )}
        {notice && (
          <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.08] px-3.5 py-2.5 text-xs font-medium text-emerald-300">
            {notice}
          </div>
        )}

        {loading ? (
          <div className="mt-5 flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-[#0a0a0b] px-4 py-16 text-sm text-zinc-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            {loadingText}
          </div>
        ) : !script && !editing ? (
          <div className="mt-5 flex flex-col gap-2.5">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-zinc-200 hover:bg-white/5"
              >
                <RefreshCw className="h-4 w-4" />
                Tentar de novo
              </button>
            )}
          </div>
        ) : editing ? (
          <div className="mt-5 flex min-h-0 flex-col gap-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
              rows={11}
              autoFocus
              placeholder="Escreva ou cole aqui a sua história. O Virazo cria as imagens, a voz e a legenda a partir dela."
              className="min-h-[220px] w-full flex-1 resize-none rounded-2xl border border-white/10 bg-[#0a0a0b] p-4 text-[15px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 focus:border-[#4C3BFF]/50 focus:outline-none disabled:opacity-60"
              aria-label="Texto da história"
            />
            {check && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5">
                <p className="text-[13px] leading-snug text-zinc-300">
                  Para um vídeo de <strong className="text-white">{duration}</strong>, escreva entre{" "}
                  <strong className="text-white">{check.min} e {check.max} palavras</strong> (o ideal é de {check.idealMin} a{" "}
                  {check.idealMax}).
                </p>
                <p className={`mt-1 text-[13px] font-semibold ${ok ? "text-emerald-400" : words === 0 ? "text-zinc-500" : "text-red-400"}`}>
                  Você escreveu {words} {words === 1 ? "palavra" : "palavras"}
                  {ok ? ": está ótimo!" : "."}
                </p>
                {!ok && check.message && words > 0 && <p className="mt-0.5 text-xs text-red-300/80">{check.message}</p>}
              </div>
            )}
            <button
              type="button"
              onClick={() => void onGenerate({ ...base, text })}
              disabled={!ok || busy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-6 py-3.5 text-[15px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? busyText : saveAndGenerateLabel}
            </button>
            {onSaveOnly && saveOnlyLabel && (
              <button
                type="button"
                onClick={() => void onSaveOnly({ ...base, text })}
                disabled={!ok || busy}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-zinc-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saveOnlyLabel}
              </button>
            )}
            <button
              type="button"
              onClick={back}
              disabled={busy}
              className="py-1 text-center text-sm font-semibold text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
            >
              Voltar
            </button>
          </div>
        ) : (
          <div className="mt-5 flex min-h-0 flex-col gap-3">
            <div className="max-h-[46vh] min-h-[180px] overflow-y-auto whitespace-pre-line rounded-2xl border border-white/10 bg-[#0a0a0b] p-4 text-[15px] leading-relaxed text-zinc-300">
              {scenesToParagraphs(script!.scenes)}
            </div>
            <p className="text-xs text-zinc-500">
              {countWords(scenesToParagraphs(script!.scenes))} palavras. Ler, mudar ou pedir outra história não gasta nada do
              seu limite: o vídeo só é descontado quando você tocar em gerar.
            </p>
            <button
              type="button"
              onClick={() => void onGenerate(base)}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-6 py-3.5 text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? busyText : generateLabel}
            </button>
            <button
              type="button"
              onClick={startEditing}
              disabled={busy}
              className="py-1 text-center text-sm font-semibold text-zinc-300 hover:text-white disabled:opacity-40"
            >
              Editar a história
            </button>
            {onRedo && (
              <button
                type="button"
                onClick={onRedo}
                disabled={busy}
                className="inline-flex items-center justify-center gap-1.5 py-0.5 text-xs font-medium text-zinc-500 hover:text-zinc-300 disabled:opacity-40"
              >
                <RefreshCw className="h-3 w-3" />
                {redoLabel}
              </button>
            )}
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
