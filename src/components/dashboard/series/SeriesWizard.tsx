"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  TrendingUp,
  Loader2,
  AlertTriangle,
  Play,
  ArrowLeft,
  Music,
  UploadCloud,
} from "lucide-react";
import { styleOptions } from "../styleOptions";
import { VISUAL_STYLES } from "../visualStyles";
import type { MusicTrackRecord } from "../musicMapping";
import {
  SERIES_DURATIONS,
  SERIES_VOICES,
  SERIES_CAPTION_STYLES,
  FREQUENCIA_OPTIONS,
  IDIOMA_OPTIONS,
} from "./seriesOptions";

type StepKey = "nicho" | "idioma" | "musica" | "visual" | "legenda" | "detalhes";

const STEP_ORDER: StepKey[] = ["nicho", "idioma", "musica", "visual", "legenda", "detalhes"];

const STEP_TITLES: Record<StepKey, string> = {
  nicho: "Escolha seu nicho",
  idioma: "Idioma e voz",
  musica: "Música de fundo",
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
  backgroundMusicIds: string[];
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
  backgroundMusicIds: [],
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
  const [musicTab, setMusicTab] = useState<"prontas" | "personalizada">("prontas");
  const [musicTracks, setMusicTracks] = useState<MusicTrackRecord[]>([]);
  const [musicLoading, setMusicLoading] = useState(false);
  const [musicUploading, setMusicUploading] = useState(false);
  const [musicError, setMusicError] = useState<string | null>(null);

  const stepIndex = STEP_ORDER.indexOf(step);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function loadMusicTracks() {
    setMusicLoading(true);
    try {
      const res = await fetch("/api/music-tracks");
      const data = (await res.json()) as MusicTrackRecord[];
      setMusicTracks(Array.isArray(data) ? data : []);
    } catch {
      setMusicTracks([]);
    } finally {
      setMusicLoading(false);
    }
  }


  function toggleMusicTrack(id: string) {
    setForm((f) => ({
      ...f,
      backgroundMusicIds: f.backgroundMusicIds.includes(id)
        ? f.backgroundMusicIds.filter((existing) => existing !== id)
        : [...f.backgroundMusicIds, id],
    }));
  }

  function playMusicPreview(url: string) {
    previewAudioRef.current?.pause();
    const audio = new Audio(url);
    previewAudioRef.current = audio;
    audio.play().catch(() => {});
  }

  async function handleMusicUpload(file: File) {
    setMusicError(null);
    setMusicUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/music-tracks/upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível enviar o arquivo.");
      const track = data as MusicTrackRecord;
      setMusicTracks((prev) => [...prev, track]);
      setForm((f) => ({ ...f, backgroundMusicIds: [...f.backgroundMusicIds, track.id] }));
    } catch (err) {
      setMusicError(err instanceof Error ? err.message : "Não foi possível enviar o arquivo.");
    } finally {
      setMusicUploading(false);
    }
  }

  async function playVoicePreview(voiceName: string) {
    previewAudioRef.current?.pause();
    setPreviewLoadingVoice(voiceName);
    try {
      const voice = SERIES_VOICES.find((v) => v.name === voiceName);
      const localPreview = voice && "previewSrc" in voice ? voice.previewSrc : undefined;

      if (localPreview) {
        // Prévia gravada (asset estático), sem chamada de TTS — caso do
        // "Heitor", que ainda não tem voice_id real pra gerar áudio.
        const audio = new Audio(localPreview);
        previewAudioRef.current = audio;
        await audio.play();
        return;
      }

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
      case "musica":
        return true;
      case "visual":
        return form.visualStyle.trim().length > 0;
      case "legenda":
        return true;
      case "detalhes":
        return (
          form.title.trim().length > 0 &&
          form.duration.trim().length > 0 &&
          form.tomDeVoz.trim().length > 0 &&
          form.voice !== "Heitor"
        );
      default:
        return true;
    }
  })();

  function goBack() {
    const prev = STEP_ORDER[stepIndex - 1];
    if (!prev) return;
    setStep(prev);
    if (prev === "musica" && musicTracks.length === 0) void loadMusicTracks();
  }

  async function goNext() {
    if (step !== "detalhes") {
      const next = STEP_ORDER[stepIndex + 1];
      if (!next) return;
      setStep(next);
      if (next === "musica" && musicTracks.length === 0) void loadMusicTracks();
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
          {step === "musica" && (
            <span className="rounded-full border border-white/[0.08] px-3 py-1 text-[12px] font-medium text-white/35">
              Opcional
            </span>
          )}
        </div>
        <p className="mt-3 text-[15px] text-zinc-400">
          {step === "nicho" && "Selecione um preset ou descreva seu próprio nicho"}
          {step === "idioma" && "Escolha o idioma e a voz que vão narrar seus vídeos"}
          {step === "musica" && "Escolha quantas quiser — uma delas é sorteada para cada vídeo"}
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

        {step === "musica" && (
          <div>
            <div className="flex gap-6 border-b border-white/[0.08]">
              <button
                type="button"
                onClick={() => setMusicTab("prontas")}
                className={`-mb-px border-b-2 pb-3 text-[14px] font-medium transition-colors ${
                  musicTab === "prontas"
                    ? "border-white/92 text-white/92"
                    : "border-transparent text-white/35 hover:text-white/55"
                }`}
              >
                Músicas prontas
              </button>
              <button
                type="button"
                onClick={() => setMusicTab("personalizada")}
                className={`-mb-px border-b-2 pb-3 text-[14px] font-medium transition-colors ${
                  musicTab === "personalizada"
                    ? "border-white/92 text-white/92"
                    : "border-transparent text-white/35 hover:text-white/55"
                }`}
              >
                Personalizada
              </button>
            </div>

            {musicTab === "prontas" ? (
              <div className="mt-6 flex flex-col gap-3">
                {musicLoading && <p className="text-[14px] text-white/55">Carregando músicas…</p>}
                {!musicLoading && musicTracks.filter((t) => t.isBuiltin).length === 0 && (
                  <p className="text-[14px] text-white/55">
                    Nenhuma música pronta disponível ainda. Você pode enviar a sua na aba
                    &ldquo;Personalizada&rdquo;.
                  </p>
                )}
                {musicTracks
                  .filter((t) => t.isBuiltin)
                  .map((track) => (
                    <MusicTrackRow
                      key={track.id}
                      track={track}
                      isSelected={form.backgroundMusicIds.includes(track.id)}
                      onToggle={() => toggleMusicTrack(track.id)}
                      onPlay={() => playMusicPreview(track.url)}
                    />
                  ))}
              </div>
            ) : (
              <div className="mt-6">
                <p className="text-[14px] font-medium text-white/92">Enviar arquivos de áudio</p>
                <p className="mt-1 text-[13px] text-white/35">
                  Suas músicas tocam no lugar da biblioteca. Se enviar várias, uma toca por vídeo.
                </p>
                <label className="mt-2 flex cursor-pointer flex-col items-center gap-2 rounded-[20px] border border-dashed border-white/[0.14] px-6 py-10 text-center transition-colors hover:border-white/35">
                  <input
                    type="file"
                    accept="audio/mpeg,audio/wav,audio/wave,audio/x-wav"
                    className="hidden"
                    disabled={musicUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleMusicUpload(file);
                      e.target.value = "";
                    }}
                  />
                  {musicUploading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-white/55" />
                  ) : (
                    <UploadCloud className="h-5 w-5 text-white/55" />
                  )}
                  <span className="text-[14px] text-white/92">
                    Clique para enviar ou arraste os arquivos
                  </span>
                  <span className="text-[13px] text-white/35">MP3, WAV até 10MB</span>
                </label>

                {musicError && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-red-400">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {musicError}
                  </div>
                )}

                {musicTracks.filter((t) => !t.isBuiltin).length > 0 && (
                  <div className="mt-4 flex flex-col gap-3">
                    {musicTracks
                      .filter((t) => !t.isBuiltin)
                      .map((track) => (
                        <MusicTrackRow
                          key={track.id}
                          track={track}
                          isSelected={form.backgroundMusicIds.includes(track.id)}
                          onToggle={() => toggleMusicTrack(track.id)}
                          onPlay={() => playMusicPreview(track.url)}
                        />
                      ))}
                  </div>
                )}
              </div>
            )}
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
              <p className="text-[14px] font-medium text-white">Tom de voz do conteúdo</p>
              <div className="mt-2 grid grid-cols-2 gap-3">
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
            </div>

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

            {form.voice === "Heitor" && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-2.5 text-xs font-medium text-amber-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                A voz &ldquo;Heitor&rdquo; ainda não tem geração de áudio real disponível — volte à
                Etapa 2 e escolha outra voz para criar a série.
              </div>
            )}

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
          {step === "detalhes"
            ? "Criar série"
            : step === "musica" && form.backgroundMusicIds.length === 0
              ? "Pular"
              : "Continuar"}
        </button>
      </div>
    </div>
  );
}

function MusicTrackRow({
  track,
  isSelected,
  onToggle,
  onPlay,
}: {
  track: MusicTrackRecord;
  isSelected: boolean;
  onToggle: () => void;
  onPlay: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onToggle}
        className={`flex flex-1 items-center gap-4 rounded-[20px] border px-5 py-3.5 text-left transition-colors ${
          isSelected
            ? "border-[#4C3BFF]/60 bg-[#141416] shadow-[0_0_0_1px_rgba(76,59,255,0.35)]"
            : "border-white/[0.08] bg-[#141416] hover:border-white/20"
        }`}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#1c1c1f] text-white/35">
          <Music className="h-4 w-4" />
        </span>
        <span>
          <span className="block text-[15px] font-semibold text-white/92">{track.title}</span>
          {track.description && (
            <span className="block text-[13px] text-white/55">{track.description}</span>
          )}
        </span>
      </button>
      <button
        type="button"
        aria-label={`Ouvir prévia de ${track.title}`}
        onClick={onPlay}
        className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] text-white/55 transition-colors hover:border-white/[0.14] hover:text-white/92"
      >
        <Play className="h-4 w-4" />
      </button>
    </div>
  );
}
