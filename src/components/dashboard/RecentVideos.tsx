"use client";

import { useState } from "react";
import { Play, Loader2, Pencil, Clapperboard, Wand2, AlertTriangle, X, Download } from "lucide-react";
import { useDashboard } from "./DashboardContext";
import type { VideoRecord, VideoStatus } from "./types";

const statusStyles: Record<VideoStatus, string> = {
  Pronto: "bg-emerald-400/15 text-emerald-400",
  Processando: "bg-amber-400/15 text-amber-400",
  Rascunho: "bg-zinc-400/15 text-zinc-400",
  Erro: "bg-red-400/15 text-red-400",
};

export default function RecentVideos() {
  const { videos, openWizard } = useDashboard();
  const [activeVideo, setActiveVideo] = useState<VideoRecord | null>(null);

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white sm:text-base">
          Vídeos recentes
        </h2>
        <span className="text-xs font-medium text-zinc-500">
          {videos.length} {videos.length === 1 ? "vídeo" : "vídeos"}
        </span>
      </div>

      {videos.length === 0 ? (
        <div className="card-glass mt-3 flex flex-col items-center gap-3 rounded-2xl px-6 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
            <Clapperboard className="h-5 w-5 text-zinc-500" strokeWidth={2} />
          </span>
          <div>
            <p className="text-sm font-medium text-white">Nenhum vídeo ainda</p>
            <p className="mt-1 text-xs text-zinc-500">
              Seus vídeos gerados pela IA vão aparecer aqui.
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
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {videos.map((video) => {
            const isClickable = video.status === "Pronto" || video.status === "Erro";
            return (
              <div key={video.id} className="group">
                <button
                  type="button"
                  disabled={!isClickable}
                  onClick={() => setActiveVideo(video)}
                  className={`relative block aspect-[9/16] w-full overflow-hidden rounded-2xl bg-gradient-to-br text-left ${video.gradient} ${
                    isClickable ? "cursor-pointer" : "cursor-default"
                  }`}
                >
                  {video.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={video.thumbnailUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : null}
                  <div className="absolute inset-0 bg-black/20" />

                  <span
                    className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm ${statusStyles[video.status]}`}
                  >
                    {video.status}
                  </span>

                  {video.visualStyle && (
                    <span className="absolute right-2 top-2 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                      {video.visualStyle}
                    </span>
                  )}

                  <span className="absolute bottom-2 right-2 rounded-md bg-black/40 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                    {video.duration}
                  </span>

                  <div className="absolute inset-0 flex items-center justify-center">
                    {video.status === "Processando" ? (
                      <Loader2 className="h-7 w-7 animate-spin text-white/80" strokeWidth={2} />
                    ) : video.status === "Rascunho" ? (
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm">
                        <Pencil className="h-4 w-4 text-white" strokeWidth={2} />
                      </span>
                    ) : video.status === "Erro" ? (
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/20 backdrop-blur-sm ring-1 ring-red-400/40">
                        <AlertTriangle className="h-4 w-4 text-red-300" strokeWidth={2} />
                      </span>
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm ring-1 ring-white/30">
                        <Play className="h-4 w-4 translate-x-0.5 fill-white text-white" />
                      </span>
                    )}
                  </div>
                </button>

                <h3 className="mt-2 truncate text-xs font-medium text-zinc-200 sm:text-sm">
                  {video.title}
                </h3>
                <p className="text-[11px] text-zinc-500">
                  {video.style} · {video.createdAt}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {activeVideo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setActiveVideo(null)}
        >
          <div
            className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-[#0a0a12] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setActiveVideo(null)}
              className="absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-[#0a0a12] text-zinc-400 hover:text-white"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>

            {activeVideo.status === "Pronto" && activeVideo.videoUrl ? (
              <>
                <video
                  src={activeVideo.videoUrl}
                  controls
                  autoPlay
                  className="aspect-[9/16] w-full rounded-2xl bg-black"
                />
                <a
                  href={`${activeVideo.videoUrl}?download=${encodeURIComponent(activeVideo.title || "video")}.mp4`}
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
                  {activeVideo.errorMessage ?? "Erro desconhecido."}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
