"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Download, Loader2, Play, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import { useDashboard } from "../DashboardContext";
import type { RealisticVideoRecord } from "@/lib/realistic/constants";
import { realisticProgressPercent, realisticStageText } from "./RealisticWizard";

const POLL_MS = 5000;

// Bloco "Vídeo Realista ✨" da tela Meus vídeos: saldo de créditos, botões
// Criar / Comprar e a lista dos vídeos realistas do cliente.
export default function RealisticVideosSection() {
  const { realisticCredits, openRealisticWizard, openRealisticBuy, refreshRealisticCredits } = useDashboard();
  const [videos, setVideos] = useState<RealisticVideoRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState<RealisticVideoRecord | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/realistic");
      if (!res.ok) return;
      const data = (await res.json()) as { videos: RealisticVideoRecord[] };
      setVideos(data.videos ?? []);
    } catch {
      // mantém a lista atual
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const hasProcessing = videos.some((v) => v.status === "Processando");
  useEffect(() => {
    if (!hasProcessing) return;
    const timer = setInterval(() => {
      void load();
      void refreshRealisticCredits();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [hasProcessing, load, refreshRealisticCredits]);

  async function handleRetry(video: RealisticVideoRecord) {
    setError(null);
    setBusyId(video.id);
    try {
      const res = await fetch(`/api/realistic/${video.id}/animate`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        const raw = data?.error ?? "Não foi possível tentar de novo.";
        if (raw.startsWith("no_realistic_credits")) openRealisticBuy();
        throw new Error(raw.replace(/^[a-z_]+:\s*/, ""));
      }
      await load();
      void refreshRealisticCredits();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível tentar de novo.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(video: RealisticVideoRecord) {
    if (!window.confirm("Excluir este vídeo realista?")) return;
    setError(null);
    setBusyId(video.id);
    try {
      const res = await fetch(`/api/realistic/${video.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Não foi possível excluir o vídeo.");
      setVideos((prev) => prev.filter((v) => v.id !== video.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível excluir o vídeo.");
    } finally {
      setBusyId(null);
    }
  }

  // Rascunhos (nunca animados) não são vídeos: ficam fora da lista.
  const listed = videos.filter((v) => v.status !== "Rascunho");

  return (
    <section className="flex flex-col gap-4">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#4C3BFF]/25 via-[#A855F7]/15 to-[#EC4899]/15 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-white">
              <Sparkles className="h-5 w-5 text-amber-300" />
              Vídeo Realista ✨
            </h2>
            <p className="mt-1 max-w-md text-sm text-zinc-300">
              Cenas com movimento real, com cara de filme. 1 crédito = vídeo de 30s • 2 créditos = vídeo de 60s.
            </p>
            <p className="mt-2 text-sm text-zinc-300">
              Saldo: <strong className="text-lg text-white">{realisticCredits}</strong>{" "}
              {realisticCredits === 1 ? "crédito realista" : "créditos realistas"}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:w-52">
            <button
              type="button"
              onClick={openRealisticWizard}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 shadow-lg shadow-black/20"
            >
              <Sparkles className="h-4 w-4" />
              Criar vídeo realista
            </button>
            <button
              type="button"
              onClick={openRealisticBuy}
              className="inline-flex items-center justify-center rounded-full border border-white/25 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Comprar
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Fechar aviso">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {loaded && listed.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {listed.map((video) => (
            <div key={video.id} className="card-glass flex flex-col overflow-hidden rounded-2xl">
              <button
                type="button"
                disabled={video.status !== "Pronto" || !video.videoUrl}
                onClick={() => setActive(video)}
                className="relative aspect-[9/16] w-full bg-[#1c1c1f] disabled:cursor-default"
              >
                {video.thumbnailUrl || video.sceneImageUrls[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={video.thumbnailUrl ?? video.sceneImageUrls[0]}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : null}
                {video.status === "Pronto" && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/40">
                      <Play className="h-4 w-4 translate-x-0.5 fill-white text-white" />
                    </span>
                  </span>
                )}
                {video.status === "Processando" && (
                  <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 px-3 text-center">
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                    <span className="text-[11px] font-medium text-white">
                      {realisticStageText(video.progressStage, video.progressCurrent, video.progressTotal)}
                    </span>
                    <span className="h-1 w-full overflow-hidden rounded-full bg-white/20">
                      <span
                        className="block h-full rounded-full bg-white"
                        style={{
                          width: `${realisticProgressPercent(video.progressStage, video.progressCurrent, video.progressTotal)}%`,
                        }}
                      />
                    </span>
                    <span className="text-[10px] text-white/70">
                      {video.durationSeconds === 60 ? "5 a 10 minutos" : "3 a 5 minutos"}
                    </span>
                  </span>
                )}
                {video.status === "Erro" && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <AlertTriangle className="h-6 w-6 text-red-400" />
                  </span>
                )}
              </button>
              <div className="flex flex-1 flex-col gap-2 p-3">
                <p className="line-clamp-2 text-xs font-semibold text-white">{video.title}</p>
                {video.status === "Erro" && (
                  <p className="line-clamp-3 text-[11px] text-zinc-400">{video.errorMessage}</p>
                )}
                <div className="mt-auto flex flex-wrap items-center gap-1.5">
                  {video.status === "Pronto" && video.videoUrl && (
                    <a
                      href={`${video.videoUrl}?download=${encodeURIComponent(video.title || "video-realista")}.mp4`}
                      className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-2.5 py-1 text-[11px] font-semibold text-white"
                    >
                      <Download className="h-3 w-3" />
                      Baixar
                    </a>
                  )}
                  {video.status === "Erro" && video.mode !== "series" && video.sceneImageUrls.length > 0 && (
                    <button
                      type="button"
                      disabled={busyId === video.id}
                      onClick={() => void handleRetry(video)}
                      className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                    >
                      {busyId === video.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      Tentar de novo
                    </button>
                  )}
                  {video.status !== "Processando" && (
                    <button
                      type="button"
                      disabled={busyId === video.id}
                      onClick={() => void handleDelete(video)}
                      className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-full text-zinc-500 hover:bg-white/5 hover:text-red-400"
                      aria-label="Excluir vídeo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {active?.videoUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setActive(null)}
        >
          <div
            className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-[#0a0a12] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setActive(null)}
              className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-[#0a0a12] text-zinc-400 hover:text-white"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
            <video src={active.videoUrl} controls autoPlay playsInline className="aspect-[9/16] w-full rounded-2xl bg-black" />
            <a
              href={`${active.videoUrl}?download=${encodeURIComponent(active.title || "video-realista")}.mp4`}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-4 py-2.5 text-sm font-semibold text-white"
            >
              <Download className="h-4 w-4" />
              Baixar vídeo
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
