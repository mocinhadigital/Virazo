"use client";

import { useEffect, useState } from "react";
import {
  X,
  Play,
  Pause,
  CheckCircle2,
  Loader2,
  Circle,
  ArrowRight,
  ArrowLeft,
  Wand2,
  AlertTriangle,
} from "lucide-react";
import { useDashboard } from "./DashboardContext";
import { styleOptions } from "./styleOptions";

type StepKey =
  | "tema"
  | "estiloVisual"
  | "estilo"
  | "duracao"
  | "voz"
  | "legendas"
  | "revisao"
  | "geracao";

const STEP_ORDER: StepKey[] = [
  "tema",
  "estiloVisual",
  "estilo",
  "duracao",
  "voz",
  "legendas",
  "revisao",
];

const STEP_TITLES: Record<StepKey, string> = {
  tema: "Sobre o que é o vídeo?",
  estiloVisual: "Escolha o estilo visual",
  estilo: "Escolha um estilo",
  duracao: "Duração do vídeo",
  voz: "Escolha uma voz",
  legendas: "Legendas",
  revisao: "Revisão final",
  geracao: "Gerando seu vídeo",
};

const STORAGE_BASE = "https://bjxfrufuuosufnhnzajc.supabase.co/storage/v1/object/public/videos/_style-thumbnails";

const VISUAL_STYLES = [
  { name: "Anime", gradient: "from-cyan-400 to-blue-600", thumbnail: `${STORAGE_BASE}/anime.jpg` },
  { name: "Comic", gradient: "from-yellow-400 to-red-500", thumbnail: `${STORAGE_BASE}/comic.jpg` },
  {
    name: "Cartoon 3D",
    gradient: "from-emerald-400 to-teal-600",
    thumbnail: `${STORAGE_BASE}/cartoon-3d.jpg`,
  },
  {
    name: "Realista",
    gradient: "from-zinc-500 to-slate-700",
    thumbnail: `${STORAGE_BASE}/realista.jpg`,
  },
  {
    name: "Dark Fantasy",
    gradient: "from-slate-800 to-red-900",
    thumbnail: `${STORAGE_BASE}/dark-fantasy.jpg`,
  },
  {
    name: "Pintura Clássica",
    gradient: "from-amber-600 to-orange-800",
    thumbnail: `${STORAGE_BASE}/pintura-classica.jpg`,
  },
];

const DURATIONS = [
  { value: "15s", label: "Rápido e direto" },
  { value: "30s", label: "Ideal para Reels/TikTok" },
  { value: "60s", label: "Mais contexto" },
  { value: "90s", label: "Storytelling completo" },
];

const VOICES = [
  { name: "Ana", tag: "Feminina · Natural" },
  { name: "Lucas", tag: "Masculina · Confiante" },
  { name: "Sofia", tag: "Feminina · Jovem" },
  { name: "Marcos", tag: "Masculina · Grave" },
];

const CAPTION_STYLES = [
  { name: "Clássica", sample: "legenda simples embaixo" },
  { name: "Destaque", sample: "PALAVRA em destaque" },
  { name: "Minimalista", sample: "texto discreto" },
];

const STAGES = [
  "Escrevendo roteiro",
  "Gerando narração",
  "Criando cenas",
  "Adicionando legendas",
  "Renderizando vídeo",
];

export default function CreateVideoWizard() {
  const { isWizardOpen } = useDashboard();
  if (!isWizardOpen) return null;
  return <WizardPanel />;
}

function WizardPanel() {
  const { wizardInitial, closeWizard, addVideo, credits } = useDashboard();

  const [step, setStep] = useState<StepKey>("tema");
  const [topic, setTopic] = useState(wizardInitial.topic ?? "");
  const [visualStyle, setVisualStyle] = useState<string | null>(null);
  const [style, setStyle] = useState<string | null>(wizardInitial.style ?? null);
  const [duration, setDuration] = useState<string | null>(null);
  const [voice, setVoice] = useState<string | null>(null);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [captionStyle, setCaptionStyle] = useState<string | null>("Destaque");

  const [progress, setProgress] = useState(0);
  const [isDone, setIsDone] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const stepIndex = STEP_ORDER.indexOf(step);
  const isFormStep = step !== "geracao";

  useEffect(() => {
    if (step === "revisao") {
      // LOG TEMPORÁRIO — remover depois de descobrir o problema dos créditos.
      console.log("[Virazo debug] tela de revisão — valor de credits neste momento:", credits);
    }
  }, [step, credits]);

  useEffect(() => {
    if (step !== "geracao" || progress >= 100) return;
    const timer = setTimeout(() => setProgress((p) => Math.min(100, p + 4)), 140);
    return () => clearTimeout(timer);
  }, [step, progress]);

  useEffect(() => {
    if (progress < 100 || isDone || genError) return;
    let cancelled = false;

    (async () => {
      const selectedStyle = styleOptions.find((s) => s.title === style);
      try {
        await addVideo({
          title: topic.trim() || "Vídeo sem título",
          topic: topic.trim(),
          style: style ?? "Personalizado",
          visualStyle,
          duration: duration ?? "30s",
          voice: voice ?? "",
          captionsEnabled: captionsOn,
          captionStyle: captionsOn ? captionStyle : null,
          gradient: selectedStyle?.gradient ?? "from-[#FF6B5B] to-[#FFB84D]",
        });
        if (!cancelled) setIsDone(true);
      } catch (err) {
        if (!cancelled) {
          setGenError(
            err instanceof Error ? err.message : "Não foi possível gerar o vídeo.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [progress, isDone, genError, style, topic, duration, voice, captionsOn, captionStyle, addVideo]);

  const currentStageIndex = Math.min(
    STAGES.length - 1,
    Math.floor((progress / 100) * STAGES.length),
  );

  const canGoNext = (() => {
    switch (step) {
      case "tema":
        return topic.trim().length > 0;
      case "estiloVisual":
        return visualStyle !== null;
      case "estilo":
        return style !== null;
      case "duracao":
        return duration !== null;
      case "voz":
        return voice !== null;
      case "revisao":
        return credits > 0;
      default:
        return true;
    }
  })();

  function goNext() {
    if (step === "revisao") {
      setProgress(0);
      setIsDone(false);
      setGenError(null);
      setStep("geracao");
      return;
    }
    const next = STEP_ORDER[stepIndex + 1];
    if (next) setStep(next);
  }

  function goBack() {
    const prev = STEP_ORDER[stepIndex - 1];
    if (prev) setStep(prev);
  }

  function resetForAnother() {
    setStep("tema");
    setTopic("");
    setVisualStyle(null);
    setStyle(null);
    setDuration(null);
    setVoice(null);
    setCaptionsOn(true);
    setCaptionStyle("Destaque");
    setProgress(0);
    setIsDone(false);
    setGenError(null);
  }

  function toggleVoicePreview(name: string) {
    if (playingVoice === name) {
      setPlayingVoice(null);
      return;
    }
    setPlayingVoice(name);
    setTimeout(() => setPlayingVoice((current) => (current === name ? null : current)), 1400);
  }

  const selectedStyleOption = styleOptions.find((s) => s.title === style);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={closeWizard}
    >
      <div
        className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#0a0a12] sm:max-w-lg sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-white/[0.06] px-5 pb-4 pt-5 sm:px-6">
          <div className="flex items-center justify-between">
            <div>
              {isFormStep && (
                <span className="text-xs font-medium text-zinc-500">
                  Passo {stepIndex + 1} de {STEP_ORDER.length}
                </span>
              )}
              <h2 className="text-base font-semibold text-white sm:text-lg">
                {STEP_TITLES[step]}
              </h2>
            </div>
            <button
              type="button"
              onClick={closeWizard}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white/5 hover:text-white"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {isFormStep && (
            <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#FF6B5B] to-[#FFB84D] transition-all duration-300"
                style={{ width: `${((stepIndex + 1) / STEP_ORDER.length) * 100}%` }}
              />
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {step === "tema" && (
            <div className="flex flex-col gap-2.5">
              <textarea
                autoFocus
                rows={4}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Ex.: 5 dicas para produtividade no trabalho remoto..."
                className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#FF6B5B]/50 focus:outline-none"
              />
              <p className="text-xs text-zinc-500">
                Descreva o tema em poucas palavras — a IA escreve o roteiro completo.
              </p>
            </div>
          )}

          {step === "estiloVisual" && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {VISUAL_STYLES.map(({ name, gradient, thumbnail }) => {
                const isSelected = visualStyle === name;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setVisualStyle(name)}
                    className={`overflow-hidden rounded-2xl border text-left transition-colors ${
                      isSelected
                        ? "border-[#FF6B5B]/60 bg-white/[0.08]"
                        : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className={`aspect-[3/4] w-full bg-gradient-to-br ${gradient}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumbnail}
                        alt={`Exemplo do estilo ${name}`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <span className="block px-2.5 py-2 text-xs font-medium text-white">
                      {name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {step === "estilo" && (
            <div className="grid grid-cols-2 gap-3">
              {styleOptions.map(({ icon: Icon, title, gradient }) => {
                const isSelected = style === title;
                return (
                  <button
                    key={title}
                    type="button"
                    onClick={() => setStyle(title)}
                    className={`flex flex-col items-start gap-2.5 rounded-2xl border p-4 text-left transition-colors ${
                      isSelected
                        ? "border-[#FF6B5B]/60 bg-white/[0.08]"
                        : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${gradient}`}
                    >
                      <Icon className="h-4 w-4 text-white" strokeWidth={2} />
                    </span>
                    <span className="text-sm font-medium text-white">{title}</span>
                  </button>
                );
              })}
            </div>
          )}

          {step === "duracao" && (
            <div className="grid grid-cols-2 gap-3">
              {DURATIONS.map(({ value, label }) => {
                const isSelected = duration === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDuration(value)}
                    className={`flex flex-col items-start gap-1 rounded-2xl border p-4 text-left transition-colors ${
                      isSelected
                        ? "border-[#FF6B5B]/60 bg-white/[0.08]"
                        : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                    }`}
                  >
                    <span className="text-lg font-bold text-white">{value}</span>
                    <span className="text-xs text-zinc-400">{label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {step === "voz" && (
            <div className="flex flex-col gap-2.5">
              {VOICES.map(({ name, tag }) => {
                const isSelected = voice === name;
                const isPlaying = playingVoice === name;
                return (
                  <div
                    key={name}
                    onClick={() => setVoice(name)}
                    className={`flex cursor-pointer items-center justify-between rounded-2xl border p-3.5 transition-colors ${
                      isSelected
                        ? "border-[#FF6B5B]/60 bg-white/[0.08]"
                        : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                          isSelected ? "border-[#FF6B5B] bg-[#FF6B5B]" : "border-white/20"
                        }`}
                      />
                      <div>
                        <p className="text-sm font-medium text-white">{name}</p>
                        <p className="text-xs text-zinc-500">{tag}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleVoicePreview(name);
                      }}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 text-zinc-300 transition-colors hover:bg-white/10"
                      aria-label={`Ouvir prévia de ${name}`}
                    >
                      {isPlaying ? (
                        <Pause className="h-3.5 w-3.5" />
                      ) : (
                        <Play className="h-3.5 w-3.5 translate-x-0.5" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {step === "legendas" && (
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div>
                  <p className="text-sm font-medium text-white">Ativar legendas</p>
                  <p className="text-xs text-zinc-500">Sincronizadas automaticamente com a narração</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={captionsOn}
                  onClick={() => setCaptionsOn((v) => !v)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    captionsOn ? "bg-gradient-to-r from-[#FF6B5B] to-[#FFB84D]" : "bg-white/10"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      captionsOn ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>

              {captionsOn ? (
                <div className="grid grid-cols-1 gap-2.5">
                  {CAPTION_STYLES.map(({ name, sample }) => {
                    const isSelected = captionStyle === name;
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setCaptionStyle(name)}
                        className={`flex items-center justify-between rounded-2xl border p-3.5 text-left transition-colors ${
                          isSelected
                            ? "border-[#FF6B5B]/60 bg-white/[0.08]"
                            : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                        }`}
                      >
                        <span className="text-sm font-medium text-white">{name}</span>
                        <span className="text-xs text-zinc-500">{sample}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-zinc-500">
                  Seu vídeo será gerado sem legendas.
                </p>
              )}
            </div>
          )}

          {step === "revisao" && (
            <div className="flex flex-col gap-2.5">
              <ReviewRow label="Tema" value={topic || "—"} onEdit={() => setStep("tema")} />
              <ReviewRow
                label="Estilo visual"
                value={visualStyle ?? "—"}
                onEdit={() => setStep("estiloVisual")}
              />
              <ReviewRow
                label="Estilo"
                value={style ?? "—"}
                onEdit={() => setStep("estilo")}
              />
              <ReviewRow
                label="Duração"
                value={duration ?? "—"}
                onEdit={() => setStep("duracao")}
              />
              <ReviewRow label="Voz" value={voice ?? "—"} onEdit={() => setStep("voz")} />
              <ReviewRow
                label="Legendas"
                value={captionsOn ? (captionStyle ?? "Ativadas") : "Desativadas"}
                onEdit={() => setStep("legendas")}
              />
              {credits > 0 ? (
                <p className="mt-2 text-xs text-zinc-500">
                  A geração deste vídeo vai usar 1 crédito. Você tem {credits}{" "}
                  {credits === 1 ? "crédito" : "créditos"}.
                </p>
              ) : (
                <p className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-2.5 text-xs font-medium text-amber-400">
                  Você não tem créditos suficientes para gerar este vídeo.
                </p>
              )}
            </div>
          )}

          {step === "geracao" && !isDone && !genError && (
            <div className="flex flex-col gap-6 py-2">
              <div>
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>Gerando com IA...</span>
                  <span>{progress}%</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#FF6B5B] to-[#FFB84D] transition-all duration-150"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {STAGES.map((stageLabel, i) => {
                  const state =
                    i < currentStageIndex ? "done" : i === currentStageIndex ? "active" : "pending";
                  return (
                    <div key={stageLabel} className="flex items-center gap-3">
                      {state === "done" && (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      )}
                      {state === "active" && (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#FF6B5B]" />
                      )}
                      {state === "pending" && (
                        <Circle className="h-4 w-4 shrink-0 text-zinc-700" />
                      )}
                      <span
                        className={`text-sm ${
                          state === "pending" ? "text-zinc-600" : "text-zinc-200"
                        }`}
                      >
                        {stageLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {step === "geracao" && genError && (
            <div className="flex flex-col items-center py-2 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10">
                <AlertTriangle className="h-5 w-5 text-red-400" strokeWidth={2} />
              </span>
              <h3 className="mt-5 text-lg font-bold text-white">
                Não foi possível gerar o vídeo
              </h3>
              <p className="mt-1 max-w-xs text-sm text-zinc-400">{genError}</p>

              <div className="mt-6 flex w-full flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setGenError(null);
                    setProgress(0);
                    setStep("revisao");
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#FF6B5B] to-[#FFB84D] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#FF6B5B]/25"
                >
                  Voltar para revisão
                </button>
                <button
                  type="button"
                  onClick={closeWizard}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/5"
                >
                  Fechar
                </button>
              </div>
            </div>
          )}

          {step === "geracao" && isDone && (
            <div className="flex flex-col items-center py-2 text-center">
              <div
                className={`relative aspect-[9/16] w-32 overflow-hidden rounded-2xl bg-gradient-to-br ${
                  selectedStyleOption?.gradient ?? "from-[#FF6B5B] to-[#FFB84D]"
                }`}
              >
                <div className="absolute inset-0 bg-black/20" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30">
                    <Play className="h-3.5 w-3.5 translate-x-0.5 fill-white text-white" />
                  </span>
                </div>
                <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/40 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  {duration ?? "30s"}
                </span>
              </div>

              <h3 className="mt-5 text-lg font-bold text-white">Vídeo pronto!</h3>
              <p className="mt-1 max-w-xs text-sm text-zinc-400">
                {topic || "Seu vídeo"} já está disponível no seu painel.
              </p>

              <div className="mt-6 flex w-full flex-col gap-2.5">
                <button
                  type="button"
                  onClick={closeWizard}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#FF6B5B] to-[#FFB84D] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#FF6B5B]/25"
                >
                  Ver no painel
                </button>
                <button
                  type="button"
                  onClick={resetForAnother}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/5"
                >
                  <Wand2 className="h-4 w-4" />
                  Criar outro vídeo
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {isFormStep && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/[0.06] px-5 py-4 sm:px-6">
            {step !== "tema" ? (
              <button
                type="button"
                onClick={goBack}
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </button>
            ) : (
              <span />
            )}

            <button
              type="button"
              disabled={!canGoNext}
              onClick={goNext}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#FF6B5B] to-[#FFB84D] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#FF6B5B]/20 transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
            >
              {step === "revisao" ? (
                <>
                  <Wand2 className="h-4 w-4" />
                  Gerar vídeo
                </>
              ) : (
                <>
                  Próximo
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewRow({
  label,
  value,
  onEdit,
}: {
  label: string;
  value: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs text-zinc-500">{label}</p>
        <p className="truncate text-sm font-medium text-white">{value}</p>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 text-xs font-semibold text-[#FF6B5B] hover:text-[#FFB84D]"
      >
        Editar
      </button>
    </div>
  );
}
