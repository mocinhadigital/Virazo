"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Download,
  Loader2,
  Music,
  Pause,
  PenLine,
  Play,
  RefreshCw,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { useDashboard } from "../DashboardContext";
import { SERIES_CAPTION_STYLES, SERIES_VOICES } from "../series/seriesOptions";
import type { MusicTrackRecord } from "../musicMapping";
import {
  DEFAULT_REALISTIC_STYLE,
  REALISTIC_LANGUAGES,
  REALISTIC_MAX_IMAGE_SWAPS,
  REALISTIC_MAX_SCRIPT_GENERATIONS,
  REALISTIC_DURATIONS,
  REALISTIC_STYLES,
  type RealisticDuration,
  type RealisticLanguage,
  type RealisticVideoRecord,
} from "@/lib/realistic/constants";

type Step = "inicio" | "tema" | "ideia" | "estilo" | "ajustes" | "roteiro" | "previa" | "gerando" | "pronto";
type Mode = "guided" | "free";

const STEPS_BY_MODE: Record<Mode, Step[]> = {
  guided: ["tema", "estilo", "ajustes", "roteiro", "previa"],
  free: ["ideia", "ajustes", "roteiro", "previa"],
};

const STEP_TITLES: Record<Step, string> = {
  inicio: "Vídeo Realista ✨",
  tema: "Sobre o que é o vídeo?",
  ideia: "Escreva a sua ideia",
  estilo: "Escolha o estilo realista",
  ajustes: "Voz, música e legenda",
  roteiro: "Revise o roteiro",
  previa: "Prévia das cenas",
  gerando: "Gerando seu vídeo",
  pronto: "Vídeo pronto!",
};

const POLL_MS = 4000;

// Resposta de erro das rotas /api/realistic: "codigo: mensagem" quando o
// motivo é conhecido (sem créditos etc.).
function splitError(raw: string): { code: string | null; message: string } {
  const match = /^(no_realistic_credits|already_started|too_many_in_progress):\s*(.*)$/.exec(raw);
  return match ? { code: match[1], message: match[2] } : { code: null, message: raw };
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // corpo não-JSON
  }
  if (!response.ok) {
    const raw = (data as { error?: string } | null)?.error ?? "Algo deu errado. Tente de novo.";
    throw Object.assign(new Error(splitError(raw).message), { code: splitError(raw).code });
  }
  return data as T;
}

export default function RealisticWizard() {
  const { isRealisticWizardOpen } = useDashboard();
  if (!isRealisticWizardOpen) return null;
  return <WizardPanel />;
}

function WizardPanel() {
  const { closeRealisticWizard, openWizard, openRealisticBuy, realisticCredits, refreshRealisticCredits } =
    useDashboard();

  const [step, setStep] = useState<Step>("inicio");
  const [mode, setMode] = useState<Mode>("guided");
  const [topic, setTopic] = useState("");
  const [idea, setIdea] = useState("");
  const [language, setLanguage] = useState<RealisticLanguage>("pt");
  const [duration, setDuration] = useState<RealisticDuration>(30);
  const [style, setStyle] = useState<string>(DEFAULT_REALISTIC_STYLE);
  const [voice, setVoice] = useState<string | null>(null);
  const [musicId, setMusicId] = useState<string | null>(null);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [captionStyle, setCaptionStyle] = useState<string>(SERIES_CAPTION_STYLES[0].name);

  const [video, setVideo] = useState<RealisticVideoRecord | null>(null);
  const [narrations, setNarrations] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null); // texto do que está carregando
  const [swappingScene, setSwappingScene] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsCredits, setNeedsCredits] = useState(false);
  const [failedMessage, setFailedMessage] = useState<string | null>(null);

  const [tracks, setTracks] = useState<MusicTrackRecord[]>([]);
  const [tracksFetched, setTracksFetched] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);

  const flow = STEPS_BY_MODE[mode];
  const flowIndex = flow.indexOf(step);
  const showProgressBar = flowIndex >= 0;

  useEffect(() => {
    return () => audioRef.current?.pause();
  }, []);

  // Músicas só quando chega na etapa de ajustes.
  useEffect(() => {
    if (step !== "ajustes" || tracksFetched) return;
    let cancelled = false;
    fetch("/api/music-tracks")
      .then((r) => r.json())
      .then((data: unknown) => {
        if (!cancelled && Array.isArray(data)) setTracks(data as MusicTrackRecord[]);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setTracksFetched(true);
      });
    return () => {
      cancelled = true;
    };
  }, [step, tracksFetched]);
  const tracksLoading = step === "ajustes" && !tracksFetched;

  function playUrl(url: string) {
    audioRef.current?.pause();
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.play().catch(() => {});
  }

  async function playVoice(name: string) {
    if (playingVoice === name) {
      audioRef.current?.pause();
      setPlayingVoice(null);
      return;
    }
    audioRef.current?.pause();
    setPlayingVoice(name);
    try {
      const res = await fetch(`/api/voices/preview?voice=${encodeURIComponent(name)}&lang=${language}`);
      if (!res.ok) throw new Error("preview");
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.addEventListener("ended", () => {
        URL.revokeObjectURL(url);
        setPlayingVoice((current) => (current === name ? null : current));
      });
      await audio.play();
    } catch {
      setPlayingVoice(null);
    }
  }

  const handleFailure = useCallback((err: unknown) => {
    const code = (err as { code?: string | null } | null)?.code;
    if (code === "no_realistic_credits") setNeedsCredits(true);
    setError(err instanceof Error ? err.message : "Algo deu errado. Tente de novo.");
  }, []);

  // ---------- ações do fluxo ----------

  async function createScript() {
    setError(null);
    setNeedsCredits(false);
    setBusy("A IA está escrevendo o seu roteiro…");
    try {
      const created = await api<RealisticVideoRecord>("/api/realistic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          topic: topic.trim(),
          idea: idea.trim(),
          language,
          durationSeconds: duration,
          realisticStyle: mode === "free" ? DEFAULT_REALISTIC_STYLE : style,
          voice,
          backgroundMusicId: musicId,
          captionsEnabled: captionsOn,
          captionStyle: captionsOn ? captionStyle : null,
        }),
      });
      setVideo(created);
      setNarrations(created.script?.scenes.map((s) => s.narration) ?? []);
      setStep("roteiro");
    } catch (err) {
      handleFailure(err);
    } finally {
      setBusy(null);
    }
  }

  async function requestAnotherScript() {
    if (!video) return;
    setError(null);
    setBusy("Escrevendo um novo roteiro…");
    try {
      const updated = await api<RealisticVideoRecord>(`/api/realistic/${video.id}/script`, { method: "POST" });
      setVideo(updated);
      setNarrations(updated.script?.scenes.map((s) => s.narration) ?? []);
    } catch (err) {
      handleFailure(err);
    } finally {
      setBusy(null);
    }
  }

  async function approveScriptAndPreview() {
    if (!video?.script) return;
    setError(null);
    setBusy("Criando as imagens das cenas… (leva uns 20 segundos)");
    try {
      let current = video;
      const original = video.script.scenes.map((s) => s.narration);
      if (narrations.some((n, i) => n.trim() !== original[i])) {
        current = await api<RealisticVideoRecord>(`/api/realistic/${video.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ narrations }),
        });
      }
      const withImages = await api<RealisticVideoRecord>(`/api/realistic/${current.id}/images`, { method: "POST" });
      setVideo(withImages);
      setStep("previa");
    } catch (err) {
      handleFailure(err);
    } finally {
      setBusy(null);
    }
  }

  async function swapImage(scene: number) {
    if (!video) return;
    setError(null);
    setSwappingScene(scene);
    try {
      const updated = await api<RealisticVideoRecord>(`/api/realistic/${video.id}/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene }),
      });
      setVideo(updated);
    } catch (err) {
      handleFailure(err);
    } finally {
      setSwappingScene(null);
    }
  }

  async function animate() {
    if (!video) return;
    setError(null);
    setFailedMessage(null);
    setNeedsCredits(false);
    setBusy("Iniciando a animação…");
    try {
      const started = await api<RealisticVideoRecord>(`/api/realistic/${video.id}/animate`, { method: "POST" });
      setVideo(started);
      setStep("gerando");
      void refreshRealisticCredits();
    } catch (err) {
      handleFailure(err);
    } finally {
      setBusy(null);
    }
  }

  // Acompanha a geração (3 a 5 minutos). Pode fechar a janela: segue no servidor.
  const videoId = video?.id;
  useEffect(() => {
    if (step !== "gerando" || !videoId) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const latest = await api<RealisticVideoRecord>(`/api/realistic/${videoId}`);
        if (cancelled) return;
        setVideo(latest);
        if (latest.status === "Pronto") {
          setStep("pronto");
          void refreshRealisticCredits();
        } else if (latest.status === "Erro") {
          setFailedMessage(latest.errorMessage ?? "Não foi possível gerar o vídeo.");
          void refreshRealisticCredits();
        }
      } catch {
        // falha de rede passageira: tenta de novo no próximo ciclo
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [step, videoId, refreshRealisticCredits]);

  function resetForAnother() {
    setStep("inicio");
    setVideo(null);
    setNarrations([]);
    setTopic("");
    setIdea("");
    setError(null);
    setFailedMessage(null);
    setNeedsCredits(false);
  }

  // ---------- navegação ----------

  const canContinue = (() => {
    switch (step) {
      case "tema":
        return topic.trim().length >= 3;
      case "ideia":
        return idea.trim().length >= 3;
      case "ajustes":
        return voice !== null && (!captionsOn || captionStyle.length > 0);
      case "roteiro":
        return narrations.length > 0 && narrations.every((n) => n.trim().length > 0);
      default:
        return true;
    }
  })();

  function goNext() {
    setError(null);
    if (step === "ajustes") return void createScript();
    if (step === "roteiro") return void approveScriptAndPreview();
    const next = flow[flowIndex + 1];
    if (next) setStep(next);
  }

  function goBack() {
    setError(null);
    if (step === "roteiro" || step === "previa") {
      // Roteiro/prévia já geraram o rascunho: voltar à edição dos textos.
      setStep(step === "previa" ? "roteiro" : "ajustes");
      return;
    }
    const prev = flow[flowIndex - 1];
    if (prev) setStep(prev);
    else setStep("inicio");
  }

  function begin(chosen: Mode) {
    setMode(chosen);
    setError(null);
    setStep(chosen === "free" ? "ideia" : "tema");
  }

  const noCredits = realisticCredits < 1;
  // Créditos que ESTE vídeo vai gastar (1 para 30s, 2 para 60s).
  const cost = video?.creditCost ?? (duration === 60 ? 2 : 1);
  const canAfford = realisticCredits >= cost;
  const sceneTotal = video?.script?.scenes.length ?? (duration === 60 ? 12 : 6);
  const scriptsLeft = video ? REALISTIC_MAX_SCRIPT_GENERATIONS - video.scriptGenerations : 0;
  const swapsLeft = video ? REALISTIC_MAX_IMAGE_SWAPS - video.swapsUsed : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={closeRealisticWizard}
    >
      <div
        className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#0a0a12] sm:max-w-lg sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="shrink-0 border-b border-white/[0.06] px-5 pb-4 pt-5 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              {showProgressBar && (
                <span className="text-xs font-medium text-zinc-500">
                  Passo {flowIndex + 1} de {flow.length}
                </span>
              )}
              <h2 className="text-base font-semibold text-white sm:text-lg">{STEP_TITLES[step]}</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200">
                {realisticCredits} {realisticCredits === 1 ? "crédito" : "créditos"}
              </span>
              <button
                type="button"
                onClick={closeRealisticWizard}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white/5 hover:text-white"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          {showProgressBar && (
            <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] transition-all duration-300"
                style={{ width: `${((flowIndex + 1) / flow.length) * 100}%` }}
              />
            </div>
          )}
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {step === "inicio" && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 text-sm font-medium">
                <button
                  type="button"
                  onClick={() => {
                    closeRealisticWizard();
                    openWizard();
                  }}
                  className="rounded-full px-3 py-2 text-zinc-400 transition-colors hover:text-white"
                >
                  Vídeo normal
                </button>
                <span className="rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-3 py-2 text-center text-white">
                  Vídeo Realista ✨
                </span>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-sm text-zinc-400">Seus créditos realistas</p>
                <p className="mt-1 text-3xl font-extrabold text-white">{realisticCredits}</p>
                <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                  <strong className="text-zinc-300">1 crédito = vídeo de 30s • 2 créditos = vídeo de 60s</strong>, com
                  cenas em movimento real. O crédito só é gasto no final, quando você aprova e clica em
                  &ldquo;Animar meu vídeo&rdquo;. Roteiro e prévia das cenas são grátis.
                </p>
              </div>

              {noCredits && (
                <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-2.5 text-xs font-medium text-amber-300">
                  Você ainda não tem créditos realistas. Compre um pacote para criar.
                </p>
              )}

              {noCredits && (
                <button
                  type="button"
                  onClick={openRealisticBuy}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#4C3BFF]/25"
                >
                  <Sparkles className="h-4 w-4" />
                  Comprar vídeos realistas
                </button>
              )}

              <button
                type="button"
                disabled={noCredits}
                onClick={() => begin("guided")}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#4C3BFF]/25 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Wand2 className="h-4 w-4" />
                Criar com a ajuda da IA
              </button>
              <button
                type="button"
                disabled={noCredits}
                onClick={() => begin("free")}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <PenLine className="h-4 w-4" />
                Escrever minha ideia
              </button>
              {!noCredits && (
                <button
                  type="button"
                  onClick={openRealisticBuy}
                  className="text-center text-xs font-medium text-zinc-500 underline-offset-2 hover:text-white hover:underline"
                >
                  Comprar mais vídeos realistas
                </button>
              )}
            </div>
          )}

          {(step === "tema" || step === "ideia") && (
            <div className="flex flex-col gap-4">
              <textarea
                autoFocus
                rows={step === "ideia" ? 6 : 4}
                value={step === "ideia" ? idea : topic}
                maxLength={1200}
                onChange={(e) => (step === "ideia" ? setIdea(e.target.value) : setTopic(e.target.value))}
                placeholder={
                  step === "ideia"
                    ? "Conte com as suas palavras o que você quer ver no vídeo. Ex.: um astronauta caminhando num deserto vermelho, olhando a Terra no céu…"
                    : "Ex.: a história real do farol mais assombrado do mundo..."
                }
                className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#4C3BFF]/50 focus:outline-none"
              />
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-zinc-400">Idioma da narração</span>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as RealisticLanguage)}
                  className="h-11 w-full rounded-xl border border-white/10 bg-[#0a0a0b] px-3.5 text-sm text-white focus:border-[#4C3BFF]/50 focus:outline-none"
                >
                  {REALISTIC_LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <span className="mb-2 block text-xs font-medium text-zinc-400">Duração do vídeo</span>
                <div className="grid grid-cols-2 gap-2">
                  {REALISTIC_DURATIONS.map((d) => {
                    const disabled = realisticCredits < d.credits;
                    const isSelected = duration === d.seconds;
                    return (
                      <button
                        key={d.seconds}
                        type="button"
                        disabled={disabled}
                        onClick={() => setDuration(d.seconds)}
                        className={`rounded-2xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                          isSelected && !disabled
                            ? "border-[#4C3BFF]/60 bg-white/[0.08]"
                            : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                        }`}
                      >
                        <span className="block text-sm font-semibold text-white">{d.seconds} segundos</span>
                        <span className="block text-xs text-zinc-400">
                          {d.credits} {d.credits === 1 ? "crédito" : "créditos"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {realisticCredits < 2 && (
                  <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-amber-300">
                    Você precisa de 2 créditos para um vídeo de 60s.
                    <button type="button" onClick={openRealisticBuy} className="font-semibold underline">
                      Comprar mais
                    </button>
                  </p>
                )}
              </div>
              <p className="text-xs text-zinc-500">
                {step === "ideia"
                  ? "A IA transforma a sua ideia em um roteiro de cenas de 5 segundos, com imagens e movimento realistas."
                  : "Descreva o tema em poucas palavras — a IA escreve o roteiro e cria as cenas."}
              </p>
            </div>
          )}

          {step === "estilo" && (
            <div className="flex flex-col gap-3">
              {REALISTIC_STYLES.map((s) => {
                const isSelected = style === s.name;
                return (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => setStyle(s.name)}
                    className={`rounded-2xl border p-4 text-left transition-colors ${
                      isSelected
                        ? "border-[#4C3BFF]/60 bg-white/[0.08]"
                        : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                    }`}
                  >
                    <p className="text-sm font-semibold text-white">{s.name}</p>
                    <p className="mt-1 text-xs text-zinc-400">{s.description}</p>
                  </button>
                );
              })}
              <p className="text-xs text-zinc-500">
                As imagens são sempre fotorrealistas, com cara de filme — nunca desenho, quadrinho ou 3D.
              </p>
            </div>
          )}

          {step === "ajustes" && (
            <div className="flex flex-col gap-6">
              <section>
                <h3 className="mb-2.5 text-sm font-semibold text-white">Voz</h3>
                <div className="flex flex-col gap-2">
                  {SERIES_VOICES.map((v) => {
                    const isSelected = voice === v.name;
                    return (
                      <div
                        key={v.name}
                        onClick={() => setVoice(v.name)}
                        className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border p-3 transition-colors ${
                          isSelected
                            ? "border-[#4C3BFF]/60 bg-white/[0.08]"
                            : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white">
                            {v.name} <span className="text-xs font-normal text-zinc-500">· {v.gender}</span>
                          </p>
                          <p className="truncate text-xs text-zinc-500">{v.description}</p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void playVoice(v.name);
                          }}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 text-zinc-300 transition-colors hover:bg-white/10"
                          aria-label={`Ouvir prévia de ${v.name}`}
                        >
                          {playingVoice === v.name ? (
                            <Pause className="h-3.5 w-3.5" />
                          ) : (
                            <Play className="h-3.5 w-3.5 translate-x-0.5" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section>
                <h3 className="mb-2.5 text-sm font-semibold text-white">Música de fundo</h3>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setMusicId(null)}
                    className={`rounded-2xl border p-3 text-left text-sm font-medium text-white transition-colors ${
                      musicId === null
                        ? "border-[#4C3BFF]/60 bg-white/[0.08]"
                        : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                    }`}
                  >
                    Sem música
                  </button>
                  {tracksLoading && <p className="text-xs text-zinc-500">Carregando músicas…</p>}
                  {tracks.map((track) => (
                    <div key={track.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setMusicId(track.id)}
                        className={`flex flex-1 items-center gap-3 rounded-2xl border p-3 text-left transition-colors ${
                          musicId === track.id
                            ? "border-[#4C3BFF]/60 bg-white/[0.08]"
                            : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                        }`}
                      >
                        <Music className="h-4 w-4 shrink-0 text-zinc-500" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-white">{track.title}</span>
                          {track.description && (
                            <span className="block truncate text-xs text-zinc-500">{track.description}</span>
                          )}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => playUrl(track.url)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-zinc-300 hover:bg-white/10"
                        aria-label={`Ouvir ${track.title}`}
                      >
                        <Play className="h-3.5 w-3.5 translate-x-0.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="mb-2.5 text-sm font-semibold text-white">Estilo da legenda</h3>
                <div className="grid grid-cols-2 gap-2">
                  {SERIES_CAPTION_STYLES.map((c) => {
                    const isSelected = captionsOn && captionStyle === c.name;
                    return (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => {
                          setCaptionsOn(true);
                          setCaptionStyle(c.name);
                        }}
                        className={`rounded-2xl border p-3 text-center transition-colors ${
                          isSelected
                            ? "border-[#4C3BFF]/60 bg-white/[0.08]"
                            : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                        }`}
                      >
                        <span
                          className="block text-sm font-extrabold"
                          style={{
                            color: c.color,
                            textTransform: c.textTransform,
                            WebkitTextStroke: c.strokeColor ? `${c.strokeWidth} ${c.strokeColor}` : undefined,
                            paintOrder: "stroke fill",
                          }}
                        >
                          Você sabia disso?
                        </span>
                        <span className="mt-1.5 block text-[11px] text-zinc-500">{c.name}</span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setCaptionsOn(false)}
                    className={`col-span-2 rounded-2xl border p-3 text-sm font-medium text-white transition-colors ${
                      !captionsOn
                        ? "border-[#4C3BFF]/60 bg-white/[0.08]"
                        : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                    }`}
                  >
                    Sem legenda
                  </button>
                </div>
              </section>
            </div>
          )}

          {step === "roteiro" && video?.script && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-zinc-400">
                A IA escreveu este roteiro de {sceneTotal} cenas (5 segundos cada). Edite o que quiser ou peça outro — é de
                graça e não gasta crédito.
              </p>
              <p className="text-sm font-semibold text-white">{video.script.title}</p>
              {narrations.map((text, i) => (
                <label key={i} className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Cena {i + 1}
                  </span>
                  <textarea
                    rows={2}
                    value={text}
                    maxLength={240}
                    onChange={(e) =>
                      setNarrations((prev) => prev.map((n, idx) => (idx === i ? e.target.value : n)))
                    }
                    className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white focus:border-[#4C3BFF]/50 focus:outline-none"
                  />
                </label>
              ))}
              <button
                type="button"
                disabled={!!busy || scriptsLeft <= 0}
                onClick={() => void requestAnotherScript()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/15 px-6 py-2.5 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RefreshCw className="h-4 w-4" />
                Pedir outro roteiro {scriptsLeft > 0 ? `(${scriptsLeft} restantes)` : "(limite atingido)"}
              </button>
            </div>
          )}

          {step === "previa" && video && (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-zinc-400">
                Estas são as {sceneTotal} cenas do seu vídeo. Você pode trocar até {REALISTIC_MAX_IMAGE_SWAPS} imagens de graça
                ({swapsLeft} {swapsLeft === 1 ? "troca restante" : "trocas restantes"}). Quando estiver bom, anime.
              </p>
              <div className="grid grid-cols-3 gap-2.5">
                {video.sceneImageUrls.map((url, i) => (
                  <div key={url} className="flex flex-col gap-1.5">
                    <div className="relative aspect-[9/16] overflow-hidden rounded-xl bg-[#1c1c1f]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Cena ${i + 1}`} className="h-full w-full object-cover" />
                      <span className="absolute left-1.5 top-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {i + 1}
                      </span>
                      {swappingScene === i && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                          <Loader2 className="h-5 w-5 animate-spin text-white" />
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={swapsLeft <= 0 || swappingScene !== null || !!busy}
                      onClick={() => void swapImage(i)}
                      className="rounded-lg border border-white/10 px-2 py-1.5 text-[11px] font-medium text-zinc-300 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      Trocar
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-zinc-500">
                A legenda e a narração entram só no final. Estas imagens ficam sem texto.
              </p>
            </div>
          )}

          {step === "gerando" && !failedMessage && (
            <Generating video={video} />
          )}

          {step === "gerando" && failedMessage && (
            <div className="flex flex-col items-center py-2 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10">
                <AlertTriangle className="h-5 w-5 text-red-400" strokeWidth={2} />
              </span>
              <h3 className="mt-5 text-lg font-bold text-white">Não foi possível gerar o vídeo</h3>
              <p className="mt-1 max-w-xs text-sm text-zinc-400">{failedMessage}</p>
              <div className="mt-6 flex w-full flex-col gap-2.5">
                <button
                  type="button"
                  disabled={!!busy || !canAfford}
                  onClick={() => void animate()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#4C3BFF]/25 disabled:opacity-40"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Tentar de novo (usa {cost} {cost === 1 ? "crédito" : "créditos"})
                </button>
                <button
                  type="button"
                  onClick={closeRealisticWizard}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/5"
                >
                  Fechar
                </button>
              </div>
            </div>
          )}

          {step === "pronto" && video?.videoUrl && (
            <div className="flex flex-col items-center text-center">
              <video
                src={video.videoUrl}
                controls
                playsInline
                poster={video.thumbnailUrl ?? undefined}
                className="aspect-[9/16] w-48 rounded-2xl bg-black"
              />
              <p className="mt-4 max-w-xs text-sm text-zinc-400">
                {video.title} já está pronto e também fica em &ldquo;Meus vídeos&rdquo;.
              </p>
              <div className="mt-5 flex w-full flex-col gap-2.5">
                <a
                  href={`${video.videoUrl}?download=${encodeURIComponent(video.title || "video-realista")}.mp4`}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#4C3BFF]/25"
                >
                  <Download className="h-4 w-4" />
                  Baixar vídeo
                </a>
                <button
                  type="button"
                  onClick={resetForAnother}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/5"
                >
                  <Wand2 className="h-4 w-4" />
                  Criar outro vídeo realista
                </button>
              </div>
            </div>
          )}

          {busy && (
            <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-sm text-zinc-200">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              {busy}
            </div>
          )}

          {error && (
            <div className="mt-4 flex flex-col gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-red-400">
              <span className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </span>
              {needsCredits && (
                <button
                  type="button"
                  onClick={openRealisticBuy}
                  className="self-start rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15"
                >
                  Comprar vídeos realistas
                </button>
              )}
            </div>
          )}
        </div>

        {/* Rodapé */}
        {step !== "inicio" && step !== "gerando" && step !== "pronto" && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-4 sm:px-6">
            <button
              type="button"
              disabled={!!busy}
              onClick={goBack}
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:text-white disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>

            {step === "previa" ? (
              <button
                type="button"
                disabled={!!busy || swappingScene !== null || !canAfford}
                onClick={() => void animate()}
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#4C3BFF]/20 transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Sparkles className="h-4 w-4" />
                Animar meu vídeo (usa {cost} {cost === 1 ? "crédito" : "créditos"})
              </button>
            ) : (
              <button
                type="button"
                disabled={!canContinue || !!busy}
                onClick={goNext}
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#4C3BFF]/20 transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
              >
                {step === "ajustes" ? "Escrever roteiro" : step === "roteiro" ? "Ver as cenas" : "Próximo"}
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const STAGE_LABEL: Record<string, string> = {
  roteiro: "Escrevendo o roteiro",
  imagens: "Criando as imagens",
  animando: "Animando as cenas",
  montagem: "Montando o vídeo",
  salvando: "Finalizando",
};

export function realisticProgressPercent(stage: string | null, current: number | null, total: number | null): number {
  const n = total && total > 0 ? total : 6;
  const done = current ?? 0;
  switch (stage) {
    case "roteiro":
      return 4;
    case "imagens":
      return 10;
    case "animando":
      return 12 + Math.round(68 * (done / n));
    case "montagem":
      return 82 + Math.round(14 * (done / n));
    case "salvando":
      return 98;
    default:
      return 6;
  }
}

export function realisticStageText(stage: string | null, current: number | null, total: number | null): string {
  const base = (stage && STAGE_LABEL[stage]) || "Preparando";
  if ((stage === "animando" || stage === "montagem") && total) return `${base} (${current ?? 0} de ${total})`;
  return base;
}

function Generating({ video }: { video: RealisticVideoRecord | null }) {
  const percent = realisticProgressPercent(
    video?.progressStage ?? null,
    video?.progressCurrent ?? null,
    video?.progressTotal ?? null,
  );
  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-white">
          <Loader2 className="h-4 w-4 animate-spin text-[#A855F7]" />
          {realisticStageText(
            video?.progressStage ?? null,
            video?.progressCurrent ?? null,
            video?.progressTotal ?? null,
          )}
        </p>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] transition-all duration-700"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-3 text-sm text-zinc-300">
          Estamos animando suas cenas. Isso leva de{" "}
          <strong className="text-white">
            {(video?.durationSeconds ?? 30) === 60 ? "5 a 10 minutos" : "3 a 5 minutos"}
          </strong>
          .
        </p>
      </div>
      <p className="text-xs text-zinc-500">
        Você pode fechar esta janela — o vídeo continua sendo gerado e aparece em &ldquo;Meus vídeos&rdquo;. Se algo
        falhar, o seu crédito realista volta sozinho.
      </p>
    </div>
  );
}
