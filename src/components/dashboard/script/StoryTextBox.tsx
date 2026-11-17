"use client";

import { checkScriptWords, countWords, MAX_STORY_CHARS } from "@/lib/script/limits";

// Caixa para escrever a própria história, com o contador e o tamanho ideal da duração escolhida
// (a mesma ideia da caixa de "Escrever a história do próximo vídeo"). Usada dentro do criador de
// séries, onde ainda não existe uma série para salvar: o texto sobe junto quando a série é criada.
export default function StoryTextBox({
  duration,
  value,
  onChange,
  disabled = false,
}: {
  duration: string;
  value: string;
  onChange: (text: string) => void;
  disabled?: boolean;
}) {
  const words = countWords(value);
  const check = checkScriptWords(duration, words);
  const ok = !!check && check.state === "ok";

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, MAX_STORY_CHARS))}
        disabled={disabled}
        rows={10}
        placeholder="Escreva ou cole aqui a história do primeiro vídeo. O Virazo cria as imagens, a voz e a legenda a partir dela."
        className="min-h-[220px] w-full resize-none rounded-2xl border border-white/[0.08] bg-[#0a0a0b] p-4 text-[15px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 focus:border-[#4C3BFF]/50 focus:outline-none disabled:opacity-60"
        aria-label="Texto da história do primeiro vídeo"
      />
      {check && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5">
          <p className="text-[13px] leading-snug text-zinc-300">
            Para um vídeo de <strong className="text-white">{duration}</strong>, escreva entre{" "}
            <strong className="text-white">
              {check.min} e {check.max} palavras
            </strong>{" "}
            (o ideal é de {check.idealMin} a {check.idealMax}).
          </p>
          <p
            className={`mt-1 text-[13px] font-semibold ${ok ? "text-emerald-400" : words === 0 ? "text-zinc-500" : "text-red-400"}`}
          >
            Você escreveu {words} {words === 1 ? "palavra" : "palavras"}
            {ok ? ": está ótimo!" : "."}
          </p>
          {!ok && check.message && words > 0 && <p className="mt-0.5 text-xs text-red-300/80">{check.message}</p>}
        </div>
      )}
    </div>
  );
}
