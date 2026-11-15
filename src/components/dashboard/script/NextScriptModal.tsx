"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2, PenLine, Trash2, X } from "lucide-react";
import ScriptDialog, { type DialogScript } from "./ScriptDialog";
import { MAX_SCRIPT_REQUESTS_PER_DAY, type ScriptPayload } from "@/lib/script/limits";
import { videoSlotCost } from "@/lib/video/durations";
import type { SeriesRecord } from "../types";

type ApiScript = { title: string; scenes: { narration: string; imagePrompt: string }[]; source?: string };

async function call<T>(url: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) {
    throw new Error((data.error ?? "Não foi possível concluir. Tente de novo.").replace(/^[a-z_]+:\s*/, ""));
  }
  return data;
}

function toDialogScript(api: ApiScript): DialogScript {
  return {
    title: api.title,
    source: api.source === "custom" ? "custom" : "ai",
    scenes: api.scenes.map((s) => ({ narration: s.narration, imagePrompt: s.imagePrompt })),
  };
}

// Roteiro do PRÓXIMO episódio de uma série, no mesmo quadro "Roteiro do vídeo" do vídeo
// avulso. Ler, editar e salvar aqui não gasta nada do limite de vídeos; só gera (e só
// desconta) quando o cliente clica em "Gerar agora com este roteiro" / "Salvar e gerar".
// Se ele não usar isto, a série continua escrevendo tudo sozinha.
export default function NextScriptModal({
  series,
  onClose,
  onChanged,
  onGenerateNow,
}: {
  series: SeriesRecord;
  onClose: () => void;
  onChanged: (hasScript: boolean) => void;
  // Fecha o quadro e roda o "Gerar agora" da série (que usa o roteiro salvo).
  onGenerateNow: () => void;
}) {
  const [script, setScript] = useState<DialogScript | null>(null);
  const [version, setVersion] = useState(0);
  const [duration, setDuration] = useState(series.duration);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "write" | "save" | "clear">(null);
  const [writeOwn, setWriteOwn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    call<{ script: ApiScript | null; duration: string }>(`/api/series/${series.id}/next-script`, "GET")
      .then((data) => {
        if (cancelled) return;
        setDuration(data.duration);
        setScript(data.script ? toDialogScript(data.script) : null);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Não foi possível carregar."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [series.id]);

  async function write() {
    setBusy("write");
    setError(null);
    setNotice(null);
    try {
      const data = await call<{ script: ApiScript; duration: string }>(`/api/series/${series.id}/next-script`, "POST");
      setDuration(data.duration);
      setScript(toDialogScript(data.script));
      setVersion((v) => v + 1);
      setWriteOwn(false);
      onChanged(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível escrever o roteiro.");
    } finally {
      setBusy(null);
    }
  }

  // Salva o roteiro editado (o servidor divide o texto em cenas e refaz a imagem das cenas
  // que mudaram). Sem texto novo, o roteiro já está salvo.
  async function save(payload: ScriptPayload): Promise<boolean> {
    if (payload.text === undefined) return true;
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const data = await call<{ script: ApiScript }>(`/api/series/${series.id}/next-script`, "PUT", { script: payload });
      setScript(toDialogScript(data.script));
      setVersion((v) => v + 1);
      setWriteOwn(false);
      onChanged(true);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o roteiro.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function saveAndGenerate(payload: ScriptPayload) {
    const cost = videoSlotCost(duration);
    if (
      !window.confirm(
        `Gerar o episódio agora usa ${cost} ${cost === 1 ? "vídeo" : "vídeos"} do seu limite do dia. Continuar?`,
      )
    ) {
      return;
    }
    if (await save(payload)) onGenerateNow();
  }

  async function saveOnly(payload: ScriptPayload) {
    if (await save(payload)) setNotice("Roteiro salvo. Ele será usado no próximo episódio.");
  }

  async function clear() {
    setBusy("clear");
    setError(null);
    setNotice(null);
    try {
      await call(`/api/series/${series.id}/next-script`, "DELETE");
      setScript(null);
      setVersion((v) => v + 1);
      setNotice("Pronto: o próximo episódio volta a ser escrito automaticamente.");
      onChanged(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível apagar o roteiro.");
    } finally {
      setBusy(null);
    }
  }

  // Com roteiro (ou escrevendo o próprio): quadro de leitura/edição.
  if (!loading && (script || writeOwn)) {
    return (
      <ScriptDialog
        key={`${version}-${script ? "s" : "own"}`}
        duration={duration}
        script={script}
        startInEdit={!script}
        error={error}
        notice={notice}
        busy={busy !== null}
        busyText={busy === "write" ? "Escrevendo…" : busy === "clear" ? "Apagando…" : "Salvando…"}
        generateLabel="Gerar agora com este roteiro"
        saveAndGenerateLabel="Salvar e gerar"
        saveOnlyLabel="Só salvar para o próximo episódio"
        onGenerate={saveAndGenerate}
        onSaveOnly={saveOnly}
        onRedo={script ? () => void write() : undefined}
        onClose={onClose}
        footer={
          script ? (
            <button
              type="button"
              onClick={() => void clear()}
              disabled={busy !== null}
              className="inline-flex items-center justify-center gap-1.5 py-0.5 text-xs font-medium text-zinc-500 hover:text-zinc-300 disabled:opacity-40"
            >
              <Trash2 className="h-3 w-3" />
              Voltar ao automático (apagar este roteiro)
            </button>
          ) : undefined
        }
      />
    );
  }

  // Sem roteiro guardado: explica e oferece escrever.
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative flex w-full flex-col rounded-t-3xl border border-white/10 bg-[#141416] p-6 sm:max-w-lg sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:bg-white/5 hover:text-white"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Roteiro do próximo episódio</p>
        <h2 className="mt-1 pr-8 text-xl font-bold text-white">{series.title}</h2>

        <p className="mt-4 rounded-xl bg-white/[0.03] px-3 py-2 text-xs text-zinc-400">
          Veja e edite o roteiro antes de o episódio ser gerado. Ler, editar e refazer{" "}
          <strong className="text-zinc-200">não gasta nada</strong> do seu limite de vídeos. Se você não fizer nada, a série
          continua escrevendo sozinha. Limite de {MAX_SCRIPT_REQUESTS_PER_DAY} pedidos de roteiro por dia.
        </p>
        {error && (
          <div className="mt-3 rounded-xl border border-red-400/30 bg-red-400/[0.08] px-3.5 py-2.5 text-xs font-medium text-red-300">
            {error}
          </div>
        )}
        {notice && (
          <div className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.08] px-3.5 py-2.5 text-xs font-medium text-emerald-300">
            {notice}
          </div>
        )}

        {loading ? (
          <div className="mt-5 flex items-center justify-center gap-2 py-8 text-sm text-zinc-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando…
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => void write()}
              disabled={busy !== null}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-6 py-3.5 text-[15px] font-semibold text-white disabled:opacity-50"
            >
              {busy === "write" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {busy === "write" ? "Escrevendo o roteiro…" : "Escrever o roteiro do próximo episódio"}
            </button>
            <button
              type="button"
              onClick={() => setWriteOwn(true)}
              disabled={busy !== null}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-zinc-200 hover:bg-white/5 disabled:opacity-50"
            >
              <PenLine className="h-4 w-4" />
              Escrever o meu próprio roteiro
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
