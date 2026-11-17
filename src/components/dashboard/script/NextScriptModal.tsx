"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import ScriptDialog, { type DialogScript } from "./ScriptDialog";
import StoryChoiceDialog from "./StoryChoiceDialog";
import { type ScriptPayload } from "@/lib/script/limits";
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

// A história do PRÓXIMO vídeo de uma série. Antes de qualquer coisa a pessoa ESCOLHE: usar a
// história que já deixou pronta, escrever a dela, ou deixar a IA criar. Nunca se gera uma história
// sem essa escolha. Ler, editar e pedir outra não gasta nada do limite de vídeos; só gera (e só
// desconta) quando a pessoa toca em gerar.
//   intent "generate": veio de "Gerar um vídeo agora" — o fim do caminho é gerar o vídeo.
//   intent "prepare":  veio de "Escrever a história do próximo vídeo" — o fim é guardar a história.
export default function NextScriptModal({
  series,
  intent,
  first,
  onClose,
  onChanged,
  onGenerateNow,
}: {
  series: SeriesRecord;
  intent: "generate" | "prepare";
  // Primeiro vídeo logo depois de criar a série: o que o cliente escolheu NA CRIAÇÃO já vale, então a
  // pergunta "Qual história você quer usar?" não aparece.
  //   "saved": ele escreveu a história na criação -> gera direto com ela;
  //   "ai":    ele escolheu "A IA cria" -> a IA escreve e mostra para ele ler antes de gerar.
  first?: "saved" | "ai";
  onClose: () => void;
  onChanged: (hasScript: boolean) => void;
  // Fecha o quadro e roda o "Gerar agora" da série (que usa a história guardada).
  onGenerateNow: () => void;
}) {
  const [saved, setSaved] = useState<DialogScript | null>(null);
  const [screen, setScreen] = useState<"choose" | "dialog">("choose");
  // Na tela da história: o roteiro mostrado (null = caixa vazia para escrever a própria).
  const [shown, setShown] = useState<DialogScript | null>(null);
  const [version, setVersion] = useState(0);
  const [duration, setDuration] = useState(series.duration);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<null | "write" | "save" | "clear">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    call<{ script: ApiScript | null; duration: string }>(`/api/series/${series.id}/next-script`, "GET")
      .then((data) => {
        if (cancelled) return;
        setDuration(data.duration);
        setSaved(data.script ? toDialogScript(data.script) : null);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "Não foi possível carregar."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [series.id]);

  // Primeiro vídeo da série: segue direto, sem perguntar a história de novo (ver "first" acima).
  const firstHandled = useRef(false);
  useEffect(() => {
    if (loading || !first || firstHandled.current) return;
    firstHandled.current = true;
    if (first === "ai") {
      void writeWithAi();
    } else if (saved) {
      onGenerateNow();
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotice("Não encontramos a história que você escreveu. Escolha como quer a história deste vídeo.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, first]);

  function show(next: DialogScript | null) {
    setShown(next);
    setVersion((v) => v + 1);
    setScreen("dialog");
  }

  // "A IA cria a história": escreve (de graça), guarda e mostra para a pessoa ler.
  async function writeWithAi() {
    setBusy("write");
    setError(null);
    setNotice(null);
    try {
      const data = await call<{ script: ApiScript; duration: string }>(`/api/series/${series.id}/next-script`, "POST");
      setDuration(data.duration);
      const next = toDialogScript(data.script);
      setSaved(next);
      onChanged(true);
      show(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível escrever a história.");
    } finally {
      setBusy(null);
    }
  }

  // Guarda a história (o servidor divide o texto em cenas e refaz a imagem do que mudou). Sem texto
  // novo, ela já está guardada.
  async function save(payload: ScriptPayload): Promise<boolean> {
    if (payload.text === undefined) return true;
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const data = await call<{ script: ApiScript }>(`/api/series/${series.id}/next-script`, "PUT", { script: payload });
      const next = toDialogScript(data.script);
      setSaved(next);
      setShown(next);
      setVersion((v) => v + 1);
      onChanged(true);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível guardar a história.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function generateWith(payload: ScriptPayload) {
    const cost = videoSlotCost(duration);
    if (
      !window.confirm(
        `Fazer o vídeo agora usa ${cost} ${cost === 1 ? "vídeo" : "vídeos"} do seu limite de hoje. Quer continuar?`,
      )
    ) {
      return;
    }
    if (await save(payload)) onGenerateNow();
  }

  async function keepOnly(payload: ScriptPayload) {
    if (await save(payload)) setNotice("Pronto! Esta história será usada no próximo vídeo da série.");
  }

  async function clear() {
    setBusy("clear");
    setError(null);
    setNotice(null);
    try {
      await call(`/api/series/${series.id}/next-script`, "DELETE");
      setSaved(null);
      onChanged(false);
      setScreen("choose");
      setNotice("Pronto: a história guardada foi apagada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível apagar a história.");
    } finally {
      setBusy(null);
    }
  }

  // Enquanto carrega o que já está guardado, mostra só "Carregando…" (nada de texto de outra etapa).
  if (loading) {
    return (
      <StoryChoiceDialog
        title="Um instante…"
        subtitle="Estamos abrindo as opções da história."
        options={[]}
        busy
        busyText="Carregando…"
        error={error}
        onClose={onClose}
      />
    );
  }

  if (screen === "dialog") {
    const isGenerate = intent === "generate";
    return (
      <ScriptDialog
        key={`${version}-${shown ? "s" : "own"}`}
        duration={duration}
        script={shown}
        startInEdit={!shown}
        error={error}
        notice={notice}
        busy={busy !== null}
        busyText={busy === "write" ? "Escrevendo…" : busy === "clear" ? "Apagando…" : "Guardando…"}
        generateLabel={isGenerate ? "Gerar com esta história" : "Guardar para o próximo vídeo"}
        saveAndGenerateLabel={isGenerate ? "Salvar e gerar" : "Guardar para o próximo vídeo"}
        saveOnlyLabel={isGenerate ? "Só guardar para o próximo vídeo" : undefined}
        onGenerate={isGenerate ? generateWith : keepOnly}
        onSaveOnly={isGenerate ? keepOnly : undefined}
        onRedo={shown ? () => void writeWithAi() : undefined}
        onClose={onClose}
        footer={
          saved ? (
            <button
              type="button"
              onClick={() => void clear()}
              disabled={busy !== null}
              className="inline-flex items-center justify-center gap-1.5 py-0.5 text-xs font-medium text-zinc-500 hover:text-zinc-300 disabled:opacity-40"
            >
              <Trash2 className="h-3 w-3" />
              Apagar a história guardada
            </button>
          ) : undefined
        }
      />
    );
  }

  return (
    <StoryChoiceDialog
      title={isGenerateTitle(intent)}
      subtitle={`Série: ${series.title}. Escolha como será a história deste vídeo. Você lê antes de ele ser feito.`}
      busy={busy !== null}
      busyText="A IA está escrevendo a história…"
      error={error}
      notice={
        notice ? (
          <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.08] px-3.5 py-2.5 text-sm font-medium text-emerald-300">
            {notice}
          </div>
        ) : null
      }
      onClose={onClose}
      options={[
        ...(saved
          ? [
              {
                id: "saved",
                emoji: "📖",
                title: "Usar a história que já deixei pronta",
                description: "Você já tem uma história guardada para este vídeo.",
                highlight: true,
                onPick: () => show(saved),
              },
            ]
          : []),
        {
          id: "own",
          emoji: "✍️",
          title: "Quero escrever minha história",
          description: "Você escreve ou cola o texto, e a gente faz o vídeo com ele.",
          onPick: () => show(null),
        },
        {
          id: "ai",
          emoji: "✨",
          title: saved ? "A IA cria outra história para mim" : "A IA cria a história para mim",
          description: "A IA escreve, você lê, muda o que quiser e só depois gera.",
          onPick: () => void writeWithAi(),
        },
      ]}
    />
  );
}

function isGenerateTitle(intent: "generate" | "prepare"): string {
  return intent === "generate" ? "Qual história você quer usar?" : "Como será a história do próximo vídeo?";
}
