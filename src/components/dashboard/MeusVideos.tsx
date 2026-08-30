"use client";

import { useEffect, useState } from "react";
import {
  Play,
  Loader2,
  Pencil,
  Clapperboard,
  Wand2,
  AlertTriangle,
  X,
  Download,
  Sparkles,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useDashboard } from "./DashboardContext";
import { createClient } from "@/utils/supabase/client";
import type { VideoRecord, VideoStatus } from "./types";

// `finally` só executa quando uma Promise resolve OU rejeita — se uma
// chamada de rede travar (sem resposta, sem erro, sem timeout próprio),
// nada dispara e o botão fica girando pra sempre. Isso força um limite de
// tempo em qualquer chamada ao Supabase usada na exclusão.
function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} demorou demais e foi cancelado.`)), ms),
    ),
  ]);
}

// Reutiliza os mesmos dados já carregados no DashboardContext (populados em
// dashboard/layout.tsx com `select("*")` na tabela `videos`, sem limite) —
// já inclui tanto vídeos manuais quanto os gerados por Séries (distinguidos
// por `seriesId`), então não é preciso nenhuma nova busca nem mudança de
// schema pra esta página existir.
const STATUS_BADGE: Record<VideoStatus, string> = {
  Pronto: "bg-emerald-400/15 text-emerald-400",
  Processando: "bg-amber-400/15 text-amber-400",
  Rascunho: "bg-zinc-400/15 text-zinc-400",
  Erro: "bg-red-400/15 text-red-400",
};

const STATUS_LABEL: Record<VideoStatus, string> = {
  Pronto: "Pronto",
  Processando: "Gerando",
  Rascunho: "Rascunho",
  Erro: "Falhou",
};

// O banco só marca um vídeo como "Pronto" junto com a URL final (mesma
// transação de mark_video_ready), então isso nunca deveria acontecer pelo
// fluxo normal — mas registros antigos, ou uma geração interrompida no meio
// (queda de conexão, servidor reiniciado) podem deixar um "Pronto" sem
// arquivo de verdade. Trata isso como falha na tela, sem mexer no banco.
function getEffectiveStatus(video: VideoRecord): VideoStatus {
  if (video.status === "Pronto" && !video.videoUrl) return "Erro";
  return video.status;
}

export default function MeusVideos() {
  const { videos, openWizard, addVideo, removeVideo, refetchVideos } = useDashboard();
  const [activeVideo, setActiveVideo] = useState<VideoRecord | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // `videos` no contexto é um retrato do banco carregado uma vez no layout —
  // não é reatualizado sozinho ao navegar entre páginas do dashboard. Rebusca
  // ao entrar aqui pra garantir que "Meus vídeos" sempre reflita o Supabase
  // de verdade, mesmo que o layout tenha sido carregado há um tempo.
  useEffect(() => {
    void refetchVideos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRetry(video: VideoRecord) {
    setRetryingId(video.id);
    setRetryError(null);
    try {
      await addVideo({
        title: video.title,
        topic: video.topic,
        style: video.style,
        visualStyle: video.visualStyle,
        duration: video.duration,
        voice: video.voice ?? "",
        captionsEnabled: video.captionsEnabled,
        captionStyle: video.captionStyle,
        gradient: video.gradient,
      });
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : "Não foi possível gerar o vídeo.");
    } finally {
      setRetryingId(null);
    }
  }

  async function handleDelete(video: VideoRecord) {
    console.log("[DELETE REAL] HANDLER INICIO", video.id);
    if (!confirm("Tem certeza que deseja excluir este vídeo?")) return;
    setDeletingId(video.id);
    setRetryError(null);
    try {
      const supabase = createClient();

      // `.select("id")` depois do delete é o único jeito confiável de saber
      // se alguma linha foi REALMENTE apagada: sem isso, o Postgrest retorna
      // sucesso (sem `error`) mesmo quando o RLS bloqueia silenciosamente e
      // 0 linhas são afetadas — o que faria o card sumir da tela sem o
      // registro ter sido excluído de fato no banco.
      const { data: deletedRows, error: deleteError } = await withTimeout(
        supabase.from("videos").delete().eq("id", video.id).select("id"),
        15000,
        "Exclusão do vídeo",
      );

      if (deleteError) {
        console.error("[MeusVideos] falha ao excluir vídeo:", video.id, deleteError);
        setRetryError(`Não foi possível excluir o vídeo: ${deleteError.message}`);
        return;
      }
      if (!deletedRows || deletedRows.length === 0) {
        // 0 linhas afetadas tem duas causas possíveis, e são bem diferentes:
        // (a) o registro já não existe mais (já foi excluído antes — um
        //     clique duplo, uma tentativa anterior que teve sucesso mas cuja
        //     resposta demorou) — aqui o resultado correto é sucesso; ou
        // (b) o RLS realmente bloqueou (registro de outro usuário, por
        //     exemplo) — aqui sim é um erro de verdade.
        // Sem checar qual dos dois é, tratávamos as duas como erro e nunca
        // tirávamos o card da tela mesmo quando o vídeo já tinha sumido do
        // banco de fato.
        const { data: stillExists, error: checkError } = await withTimeout(
          supabase.from("videos").select("id").eq("id", video.id).maybeSingle(),
          10000,
          "Verificação do vídeo",
        );

        if (!stillExists && !checkError) {
          console.warn(
            "[MeusVideos] delete não afetou linhas, mas o registro já não existe (excluído anteriormente):",
            video.id,
          );
          removeVideo(video.id);
          void refetchVideos();
          return;
        }

        console.error(
          "[MeusVideos] delete não afetou nenhuma linha e o registro ainda existe (possível bloqueio de RLS) para o vídeo:",
          video.id,
          checkError,
        );
        setRetryError("Não foi possível excluir este vídeo — nenhum registro foi removido no banco.");
        return;
      }

      // O registro já foi confirmadamente excluído do banco — a tela reflete
      // isso já, sem esperar o Storage. A limpeza dos arquivos roda à parte
      // (nem é esperada aqui), então mesmo que trave ou falhe não segura o
      // botão nem o card por mais um segundo sequer.
      console.log("[DELETE REAL] SUCESSO", video.id);
      removeVideo(video.id);
      void refetchVideos();

      void (async () => {
        try {
          const {
            data: { user },
          } = await withTimeout(supabase.auth.getUser(), 8000, "Verificação de sessão");
          if (!user) return;
          const { error: storageError } = await withTimeout(
            supabase.storage.from("videos").remove([`${user.id}/${video.id}.mp4`, `${user.id}/${video.id}-thumb.jpg`]),
            8000,
            "Limpeza do Storage",
          );
          if (storageError) {
            console.warn("[MeusVideos] não foi possível remover arquivos do Storage:", storageError);
          }
        } catch (storageErr) {
          console.warn("[MeusVideos] erro inesperado ao remover arquivos do Storage:", storageErr);
        }
      })();
    } catch (err) {
      console.error("[MeusVideos] erro inesperado ao excluir vídeo:", video.id, err);
      setRetryError(err instanceof Error ? err.message : "Não foi possível excluir o vídeo.");
    } finally {
      setDeletingId(null);
    }
  }

  if (videos.length === 0) {
    return (
      <div className="card-glass flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
          <Clapperboard className="h-5 w-5 text-zinc-500" strokeWidth={2} />
        </span>
        <div>
          <p className="text-sm font-medium text-white">Você ainda não tem nenhum vídeo</p>
          <p className="mt-1 text-xs text-zinc-500">
            Crie um vídeo manualmente ou configure uma série para gerar automaticamente.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openWizard()}
          className="mt-1 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#FF6B5B] to-[#FFB84D] px-4 py-2 text-xs font-semibold text-white"
        >
          <Wand2 className="h-3.5 w-3.5" />
          Criar meu primeiro vídeo
        </button>
      </div>
    );
  }

  return (
    <>
      {retryError && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <span>{retryError}</span>
          <button type="button" onClick={() => setRetryError(null)} className="text-red-400/70 hover:text-red-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {videos.map((video) => (
          <VideoRow
            key={video.id}
            video={video}
            onOpen={() => setActiveVideo(video)}
            onRetry={() => handleRetry(video)}
            onDelete={() => handleDelete(video)}
            isRetrying={retryingId === video.id}
            isDeleting={deletingId === video.id}
          />
        ))}
      </div>

      {activeVideo && <VideoModal video={activeVideo} onClose={() => setActiveVideo(null)} />}
    </>
  );
}

function VideoRow({
  video,
  onOpen,
  onRetry,
  onDelete,
  isRetrying,
  isDeleting,
}: {
  video: VideoRecord;
  onOpen: () => void;
  onRetry: () => void;
  onDelete: () => void;
  isRetrying: boolean;
  isDeleting: boolean;
}) {
  const status = getEffectiveStatus(video);
  const isOrigemSerie = !!video.seriesId;
  const canWatch = status === "Pronto" && !!video.videoUrl;
  const canDownload = canWatch;
  const isFailed = status === "Erro";

  return (
    <div className="card-glass flex flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
      <button
        type="button"
        onClick={onOpen}
        disabled={status !== "Pronto" && status !== "Erro"}
        className={`relative aspect-[9/16] w-20 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br sm:w-16 ${video.gradient} ${
          status === "Pronto" || status === "Erro" ? "cursor-pointer" : "cursor-default"
        }`}
      >
        {video.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={video.thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-black/20" />
        <div className="absolute inset-0 flex items-center justify-center">
          {status === "Processando" ? (
            <Loader2 className="h-5 w-5 animate-spin text-white/80" strokeWidth={2} />
          ) : status === "Rascunho" ? (
            <Pencil className="h-4 w-4 text-white" strokeWidth={2} />
          ) : status === "Erro" ? (
            <AlertTriangle className="h-4 w-4 text-red-300" strokeWidth={2} />
          ) : (
            <Play className="h-4 w-4 translate-x-0.5 fill-white text-white" />
          )}
        </div>
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-white">{video.title}</h3>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[status]}`}>
            {STATUS_LABEL[status]}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500">
          <span className="inline-flex items-center gap-1">
            {isOrigemSerie ? (
              <>
                <Sparkles className="h-3 w-3 text-[#FF6B5B]" /> Série
              </>
            ) : (
              "Manual"
            )}
          </span>
          <span>·</span>
          <span>{video.style}</span>
          <span>·</span>
          <span>{video.duration}</span>
          <span>·</span>
          <span>{video.createdAt}</span>
        </div>
        {isFailed && (
          <p className="mt-1 truncate text-[11px] text-red-400">
            {video.errorMessage ?? "O vídeo não chegou a ser concluído."}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {canWatch && (
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#FF6B5B] to-[#FFB84D] px-3 py-1.5 text-xs font-semibold text-white"
          >
            <Play className="h-3.5 w-3.5" />
            Assistir
          </button>
        )}
        {canDownload && video.videoUrl && (
          <a
            href={`${video.videoUrl}?download=${encodeURIComponent(video.title || "video")}.mp4`}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/5"
          >
            <Download className="h-3.5 w-3.5" />
            Baixar
          </a>
        )}
        {isFailed && (
          <>
            <button
              type="button"
              disabled={isRetrying || isDeleting}
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#FF6B5B] to-[#FFB84D] px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRetrying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              Tentar novamente
            </button>
            <button
              type="button"
              disabled={isRetrying || isDeleting}
              onClick={() => {
                console.log("[DELETE REAL] CLIQUE", video.id, video.title);
                onDelete();
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Excluir
            </button>
          </>
        )}
        {status === "Processando" && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Gerando...
          </span>
        )}
      </div>
    </div>
  );
}

function VideoModal({ video, onClose }: { video: VideoRecord; onClose: () => void }) {
  const status = getEffectiveStatus(video);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-[#0a0a12] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-[#0a0a12] text-zinc-400 hover:text-white"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>

        {status === "Pronto" && video.videoUrl ? (
          <>
            <video
              src={video.videoUrl}
              controls
              autoPlay
              className="aspect-[9/16] w-full rounded-2xl bg-black"
            />
            <a
              href={`${video.videoUrl}?download=${encodeURIComponent(video.title || "video")}.mp4`}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#FF6B5B] to-[#FFB84D] px-4 py-2.5 text-sm font-semibold text-white"
            >
              <Download className="h-4 w-4" />
              Baixar vídeo
            </a>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10">
              <AlertTriangle className="h-5 w-5 text-red-400" strokeWidth={2} />
            </span>
            <h3 className="text-sm font-semibold text-white">Não foi possível gerar este vídeo</h3>
            <p className="max-w-xs text-xs text-zinc-400">
              {video.errorMessage ?? "O vídeo não chegou a ser concluído."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
