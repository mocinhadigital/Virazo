"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TrendingUp, Loader2, AlertTriangle, Play, ArrowLeft } from "lucide-react";
import { styleOptions } from "../styleOptions";
import { VISUAL_STYLES } from "../visualStyles";
import {
  SERIES_DURATIONS,
  SERIES_VOICES,
  SERIES_CAPTION_STYLES,
  FREQUENCIA_OPTIONS,
  IDIOMA_OPTIONS,
} from "./seriesOptions";

type StepKey = "nicho" | "idioma" | "tom" | "visual" | "legenda" | "detalhes";

const STEP_ORDER: StepKey[] = ["nicho", "idioma", "tom", "visual", "legenda", "detalhes"];

const STEP_TITLES: Record<StepKey, string> = {
  nicho: "Escolha seu nicho",
  idioma: "Idioma e voz",
  tom: "Tom de voz do conteúdo",
  visual: "Estilo visual",
  legenda: "Estilo de legenda",
  detalhes: "Detalhes da série",
};

const NICHO_PRESETS = [
  {
    label: "Medieval",
    description: "História medieval real: reis, cercos e traições, com peso de crônica.",
    trending: true,
  },
  {
    label: "Terror",
    description: "Histórias de terror originais, inventadas do zero a cada vídeo.",
    trending: true,
  },
  {
    label: "True crime",
    description: "Casos reais e documentados, contados com frieza e respeito.",
    trending: false,
  },
  {
    label: "Mitologia",
    description: "Deuses, monstros e escolhas com preço alto, além do óbvio.",
    trending: false,
  },
  {
    label: "E se...",
    description: "Cenários hipotéticos levados a sério, com consequências reais.",
    trending: true,
  },
  {
    label: "Histórias bíblicas",
    description: "As narrativas do texto com peso dramático, sem sermão.",
    trending: false,
  },
  {
    label: "Espaço e universo",
    description: "Escala cósmica traduzida em comparações que desestabilizam.",
    trending: false,
  },
  {
    label: "Estoicismo",
    description: "Filosofia prática aplicada a um problema moderno por vez.",
    trending: false,
  },
];

type FormState = {
  title: string;
  nicho: string;
  tomDeVoz: string;
  idioma: "pt" | "en" | "es";
  visualStyle: string;
  voice: string;
  duration: string;
  captionsEnabled: boolean;
  captionStyle: string | null;
  frequenciaDias: number;
  horario: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  nicho: "",
  tomDeVoz: styleOptions[0]?.title ?? "Storytelling",
  idioma: "pt",
  visualStyle: VISUAL_STYLES[0]?.name ?? "Realista",
  voice: "",
  duration: "30s",
  captionsEnabled: true,
  captionStyle: "Destaque",
  frequenciaDias: 1,
  horario: "09:00",
};

export default function SeriesWizard() {
  const router = useRouter();
  const [step, setStep] = useState<StepKey>("nicho");
  const [nichoTab, setNichoTab] = useState<"presets" | "personalizado">("presets");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewLoadingVoice, setPreviewLoadingVoice] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const stepIndex = STEP_ORDER.indexOf(step);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function playVoicePreview(voiceName: string) {
    previewAudioRef.current?.pause();
    setPreviewLoadingVoice(voiceName);
    try {
      const res = await fetch(`/api/voices/preview?voice=${encodeURIComponent(voiceName)}`);
      if (!res.ok) throw new Error("Não foi possível carregar a prévia.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      audio.addEventListener("ended", () => URL.revokeObjectURL(url));
      await audio.play();
    } catch {
      // Falha silenciosa: o botão volta ao ícone de play, sem travar a UI.
    } finally {
      setPreviewLoadingVoice(null);
    }
  }

  const canContinue = (() => {
    switch (step) {
      case "nicho":
        return form.nicho.trim().length > 0;
      case "idioma":
        return form.voice.trim().length > 0;
      case "tom":
        return form.tomDeVoz.trim().length > 0;
      case "visual":
        return form.visualStyle.trim().length > 0;
      case "legenda":
        return true;
      case "detalhes":
        return form.title.trim().length > 0 && form.duration.trim().length > 0;
      default:
        return true;
    }
  })();

  function goBack() {
    const prev = STEP_ORDER[stepIndex - 1];
    if (prev) setStep(prev);
  }

  async function goNext() {
    if (step !== "detalhes") {
      const next = STEP_ORDER[stepIndex + 1];
      if (next) setStep(next);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível criar a série.");
      router.push("/dashboard/series");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar a série.");
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[720px]">
      <div className="flex gap-2">
        {STEP_ORDER.map((s, i) => (
          <span
            key={s}
            className={`h-1.5 flex-1 rounded-full ${
              i <= stepIndex ? "bg-gradient-to-r from-[#4C3BFF] to-[#A855F7]" : "bg-white/[0.06]"
            }`}
          />
        ))}
      </div>

      <div className="mt-10">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-white">
            {STEP_TITLES[step]}
          </h1>
          <span className="rounded-full border border-white/10 px-3 py-1 text-[12px] font-medium text-zinc-400">
            Etapa {stepIndex + 1} de {STEP_ORDER.length}
          </span>
        </div>
        <p className="mt-3 text-[15px] text-zinc-400">
          {step === "nicho" && "Selecione um preset ou descreva seu próprio nicho"}
          {step === "idioma" && "Escolha o idioma e a voz que vão narrar seus vídeos"}
          {step === "tom" && "Que tom o conteúdo da sua série deve ter"}
          {step === "visual" && "Escolha o estilo das imagens dos seus vídeos"}
          {step === "legenda" && "Escolha como as legendas aparecem nos seus vídeos"}
          {step === "detalhes" && "Dê um nome à série e configure o ritmo dos vídeos"}
        </p>
      </div>

      <div className="mt-8">
        {step === "nicho" && (
          <>
            <div className="flex gap-6 border-b border-white/10">
              <button
                type="button"
                onClick={() => setNichoTab("presets")}
                className={`-mb-px border-b-2 pb-3 text-[14px] font-medium transition-colors ${
                  nichoTab === "presets"
                    ? "border-white text-white"
                    : "border-transparent text-zinc-600 hover:text-zinc-400"
                }`}
              >
                Presets
              </button>
              <button
                type="button"
                onClick={() => setNichoTab("personalizado")}
                className={`-mb-px border-b-2 pb-3 text-[14px] font-medium transition-colors ${
                  nichoTab === "personalizado"
                    ? "border-white text-white"
                    : "border-transparent text-zinc-600 hover:text-zinc-400"
                }`}
              >
                Personalizado
              </button>
            </div>

            {nichoTab === "presets" ? (
              <div className="mt-6 flex flex-col gap-3">
                {NICHO_PRESETS.map((preset) => {
                  const isSelected = form.nicho === preset.label;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => update("nicho", preset.label)}
                      className={`relative rounded-[20px] border px-5 py-4 text-left transition-colors ${
                        isSelected
                          ? "border-[#4C3BFF]/60 bg-[#141416] shadow-[0_0_0_1px_rgba(76,59,255,0.35)]"
                          : "border-white/[0.08] bg-[#141416] hover:border-white/20"
                      }`}
                    >
                      {preset.trending && (
                        <span className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                          <TrendingUp className="h-3 w-3" />
                          Em alta agora
                        </span>
                      )}
                      <p className="pr-28 text-[15px] font-semibold leading-[1.6] text-white/92">{preset.label}</p>
                      <p className="mt-1 text-[14px] leading-[1.6] text-white/55">{preset.description}</p>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-6">
                <label className="block">
                  <span className="mb-1.5 block text-[14px] font-medium text-white">Nicho</span>
                  <textarea
                    rows={3}
                    value={form.nicho}
                    onChange={(e) => update("nicho", e.target.value)}
                    placeholder="Ex.: Curiosidades científicas para quem odiava física na escola"
                    className="w-full resize-none rounded-xl border border-white/10 bg-[#0a0a0b] px-3.5 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-[#4C3BFF]/50 focus:outline-none"
                  />
                </label>
              </div>
            )}
          </>
        )}

        {step === "idioma" && (
          <div className="flex flex-col gap-6">
            <div>
              <label className="text-[14px] font-medium text-white/92">Idioma</label>
              <select
                value={form.idioma}
                onChange={(e) => update("idioma", e.target.value as FormState["idioma"])}
                className="mt-2 h-12 w-full rounded-xl border border-white/[0.08] bg-[#0a0a0b] px-3.5 text-[15px] text-white/92 focus:border-[#4C3BFF]/50 focus:outline-none"
              >
                {IDIOMA_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <p className="text-[14px] font-medium text-white/92">Voz</p>
              <div className="mt-2 overflow-hidden rounded-[20px] border border-white/[0.08]">
                {SERIES_VOICES.map((v, i) => {
                  const isSelected = form.voice === v.name;
                  const isLoadingPreview = previewLoadingVoice === v.name;
                  return (
                    <div
                      key={v.name}
                      className={`flex items-center gap-4 px-5 py-4 ${
                        i !== 0 ? "border-t border-white/[0.08]" : ""
                      }`}
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        aria-label={`Selecionar voz ${v.name}`}
                        onClick={() => update("voice", v.name)}
                        className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
                          isSelected ? "border-[#4C3BFF]" : "border-white/[0.14]"
                        }`}
                      >
                        {isSelected && (
                          <span className="size-2.5 rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7]" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => update("voice", v.name)}
                        className="flex-1 text-left"
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-[15px] font-semibold text-white/92">{v.name}</span>
                          <span className="rounded-full bg-[#1c1c1f] px-2 py-0.5 text-[11px] font-medium text-white/55">
                            {v.gender}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-[14px] text-white/55">{v.description}</span>
                      </button>

                      <button
                        type="button"
                        aria-label={`Ouvir prévia de ${v.name}`}
                        onClick={() => playVoicePreview(v.name)}
                        disabled={isLoadingPreview}
                        className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] text-white/55 transition-colors hover:border-white/[0.14] hover:text-white/92 disabled:cursor-wait"
                      >
                        {isLoadingPreview ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {step === "tom" && (
          <div className="grid grid-cols-2 gap-3">
            {styleOptions.map(({ icon: Icon, title, gradient }) => {
              const isSelected = form.tomDeVoz === title;
              return (
                <button
                  key={title}
                  type="button"
                  onClick={() => update("tomDeVoz", title)}
                  className={`flex flex-col items-start gap-2.5 rounded-[20px] border p-4 text-left transition-colors ${
                    isSelected
                      ? "border-[#4C3BFF]/60 bg-white/[0.04] shadow-[0_0_0_1px_rgba(76,59,255,0.35)]"
                      : "border-white/[0.08] bg-white/[0.02] hover:border-white/20"
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

        {step === "visual" && (
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {VISUAL_STYLES.map(({ name, gradient, thumbnail }) => {
              const isSelected = form.visualStyle === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => update("visualStyle", name)}
                  className="w-[140px] shrink-0 text-left"
                >
                  <div
                    className={`relative aspect-[9/16] overflow-hidden rounded-[20px] border bg-gradient-to-br ${gradient} ${
                      isSelected
                        ? "border-[#4C3BFF] shadow-[0_0_0_1px_rgba(76,59,255,0.5)]"
                        : "border-white/10"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumbnail}
                      alt={`Exemplo do estilo ${name}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <p className="mt-3 text-[14px] font-medium text-zinc-300">{name}</p>
                </button>
              );
            })}
          </div>
        )}

        {step === "legenda" && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between rounded-[20px] border border-white/10 bg-white/[0.02] p-4">
              <div>
                <p className="text-sm font-medium text-white">Ativar legendas</p>
                <p className="text-xs text-zinc-500">Sincronizadas automaticamente com a narração</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.captionsEnabled}
                onClick={() => update("captionsEnabled", !form.captionsEnabled)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  form.captionsEnabled ? "bg-gradient-to-r from-[#4C3BFF] to-[#A855F7]" : "bg-white/10"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    form.captionsEnabled ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>

            {form.captionsEnabled && (
              <div className="flex flex-col gap-2.5">
                {SERIES_CAPTION_STYLES.map((c) => {
                  const isSelected = form.captionStyle === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => update("captionStyle", c)}
                      className={`flex items-center justify-between rounded-[20px] border px-5 py-4 text-left transition-colors ${
                        isSelected
                          ? "border-[#4C3BFF]/60 bg-white/[0.04]"
                          : "border-white/[0.08] bg-white/[0.02] hover:border-white/20"
                      }`}
                    >
                      <span className="text-sm font-medium text-white">{c}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {step === "detalhes" && (
          <div className="flex flex-col gap-6">
            <label className="block">
              <span className="mb-1.5 block text-[14px] font-medium text-white">Nome da série</span>
              <input
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder="Ex.: Curiosidades Históricas Diárias"
                className="h-12 w-full rounded-xl border border-white/[0.08] bg-[#0a0a0b] px-3.5 text-[15px] text-white placeholder:text-zinc-600 focus:border-[#4C3BFF]/50 focus:outline-none"
              />
            </label>

            <div>
              <p className="text-[14px] font-medium text-white">Duração dos vídeos</p>
              <div className="mt-2 grid grid-cols-2 gap-3">
                {SERIES_DURATIONS.map((d) => {
                  const isSelected = form.duration === d.value;
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => update("duration", d.value)}
                      className={`flex flex-col items-start gap-1 rounded-[20px] border p-4 text-left transition-colors ${
                        isSelected
                          ? "border-[#4C3BFF]/60 bg-white/[0.04]"
                          : "border-white/[0.08] bg-white/[0.02] hover:border-white/20"
                      }`}
                    >
                      <span className="text-lg font-bold text-white">{d.value}</span>
                      <span className="text-xs text-zinc-400">{d.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-[14px] font-medium text-white">Frequência</span>
                <select
                  value={form.frequenciaDias}
                  onChange={(e) => update("frequenciaDias", Number(e.target.value))}
                  className="h-12 w-full rounded-xl border border-white/[0.08] bg-[#0a0a0b] px-3.5 text-[15px] text-white focus:border-[#4C3BFF]/50 focus:outline-none"
                >
                  {FREQUENCIA_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[14px] font-medium text-white">Horário</span>
                <input
                  type="time"
                  value={form.horario}
                  onChange={(e) => update("horario", e.target.value)}
                  className="h-12 w-full rounded-xl border border-white/[0.08] bg-[#0a0a0b] px-3.5 text-[15px] text-white focus:border-[#4C3BFF]/50 focus:outline-none"
                />
              </label>
            </div>

            <p className="text-xs text-zinc-500">
              Sua série vai gerar um novo vídeo automaticamente no ritmo que você escolher acima.
              Você pode pausar ou pedir uma geração extra a qualquer momento em &ldquo;Séries&rdquo;.
            </p>

            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-12 flex items-center justify-between">
        {step !== "nicho" ? (
          <button
            type="button"
            onClick={goBack}
            className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/[0.08] px-5 text-[15px] font-medium text-white/55 transition-colors hover:text-white/92"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.7} />
            Voltar
          </button>
        ) : (
          <span />
        )}

        <button
          type="button"
          disabled={!canContinue || saving}
          onClick={goNext}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#4C3BFF] to-[#A855F7] px-6 text-[15px] font-medium text-white/92 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {step === "detalhes" ? "Criar série" : "Continuar"}
        </button>
      </div>
    </div>
  );
}
