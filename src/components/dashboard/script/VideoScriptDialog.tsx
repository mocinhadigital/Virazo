"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_SCRIPT_REDOS_PER_DRAFT, type ScriptPayload } from "@/lib/script/limits";
import ScriptDialog, { type DialogScript } from "./ScriptDialog";

// Guarda o roteiro já escrito enquanto o assistente está aberto: se o cliente fechar o
// quadro e abrir de novo (sem mudar tema/estilo/duração), não paga outro roteiro de IA.
export type VideoScriptCache = { key: string; script: DialogScript | null; redos: number; version: number };
export const EMPTY_VIDEO_SCRIPT_CACHE: VideoScriptCache = { key: "", script: null, redos: 0, version: 0 };

type ApiScript = { title: string; scenes: { narration: string; imagePrompt: string }[] };

async function writeScript(body: unknown): Promise<ApiScript> {
  const response = await fetch("/api/videos/script", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string } & Partial<ApiScript>;
  if (!response.ok || !data.scenes) {
    throw new Error((data.error ?? "Não foi possível escrever o roteiro. Tente de novo.").replace(/^[a-z_]+:\s*/, ""));
  }
  return { title: data.title ?? "", scenes: data.scenes };
}

// Quadro de roteiro do vídeo normal. Abre depois da revisão final: a IA escreve o roteiro
// (de graça) e o cliente lê, edita ou refaz. A geração — e o desconto do vídeo do dia — só
// começa quando ele clica em "Gerar com este roteiro" ou "Salvar e gerar".
export default function VideoScriptDialog({
  mode,
  topic,
  style,
  visualStyle,
  duration,
  cache,
  setCache,
  onGenerate,
  onClose,
}: {
  mode: "ai" | "own";
  topic: string;
  style: string;
  visualStyle: string;
  duration: string;
  cache: VideoScriptCache;
  setCache: (updater: (prev: VideoScriptCache) => VideoScriptCache) => void;
  onGenerate: (payload: ScriptPayload) => void | Promise<void>;
  onClose: () => void;
}) {
  const key = [topic, style, visualStyle, duration].join("|");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const requestedKey = useRef<string | null>(null);

  const load = useCallback(
    async (isRedo: boolean) => {
      setError(null);
      setLoading(true);
      try {
        const api = await writeScript({ topic, style, visualStyle, duration });
        setCache((prev) => ({
          key,
          script: { title: api.title, source: "ai", scenes: api.scenes },
          redos: isRedo ? prev.redos + 1 : prev.key === key ? prev.redos : 0,
          version: prev.version + 1,
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível escrever o roteiro.");
      } finally {
        setLoading(false);
      }
    },
    [topic, style, visualStyle, duration, key, setCache],
  );

  const cached = cache.key === key ? cache.script : null;

  // Modo IA: escreve o roteiro ao abrir (uma vez por combinação de tema/estilo/duração).
  useEffect(() => {
    if (mode !== "ai" || cached || loading || error) return;
    if (requestedKey.current === key) return;
    requestedKey.current = key;
    void load(false);
  }, [mode, cached, loading, error, key, load]);

  async function handleGenerate(payload: ScriptPayload) {
    setBusy(true);
    try {
      await onGenerate(payload);
    } finally {
      setBusy(false);
    }
  }

  function redo() {
    if (cache.redos >= MAX_SCRIPT_REDOS_PER_DRAFT) {
      setError(`Você já pediu outra história ${MAX_SCRIPT_REDOS_PER_DRAFT} vezes. Toque em "Editar a história" para ajustar o texto que você tem.`);
      return;
    }
    void load(true);
  }

  if (mode === "own") {
    return (
      <ScriptDialog
        key="own"
        duration={duration}
        script={null}
        startInEdit
        busy={busy}
        onGenerate={handleGenerate}
        onClose={onClose}
      />
    );
  }

  return (
    <ScriptDialog
      key={`ai-${cache.version}`}
      duration={duration}
      script={cached}
      loading={loading}
      loadingText="A IA está escrevendo a sua história…"
      error={error}
      busy={busy}
      onGenerate={handleGenerate}
      onRedo={cached ? redo : undefined}
      redoLabel={`Pedir outra história (${cache.redos}/${MAX_SCRIPT_REDOS_PER_DRAFT})`}
      onRetry={() => void load(false)}
      onClose={onClose}
    />
  );
}
