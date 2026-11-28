"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  TrendingUp,
  Loader2,
  AlertTriangle,
  Play,
  ArrowLeft,
  Music,
  UploadCloud,
  Info,
  CheckCircle2,
  CalendarClock,
  Hand,
} from "lucide-react";
import { styleOptions } from "../styleOptions";
import RealisticNotice from "../realistic/RealisticNotice";
import RealisticNoCreditsNotice, { REALISTIC_NO_CREDITS_TEXT } from "../realistic/RealisticNoCreditsNotice";
import { VISUAL_STYLES } from "../visualStyles";
import type { MusicTrackRecord } from "../musicMapping";
import { useDashboard } from "../DashboardContext";
import { LockedFeatureCard } from "../RealisticOnlyLock";
import StoryTextBox from "../script/StoryTextBox";
import { checkScriptWords, countWords } from "@/lib/script/limits";
import { suggestTone } from "./tone";
import { parseGenerationError } from "@/lib/billing/dailyLimit";
import { planAllowsLongVideos } from "@/lib/video/durations";
import { REALISTIC_STYLES } from "@/lib/realistic/constants";
import {
  LONG_SERIES_DURATION,
  NORMAL_SERIES_DURATIONS,
  SERIES_VOICES,
  SERIES_CAPTION_STYLES,
  IDIOMA_OPTIONS,
} from "./seriesOptions";

type StepKey = "nicho" | "idioma" | "musica" | "visual" | "legenda" | "detalhes" | "historia" | "agenda";

const STEP_ORDER: StepKey[] = ["nicho", "idioma", "musica", "visual", "legenda", "detalhes", "historia", "agenda"];

const STEP_TITLES: Record<StepKey, string> = {
  nicho: "Sobre o que é a sua série?",
  idioma: "Idioma e voz",
  musica: "Música de fundo",
  visual: "Como as imagens vão parecer?",
  legenda: "Como será a legenda?",
  detalhes: "Nome, duração e jeito de contar",
  historia: "História do primeiro vídeo",
  agenda: "Quando criar os vídeos?",
};

// "Sua série vai criar o primeiro vídeo amanhã às 09:00": dia e hora em horário de Brasília.
function describeFirstRun(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const when = new Date(new Date(iso).getTime() - 3 * 3600_000);
  const today = new Date(Date.now() - 3 * 3600_000);
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const tomorrow = new Date(today.getTime() + 24 * 3600_000);
  const hhmm = when.toISOString().slice(11, 16);
  if (dayKey(when) === dayKey(today)) return `hoje às ${hhmm}`;
  if (dayKey(when) === dayKey(tomorrow)) return `amanhã às ${hhmm}`;
  const [, m, d] = dayKey(when).split("-");
  return `no dia ${d}/${m} às ${hhmm}`;
}

// Prévia animada da Etapa 5 (Estilo de legenda): no AutoShortz os 4 cards de
// estilo (exceto "Sem legenda") mostram a mesma frase revelada palavra por
// palavra, sincronizada entre os cards — confirmado ao vivo observando o
// texto mudar de "VOCÊ" para "SABIA" e "DISSO?" nessa ordem, formando "VOCÊ
// SABIA DISSO?". Não consegui cronometrar o intervalo exato em milissegundos
// pela ferramenta de automação (a aba fica em segundo plano — o Chrome
// limita/pausa timers de abas não visíveis, `document.visibilityState`
// ficou "hidden" o tempo todo), então o intervalo abaixo é uma estimativa
// deliberada a ajustar depois olhando os dois lado a lado ao vivo.
const CAPTION_PREVIEW_WORDS = ["VOCÊ", "SABIA", "DISSO?"];
const CAPTION_PREVIEW_INTERVAL_MS = 700;

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
  // Série de Vídeo Realista ✨: cada episódio gasta 1 crédito realista.
  realistic: boolean;
  // "auto" = cria vídeos sozinha; "manual" = só quando o cliente pedir (a série é criada "pausada").
  modo: "auto" | "manual";
};

const EMPTY_FORM: FormState = {
  title: "",
  nicho: "",
  tomDeVoz: styleOptions[0]?.title ?? "Storytelling",
  idioma: "pt",
  visualStyle: "",
  voice: "",
  duration: "30s",
  captionsEnabled: true,
  // "" = nenhuma opção escolhida ainda (nem os 4 estilos, nem "Sem
  // legenda") — igual ao AutoShortz, que não vem com nada pré-selecionado
  // nesta etapa. Vira um nome real ou null assim que o usuário clica.
  captionStyle: "",
  backgroundMusicIds: [],
  frequenciaDias: 1,
  horario: "09:00",
  realistic: false,
  // Padrão: só quando o cliente pedir. A série só gera sozinha se ele escolher o automático.
  modo: "manual",
};

export default function SeriesWizard() {
  const router = useRouter();
  const { plan, isAdmin, realisticOnly, longVideosEnabled, openPlanModal, realisticCredits, openRealisticBuy, setHelpHidden, refreshRealisticCredits } =
    useDashboard();
  // 60s nas séries normais: chave ligada + plano Pro/Ultra (admin também).
  const canUseLong = longVideosEnabled && (isAdmin || planAllowsLongVideos(plan));
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
  // Série criada: em vez de largar o cliente na lista, mostra o que vai acontecer agora.
  const [created, setCreated] = useState<null | {
    id: string;
    title: string;
    manual: boolean;
    manualFailed: boolean;
    firstRun: string | null;
    // Como foi escolhida a história do primeiro vídeo ("none" = série de Vídeo Realista, sem esse passo).
    story: "own" | "ai" | "none";
    storySaved: boolean;
  }>(null);
  // História do primeiro vídeo (escolhida DURANTE a criação) e tom de voz (o cliente já mexeu nele?).
  const [storyMode, setStoryMode] = useState<null | "own" | "ai">(null);
  const [storyText, setStoryText] = useState("");
  const [tomTouched, setTomTouched] = useState(false);
  const [captionWordIndex, setCaptionWordIndex] = useState(0);

  // Série de Vídeo Realista não usa a história escrita (ela tem o fluxo próprio): sem esse passo.
  const steps = form.realistic ? STEP_ORDER.filter((s) => s !== "historia") : STEP_ORDER;
  const stepIndex = steps.indexOf(step);

  // No passo da história o botão (?) fica escondido: ele cobriria o fim da caixa de texto no celular.
  useEffect(() => {
    setHelpHidden(step === "historia");
    return () => setHelpHidden(false);
  }, [step, setHelpHidden]);

  // Sem assinatura ativa, nem deixa começar a preencher a série — abre
  // direto o paywall (mesmo gate usado por openWizard() do vídeo avulso),
  // em vez de deixar o usuário passar pelas 6 etapas só pra travar no fim.
  // (Quem usa só o Vídeo Realista não recebe o pop-up: vê o cartão de convite abaixo.)
  useEffect(() => {
    if (!plan && !realisticOnly) openPlanModal();
  }, [plan, realisticOnly, openPlanModal]);

  useEffect(() => {
    if (step !== "legenda") return;
    const id = setInterval(() => {
      setCaptionWordIndex((i) => (i + 1) % CAPTION_PREVIEW_WORDS.length);
    }, CAPTION_PREVIEW_INTERVAL_MS);
    return () => clearInterval(id);
  }, [step]);

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
      const res = await fetch(`/api/voices/preview?voice=${encodeURIComponent(voiceName)}&lang=${form.idioma}`);
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

  // Vídeo Realista sem créditos suficientes (1 para 30s, 2 para 60s): não deixa avançar nem salvar.
  // Administradores ficam livres.
  const realisticNeeded = form.duration === "60s" ? 2 : 1;
  const lacksRealisticCredits = form.realistic && !isAdmin && realisticCredits < realisticNeeded;

  function useNormalVideo() {
    setForm((f) => (f.realistic ? { ...f, realistic: false, visualStyle: "", duration: "30s" } : f));
    setError(null);
  }

  const canContinue = !lacksRealisticCredits && (() => {
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
        return form.captionStyle !== "";
      case "detalhes":
        return (
          form.title.trim().length > 0 &&
          form.duration.trim().length > 0 &&
          form.tomDeVoz.trim().length > 0
        );
      case "historia":
        // Tem que ter escolhido; se escolheu escrever, o texto precisa ter o tamanho certo.
        return (
          storyMode === "ai" ||
          (storyMode === "own" && checkScriptWords(form.duration, countWords(storyText))?.state === "ok")
        );
      default:
        return true;
    }
  })();

  function goBack() {
    const prev = steps[stepIndex - 1];
    if (!prev) return;
    setStep(prev);
    if (prev === "musica" && musicTracks.length === 0) void loadMusicTracks();
  }

  async function goNext() {
    if (step !== "agenda") {
      const next = steps[stepIndex + 1];
      if (!next) return;
      // Ao chegar em "Nome, duração e jeito de contar": o tom já vem marcado conforme o tema (o
      // cliente muda se quiser). Antes, toda série nascia "Motivacional".
      if (next === "detalhes" && !tomTouched) update("tomDeVoz", suggestTone(form.nicho));
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
      if (!res.ok) {
        const parsed = parseGenerationError(data.error ?? "Não foi possível criar a série.");
        if (parsed.reason === "no_subscription") {
          openPlanModal();
        }
        if (String(data.error ?? "").startsWith("no_realistic_credits")) {
          // O servidor recusou por falta de créditos realistas: volta ao 1º passo, onde aparece o aviso.
          await refreshRealisticCredits();
          setStep("nicho");
          throw new Error(REALISTIC_NO_CREDITS_TEXT);
        }
        throw new Error(parsed.message);
      }
      // "Só quando eu pedir": a série nasce automática e é passada para "pausada" (o estado que já
      // existia), que para o cliente quer dizer exatamente isso.
      let manualFailed = false;
      if (form.modo === "manual") {
        try {
          const patchRes = await fetch(`/api/series/${data.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "pausada" }),
          });
          manualFailed = !patchRes.ok;
        } catch {
          manualFailed = true;
        }
      }
      // A história escrita no passo "História do primeiro vídeo" vira a história do próximo vídeo
      // da série (o mesmo lugar de "Escrever a história do próximo vídeo"). Criar a série NÃO gera
      // nenhum vídeo: isto só guarda o texto.
      const story: "own" | "ai" | "none" = form.realistic ? "none" : (storyMode ?? "ai");
      let storySaved = false;
      if (story === "own") {
        try {
          const put = await fetch(`/api/series/${data.id}/next-script`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ script: { title: form.title.trim(), source: "custom", scenes: [], text: storyText } }),
          });
          storySaved = put.ok;
        } catch {
          storySaved = false;
        }
      }
      setCreated({
        id: data.id,
        title: form.title.trim(),
        manual: form.modo === "manual" && !manualFailed,
        manualFailed,
        firstRun: describeFirstRun(data.nextGenerationAt),
        story,
        storySaved,
      });
      setSaving(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar a série.");
      setSaving(false);
    }
  }

  // Sem assinatura ativa: o paywall (aberto pelo useEffect acima) já cobre a
  // tela — não renderiza a wizard atrás dele.
  if (!plan) {
    return realisticOnly ? (
      <LockedFeatureCard
        title="Séries"
        description="Séries que criam vídeos novos para você, só quando você pedir ou todo dia. Disponível nos planos do Virazo."
      />
    ) : null;
  }

  // Série criada: diz o que vai acontecer agora e para onde ir.
  if (created) {
    return (
      <div className="mx-auto max-w-[720px] text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/15">
          <CheckCircle2 className="h-9 w-9 text-emerald-400" />
        </span>
        <h1 className="mt-5 text-[28px] font-bold leading-tight text-white">Sua série está pronta!</h1>
        <p className="mt-1 text-[16px] text-zinc-400">{created.title}</p>
        <div className="mx-auto mt-6 max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-left">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-zinc-500">O que vai acontecer agora</p>
          {created.manual ? (
            <p className="mt-2 text-[17px] leading-relaxed text-zinc-100">
              Nada será feito sozinho.{" "}
              {created.story === "own" && created.storySaved ? (
                <>O primeiro vídeo vai usar a história que você escreveu. Toque no botão abaixo quando quiser gerá-lo.</>
              ) : created.story === "ai" ? (
                <>
                  A IA vai criar a história do primeiro vídeo quando você tocar no botão abaixo — e você lê antes de
                  gerar.
                </>
              ) : (
                <>
                  Quando você quiser seu vídeo, toque no botão abaixo (ou, em <strong>Séries</strong>, em{" "}
                  <strong>“Gerar um vídeo agora”</strong>).
                </>
              )}
            </p>
          ) : (
            <p className="mt-2 text-[17px] leading-relaxed text-zinc-100">
              {created.story === "own" && created.storySaved ? (
                <>O primeiro vídeo vai usar a história que você escreveu, </>
              ) : created.story === "ai" ? (
                <>A IA vai criar a história do primeiro vídeo, </>
              ) : (
                <>O primeiro vídeo será feito </>
              )}
              {created.firstRun ? (
                <>
                  <strong>{created.firstRun}</strong> (horário de Brasília). Você não precisa fazer nada.
                </>
              ) : (
                <>no próximo horário da série. Você não precisa fazer nada.</>
              )}
            </p>
          )}
          {created.story === "own" && !created.storySaved && (
            <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-sm text-amber-200">
              Não conseguimos guardar a história que você escreveu. Em Séries, toque em “Escrever a história do próximo
              vídeo” e cole o texto de novo.
            </p>
          )}
          {created.manualFailed && (
            <p className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-sm text-amber-200">
              Não conseguimos deixar a série como “só quando eu pedir”. Em Séries, toque em “Deixar manual”.
            </p>
          )}
        </div>
        {created.manual ? (
          <>
            {/* "Só quando eu pedir": o botão grande leva direto a gerar o primeiro vídeo, com o que o
                cliente escolheu na criação (sem perguntar a história de novo). */}
            <Link
              href={`/dashboard/series?gerar=${created.id}${created.story === "own" && created.storySaved ? "&modo=own" : created.story === "ai" ? "&modo=ai" : ""}`}
              className="mx-auto mt-6 inline-flex h-14 w-full max-w-md items-center justify-center rounded-2xl bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] text-[17px] font-semibold text-white shadow-lg shadow-[#4C3BFF]/25"
            >
              Gerar meu primeiro vídeo agora
            </Link>
            <Link href="/dashboard/series" className="mt-3 inline-block text-[15px] font-medium text-zinc-400 hover:text-white">
              Gerar depois
            </Link>
          </>
        ) : (
          <>
            <Link
              href="/dashboard/series"
              className="mx-auto mt-6 inline-flex h-14 w-full max-w-md items-center justify-center rounded-2xl bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] text-[17px] font-semibold text-white shadow-lg shadow-[#4C3BFF]/25"
            >
              Ver minhas séries
            </Link>
            <Link href="/dashboard" className="mt-3 inline-block text-[15px] font-medium text-zinc-400 hover:text-white">
              Voltar ao início
            </Link>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[720px]">
      <div className="flex gap-2">
        {steps.map((s, i) => (
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
            Passo {stepIndex + 1} de {steps.length}
          </span>
          {step === "musica" && (
            <span className="rounded-full border border-white/[0.08] px-3 py-1 text-[12px] font-medium text-white/35">
              Opcional
            </span>
          )}
        </div>
        <p className="mt-3 text-[15px] text-zinc-400">
          {step === "nicho" && "Escolha um tema pronto ou escreva o seu"}
          {step === "idioma" && "Escolha o idioma e a voz que vão narrar seus vídeos"}
          {step === "musica" && "Escolha quantas quiser — uma delas é sorteada para cada vídeo"}
          {step === "visual" && "Escolha o estilo das imagens dos seus vídeos"}
          {step === "legenda" && "Escolha como as legendas aparecem nos seus vídeos"}
          {step === "detalhes" && "Dê um nome à série, escolha quanto tempo cada vídeo dura e o jeito de contar"}
          {step === "historia" && "Escolha como será a história do primeiro vídeo da série"}
          {step === "agenda" && "Escolha se a série cria vídeos sozinha ou só quando você pedir"}
        </p>
      </div>

      {form.realistic && <RealisticNotice className="mt-6" />}

      <div className="mt-8">
        {step === "nicho" && (
          <>
            {/* Tipo de vídeo da série: normal (como sempre) ou Vídeo Realista ✨. */}
            <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                {
                  realistic: false,
                  label: "Vídeo normal",
                  description: "Imagens criadas por IA, de 30 a 40 segundos. Usa o limite diário do seu plano.",
                },
                {
                  realistic: true,
                  label: "Vídeo Realista ✨",
                  description: "Cenas em movimento real, com mais qualidade. Usa créditos realistas, não o limite diário.",
                },
              ].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() =>
                    setForm((f) =>
                      f.realistic === option.realistic
                        ? f
                        : {
                            ...f,
                            realistic: option.realistic,
                            // Os estilos de um tipo não existem no outro.
                            visualStyle: "",
                            duration: "30s",
                          },
                    )
                  }
                  className={`rounded-2xl border px-4 py-3.5 text-left transition-colors ${
                    form.realistic === option.realistic
                      ? "border-[#4C3BFF]/60 bg-[#4C3BFF]/10 shadow-[0_0_0_1px_rgba(76,59,255,0.35)]"
                      : "border-white/10 bg-white/[0.02] hover:border-white/20"
                  }`}
                >
                  <span className="block text-[15px] font-semibold text-white">{option.label}</span>
                  <span className="mt-1 block text-[12.5px] leading-snug text-white/55">{option.description}</span>
                </button>
              ))}
            </div>
            {form.realistic && lacksRealisticCredits && (
              <RealisticNoCreditsNotice className="mb-6" onUseNormal={useNormalVideo} />
            )}
            {form.realistic && !lacksRealisticCredits && (
              <div className="mb-6 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-4 py-3 text-[13px] leading-relaxed text-zinc-300">
                Você tem <strong className="text-white">{realisticCredits}</strong>{" "}
                {realisticCredits === 1 ? "crédito realista" : "créditos realistas"}. Quando acabarem, a série pausa
                e avisa você.{" "}
                <button type="button" onClick={openRealisticBuy} className="font-semibold text-amber-200 underline">
                  Comprar vídeos realistas
                </button>
              </div>
            )}
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

        {step === "visual" && form.realistic && (
          <div className="flex flex-col gap-3">
            {REALISTIC_STYLES.map((s) => {
              const isSelected = form.visualStyle === s.name;
              return (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => update("visualStyle", s.name)}
                  className={`rounded-[20px] border bg-[#141416] px-5 py-4 text-left transition-colors ${
                    isSelected
                      ? "border-[#4C3BFF]/60 shadow-[0_0_0_1px_rgba(76,59,255,0.35)]"
                      : "border-white/[0.08] hover:border-white/20"
                  }`}
                >
                  <span className="block text-[15px] font-semibold text-white/92">{s.name}</span>
                  <span className="block text-[13px] text-white/55">{s.description}</span>
                </button>
              );
            })}
          </div>
        )}

        {step === "visual" && !form.realistic && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {VISUAL_STYLES.map(({ name, thumbnail }) => {
              const isSelected = form.visualStyle === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => update("visualStyle", name)}
                  className="w-full text-left"
                >
                  <div
                    className={`relative aspect-[9/16] overflow-hidden rounded-[20px] border bg-[#1c1c1f] transition-colors ${
                      isSelected
                        ? "border-[#4C3BFF]/60 shadow-[0_0_0_1px_rgba(76,59,255,0.35)]"
                        : "border-white/[0.08] hover:border-white/20"
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
                  <p className={`mt-3 text-[14px] font-medium ${isSelected ? "text-white/92" : "text-white/55"}`}>
                    {name}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {step === "legenda" && (
          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3">
            {SERIES_CAPTION_STYLES.map((c) => {
              const isSelected = form.captionStyle === c.name;
              return (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => {
                    update("captionsEnabled", true);
                    update("captionStyle", c.name);
                  }}
                  className={`rounded-[20px] border p-3 text-left transition-colors ${
                    isSelected
                      ? "border-[#4C3BFF]/60 bg-[#141416] shadow-[0_0_0_1px_rgba(76,59,255,0.35)]"
                      : "border-white/[0.08] bg-[#141416] hover:border-white/20"
                  }`}
                >
                  <div className="flex h-24 w-full items-center justify-center rounded-xl bg-gradient-to-b from-[#4a4a4f] to-[#2a2a2e]">
                    <span
                      key={captionWordIndex}
                      className="animate-caption-word-pop text-[30px] font-black"
                      style={{
                        fontFamily: '"Arial Black", "Arial Bold", Arial, sans-serif',
                        lineHeight: 1.1,
                        letterSpacing: "-0.01em",
                        color: c.color,
                        textTransform: c.textTransform,
                        // paintOrder "stroke" pinta o contorno ANTES do
                        // preenchimento — o preenchimento sólido cobre a
                        // metade interna do traço, deixando o interior da
                        // letra limpo e só a borda externa contornada
                        // (padrão inverso ao CSS default, que "come" o
                        // interior da letra com o contorno por cima).
                        paintOrder: "stroke",
                        WebkitTextStroke:
                          c.strokeColor && c.strokeWidth !== "0px"
                            ? `${c.strokeWidth} ${c.strokeColor}`
                            : undefined,
                        textShadow: "rgba(0, 0, 0, 0.55) 0px 1.88px 0px",
                      }}
                    >
                      {CAPTION_PREVIEW_WORDS[captionWordIndex]}
                    </span>
                  </div>
                  <p className="mt-3 text-[14px] font-medium text-white/92">{c.name}</p>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => {
                update("captionsEnabled", false);
                update("captionStyle", null);
              }}
              className={`rounded-[20px] border p-3 text-left transition-colors ${
                form.captionStyle === null
                  ? "border-[#4C3BFF]/60 bg-[#141416] shadow-[0_0_0_1px_rgba(76,59,255,0.35)]"
                  : "border-white/[0.08] bg-[#141416] hover:border-white/20"
              }`}
            >
              <div className="flex h-24 w-full items-center justify-center rounded-xl bg-gradient-to-b from-[#4a4a4f] to-[#2a2a2e]">
                <span className="text-[13px] font-medium text-white/40">vídeo limpo</span>
              </div>
              <p className="mt-3 text-[14px] font-medium text-white/92">Sem legenda</p>
            </button>
          </div>
        )}

        {step === "detalhes" && (
          <div className="flex flex-col gap-8">
            <label className="block">
              <span className="mb-2 block text-[14px] font-medium text-white/92">Nome da série</span>
              <input
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder="Dê um nome para a sua série"
                className="h-12 w-full rounded-xl border border-white/[0.08] bg-[#0a0a0b] px-3.5 text-[15px] text-white/92 placeholder:text-zinc-600 focus:border-[#4C3BFF]/50 focus:outline-none"
              />
            </label>

            {form.realistic && (
              <div>
                <span className="mb-2 block text-[14px] font-medium text-white/92">Duração dos vídeos</span>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: "30s", title: "30 segundos", credits: "1 crédito por episódio" },
                    { value: "60s", title: "60 segundos", credits: "2 créditos por episódio" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      disabled={!isAdmin && option.value === "60s" && realisticCredits < 2}
                      onClick={() => update("duration", option.value)}
                      className={`rounded-[20px] border bg-[#141416] px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        form.duration === option.value
                          ? "border-[#4C3BFF]/60 shadow-[0_0_0_1px_rgba(76,59,255,0.35)]"
                          : "border-white/[0.08] hover:border-white/20"
                      }`}
                    >
                      <span className="block text-[15px] font-semibold text-white/92">{option.title}</span>
                      <span className="block text-[13px] text-white/55">{option.credits}</span>
                    </button>
                  ))}
                </div>
                {!isAdmin && realisticCredits < 2 && (
                  <p className="mt-2 text-[13px] text-amber-200">
                    Para 60 segundos você precisa de 2 créditos.{" "}
                    <button type="button" onClick={openRealisticBuy} className="font-semibold underline">
                      Ver pacotes
                    </button>
                  </p>
                )}
              </div>
            )}

            {!form.realistic && (
            <label className="block">
              <span className="mb-2 flex items-center gap-1.5 text-[14px] font-medium text-white/92">
                Duração dos vídeos
                <Info className="h-4 w-4 text-white/35" strokeWidth={1.7} />
              </span>
              <select
                value={form.duration}
                onChange={(e) => update("duration", e.target.value)}
                className="h-12 w-full rounded-xl border border-white/[0.08] bg-[#0a0a0b] px-3.5 text-[15px] text-white/92 focus:border-[#4C3BFF]/50 focus:outline-none"
              >
                {NORMAL_SERIES_DURATIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
                {canUseLong && <option value={LONG_SERIES_DURATION.value}>{LONG_SERIES_DURATION.label}</option>}
              </select>
              {longVideosEnabled && !canUseLong && (
                <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2">
                  <p className="text-xs text-amber-200">Vídeos de 60s disponíveis nos planos Pro e Ultra</p>
                  <button
                    type="button"
                    onClick={() => openPlanModal()}
                    className="shrink-0 rounded-lg bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Fazer upgrade
                  </button>
                </div>
              )}
            </label>
            )}

            <div>
              <span className="mb-1 block text-[14px] font-medium text-white/92">Jeito de contar</span>
              <p className="mb-3 text-[13px] leading-snug text-white/50">
                É o tom das histórias. Já deixamos marcado o que combina com o seu tema — você pode mudar.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {styleOptions.map((s) => {
                  const Icon = s.icon;
                  const selected = form.tomDeVoz === s.title;
                  const suggested = suggestTone(form.nicho) === s.title;
                  return (
                    <button
                      key={s.title}
                      type="button"
                      onClick={() => {
                        setTomTouched(true);
                        update("tomDeVoz", s.title);
                      }}
                      className={`relative flex min-h-[64px] items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors ${
                        selected
                          ? "border-[#4C3BFF]/60 bg-white/[0.07] shadow-[0_0_0_1px_rgba(76,59,255,0.35)]"
                          : "border-white/[0.08] bg-[#141416] hover:border-white/20"
                      }`}
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${s.gradient}`}>
                        <Icon className="h-4.5 w-4.5 text-white" strokeWidth={2} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[15px] font-semibold leading-tight text-white/92">{s.title}</span>
                        {suggested && (
                          <span className="mt-0.5 block text-[11px] font-medium leading-tight text-emerald-400">
                            Sugerido para este tema
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {step === "historia" && (
          <div className="flex flex-col gap-4">
            {[
              {
                value: "own" as const,
                emoji: "✍️",
                title: "Quero escrever minha história",
                description: "Você escreve ou cola o texto do primeiro vídeo.",
              },
              {
                value: "ai" as const,
                emoji: "✨",
                title: "A IA cria a história para mim",
                description: "A IA escreve a história do primeiro vídeo. Você lê antes de gerar.",
              },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setStoryMode(option.value)}
                className={`flex items-center gap-4 rounded-[20px] border bg-[#141416] p-4 text-left transition-colors ${
                  storyMode === option.value
                    ? "border-[#4C3BFF]/60 shadow-[0_0_0_1px_rgba(76,59,255,0.35)]"
                    : "border-white/[0.08] hover:border-white/20"
                }`}
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-2xl" aria-hidden="true">
                  {option.emoji}
                </span>
                <span className="min-w-0">
                  <span className="block text-[17px] font-semibold leading-snug text-white/92">{option.title}</span>
                  <span className="mt-0.5 block text-[14px] leading-snug text-white/55">{option.description}</span>
                </span>
              </button>
            ))}
            {storyMode === "own" && <StoryTextBox duration={form.duration} value={storyText} onChange={setStoryText} />}
            {storyMode === "ai" && (
              <p className="rounded-xl bg-white/[0.04] px-4 py-3 text-[14px] leading-relaxed text-white/60">
                Tudo certo: a IA cria a história. Quando for gerar o primeiro vídeo, você lê a história antes.
              </p>
            )}
          </div>
        )}

        {step === "agenda" && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              {[
                {
                  value: "manual" as const,
                  icon: Hand,
                  title: "Gerar só quando eu pedir",
                  description: "Nada é feito sozinho. Quando quiser um vídeo, você toca em “Gerar um vídeo agora” e escolhe a história.",
                },
                {
                  value: "auto" as const,
                  icon: CalendarClock,
                  title: "Gerar um vídeo novo todo dia automático",
                  description: "A IA escreve a história e faz um vídeo novo todo dia no horário que você escolher, sem você precisar fazer nada.",
                },
              ].map((option) => {
                const Icon = option.icon;
                const selected = form.modo === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => update("modo", option.value)}
                    className={`flex items-center gap-4 rounded-[20px] border bg-[#141416] p-4 text-left transition-colors ${
                      selected
                        ? "border-[#4C3BFF]/60 shadow-[0_0_0_1px_rgba(76,59,255,0.35)]"
                        : "border-white/[0.08] hover:border-white/20"
                    }`}
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
                      <Icon className="h-6 w-6 text-white/80" strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[17px] font-semibold leading-snug text-white/92">{option.title}</span>
                      <span className="mt-0.5 block text-[14px] leading-snug text-white/55">{option.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {form.modo === "auto" && (
              <div className="flex flex-col gap-5 rounded-2xl border border-white/[0.08] bg-[#0a0a0b] p-4">
                <label className="block">
                  <span className="mb-2 block text-[14px] font-medium text-white/92">Que horas? (horário de Brasília)</span>
                  <select
                    value={form.horario}
                    onChange={(e) => update("horario", e.target.value)}
                    className="h-12 w-full rounded-xl border border-white/[0.08] bg-[#141416] px-3.5 text-[15px] text-white/92 focus:border-[#4C3BFF]/50 focus:outline-none"
                  >
                    {Array.from({ length: 19 }, (_, i) => `${String(i + 5).padStart(2, "0")}:00`).map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-[13px] leading-relaxed text-white/50">
                  Você pode escolher a história de um vídeo antes dele ser feito, em “Séries”, tocando em “Escrever a
                  história do próximo vídeo”. Se não escolher, a IA cria.
                </p>
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
          {step === "agenda"
            ? "Criar a série"
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
