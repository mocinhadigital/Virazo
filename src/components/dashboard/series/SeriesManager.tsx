"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  X,
  Plus,
  Loader2,
  Play,
  Pause,
  Trash2,
  Pencil,
  Wand2,
  AlertTriangle,
  CheckCircle2,
  FileText,
} from "lucide-react";
import type { SeriesRecord, SeriesStatus } from "../types";
import { styleOptions } from "../styleOptions";
import { VISUAL_STYLES } from "../visualStyles";
import { useDashboard } from "../DashboardContext";
import { countVideosUsedToday, parseGenerationError, startOfDayInBrasilia } from "@/lib/billing/dailyLimit";
import RealisticNotice from "../realistic/RealisticNotice";
import { RealisticNoCreditsModal } from "../realistic/RealisticNoCreditsNotice";
import NextScriptModal from "../script/NextScriptModal";
import { effectiveDuration, isLongDuration, planAllowsLongVideos, videoSlotCost } from "@/lib/video/durations";
import { REALISTIC_STYLES } from "@/lib/realistic/constants";
import Select from "@/components/ui/Select";
import Combobox from "@/components/ui/Combobox";
import {
  LONG_SERIES_DURATION,
  NORMAL_SERIES_DURATIONS,
  SERIES_DURATIONS,
  SERIES_VOICES,
  SERIES_CAPTION_STYLES,
  NICHO_SUGESTOES,
  FREQUENCIA_OPTIONS,
  IDIOMA_OPTIONS,
} from "./seriesOptions";

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
  voice: SERIES_VOICES[0]?.name ?? "Ana",
  duration: "30s",
  captionsEnabled: true,
  captionStyle: SERIES_CAPTION_STYLES[0]?.name ?? "Traço forte",
  frequenciaDias: 1,
  horario: "09:00",
};

// Se a série já tem um valor que não está mais na lista (ex.: um tom ou estilo antigo), a lista
// ganha esse valor: o campo mostra o que a série tem em vez de "Selecione", e salvar não o perde.
function withCurrent(options: { value: string; label: string }[], current: string) {
  return current && !options.some((o) => o.value === current) ? [{ value: current, label: current }, ...options] : options;
}

function formStateFromSeries(series: SeriesRecord, keepLong = false): FormState {
  return {
    title: series.title,
    nicho: series.nicho,
    tomDeVoz: series.tomDeVoz,
    idioma: series.idioma,
    visualStyle: series.visualStyle,
    voice: series.voice ?? SERIES_VOICES[0]?.name ?? "Ana",
    // Série normal em 60s: mantém 60s só se a chave está ligada e o plano permite
    // (Pro/Ultra); senão exibe (e gera) em 30s. O antigo 90s vira 60s ou 30s.
    duration:
      !series.realistic && isLongDuration(series.duration)
        ? keepLong
          ? "60s"
          : "30s"
        : series.duration,
    captionsEnabled: series.captionsEnabled,
    captionStyle: series.captionStyle,
    frequenciaDias: series.frequenciaDias,
    horario: series.horario.slice(0, 5),
  };
}

// "Todo dia 09:00" / "a cada 2 dias 09:00" / "toda semana 09:00" (séries antigas podem ter outro ritmo).
function automaticLabel(frequenciaDias: number): string {
  if (frequenciaDias === 1) return "todo dia";
  if (frequenciaDias === 7) return "toda semana";
  return `a cada ${frequenciaDias} dias`;
}

// "Pausada" é o estado que já existia; para o cliente ele quer dizer "só quando eu pedir": a série
// não gera vídeos sozinha, só quando ele toca em "Gerar um vídeo agora".
const STATUS_LABEL: Record<SeriesStatus, string> = {
  ativa: "Automática",
  pausada: "Só quando eu pedir",
  arquivada: "Arquivada",
};

const STATUS_BADGE: Record<SeriesStatus, string> = {
  ativa: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  pausada: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  arquivada: "border-white/10 bg-white/[0.04] text-zinc-500",
};

const NETWORK_ERROR_MESSAGE = "Não foi possível carregar os dados. Verifique sua conexão e tente novamente.";

// fetch() só rejeita (lança) quando a rede falha antes de qualquer resposta
// chegar — nesse caso o erro é sempre um TypeError, e a mensagem crua do
// navegador ("Load failed" no Safari, "Failed to fetch" no Chrome) não diz
// nada útil pro usuário. Quando o servidor responde (mesmo com 4xx/5xx),
// isso já vira uma resposta normal e cai no `throw new Error(data.error)`
// de cada handler — nunca passa por aqui.
function describeError(err: unknown): string {
  if (err instanceof TypeError) return NETWORK_ERROR_MESSAGE;
  return err instanceof Error ? err.message : NETWORK_ERROR_MESSAGE;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry só pra GET idempotente (recarregar a lista) e só quando a falha é de
// rede (fetch() lançou) — nunca quando o servidor já respondeu. POST/PATCH/
// DELETE/gerar nunca passam por aqui: reenviar um desses arriscaria duplicar
// criação, geração ou crédito.
async function fetchWithNetworkRetry(url: string, retries = 2): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url);
    } catch (err) {
      if (attempt >= retries || !(err instanceof TypeError)) throw err;
      await sleep(400 * (attempt + 1));
    }
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SeriesManager({ initialSeries }: { initialSeries: SeriesRecord[] }) {
  const {
    plan,
    isAdmin,
    longVideosEnabled,
    videos,
    dailyVideoLimit,
    bonusVideos,
    openPlanModal,
    realisticCredits,
    openRealisticBuy,
    refreshRealisticCredits,
  } = useDashboard();
  // 60s nas séries normais: chave ligada + plano Pro/Ultra (admin também).
  const canUseLong = longVideosEnabled && (isAdmin || planAllowsLongVideos(plan));
  const router = useRouter();
  // Aviso amigável de "sem créditos realistas" (no lugar do erro técnico).
  const [noCreditsOpen, setNoCreditsOpen] = useState(false);
  const lacksRealisticCredits = (s: SeriesRecord) =>
    s.realistic && !isAdmin && realisticCredits < (s.duration === "60s" ? 2 : 1);
  const [series, setSeries] = useState<SeriesRecord[]>(initialSeries);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Dia (Brasília) em que o servidor já recusou por limite do dia: o "Gerar agora" fica
  // desabilitado até virar o dia, para o cliente não ficar clicando em vão.
  const [blockedDay, setBlockedDay] = useState<string | null>(null);
  // Reavalia o limite a cada minuto (o dia pode virar com a página aberta).
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  // Série cuja história do próximo vídeo está aberta (e para quê: gerar agora ou só guardar).
  const [scriptModal, setScriptModal] = useState<{
    id: string;
    intent: "generate" | "prepare";
    first?: "saved" | "ai";
  } | null>(null);

  // Veio da tela "Sua série está pronta!" (botão "Gerar meu primeiro vídeo agora"): abre direto o
  // primeiro vídeo com o que o cliente escolheu na criação, sem perguntar a história de novo.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("gerar");
    if (!id) return;
    const modo = params.get("modo");
    window.history.replaceState(null, "", "/dashboard/series");
    const target = series.find((x) => x.id === id);
    if (target && !target.realistic) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setScriptModal({ id, intent: "generate", first: modo === "own" ? "saved" : modo === "ai" ? "ai" : undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const editingRealistic = editingId ? series.find((s) => s.id === editingId)?.realistic === true : false;

  // O "Gerar agora" desta série vai ser recusado pelo limite do dia? (O servidor continua
  // sendo quem decide: isto só evita o clique em vão e mostra o motivo.) Série realista usa
  // créditos realistas, não o limite do dia; admin não tem limite.
  const todayKey = startOfDayInBrasilia(new Date()).toISOString();
  const usedToday = countVideosUsedToday(videos);
  const remainingToday = Math.max(0, dailyVideoLimit - usedToday);
  function limitMessage(s: SeriesRecord): string | null {
    if (isAdmin || s.realistic || !plan) return null;
    if (blockedDay === todayKey) return "Você já usou os vídeos de hoje. O botão “Gerar um vídeo agora” volta amanhã.";
    const duration = effectiveDuration(s.duration, longVideosEnabled, planAllowsLongVideos(plan));
    const cost = videoSlotCost(duration);
    const enough = remainingToday >= cost || (remainingToday === 0 && bonusVideos >= cost);
    if (enough) return null;
    return cost > 1 && remainingToday > 0
      ? "Precisa de 2 vídeos disponíveis para gerar um de 60s."
      : "Você já usou os vídeos de hoje. O botão “Gerar um vídeo agora” volta amanhã.";
  }

  function openEditModal(target: SeriesRecord) {
    setEditingId(target.id);
    setForm(formStateFromSeries(target, canUseLong));
    setFormError(null);
    setModalOpen(true);
  }

  async function handleSubmit() {
    // Este formulário agora só EDITA (criar é o passo a passo em /dashboard/series/nova).
    if (!editingId) return;
    if (!form.title.trim() || !form.nicho.trim()) {
      setFormError("Preencha pelo menos o nome da série e o nicho.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/series/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        const parsed = parseGenerationError(data.error ?? "Não foi possível salvar a série.");
        if (parsed.reason === "no_subscription") {
          setModalOpen(false);
          openPlanModal();
        }
        throw new Error(parsed.message);
      }

      setSeries((prev) => prev.map((s) => (s.id === editingId ? data : s)));
      setModalOpen(false);
    } catch (err) {
      setFormError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  async function patchSeries(id: string, patch: Partial<FormState & { status: SeriesStatus }>) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/series/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        if (String(data.error ?? "").startsWith("no_realistic_credits")) {
          void refreshRealisticCredits();
          setNoCreditsOpen(true);
          return;
        }
        throw new Error(data.error ?? "Não foi possível atualizar a série.");
      }
      setSeries((prev) => prev.map((s) => (s.id === id ? data : s)));
    } catch (err) {
      setNotice(describeError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta série? Os vídeos já gerados por ela continuam no seu painel.")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/series/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Não foi possível excluir a série.");
      }
      setSeries((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setNotice(describeError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleGenerateNow(id: string) {
    const target = series.find((x) => x.id === id);
    if (target && lacksRealisticCredits(target)) {
      setNoCreditsOpen(true);
      return;
    }
    setBusyId(id);
    setNotice(null);
    try {
      const res = await fetch(`/api/series/${id}/generate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        const parsed = parseGenerationError(data.error ?? "Não foi possível gerar o vídeo.");
        if (parsed.reason === "no_subscription") {
          openPlanModal();
        }
        if (parsed.reason === "daily_limit_reached" || parsed.reason === "not_enough_slots") {
          setBlockedDay(startOfDayInBrasilia(new Date()).toISOString());
        }
        if (parsed.message.startsWith("no_realistic_credits:")) {
          void refreshRealisticCredits();
          setNoCreditsOpen(true);
          // Se o servidor pausou a série por falta de créditos, reflete na lista.
          setSeries((prev) => prev.map((x) => (x.id === id && x.status === "ativa" ? { ...x, status: "pausada" } : x)));
          return;
        }
        throw new Error(parsed.message);
      }
      void refreshRealisticCredits();
      setNotice(
        data?.status === "Processando"
          ? 'Seu vídeo realista começou a ser feito — leva alguns minutos e aparece em "Vídeos" quando ficar pronto.'
          : `Seu vídeo ficou pronto — confira em “Vídeos”.`,
      );
      // Reflete o novo total/agendamento sem precisar recarregar a página.
      // GET idempotente — pode tentar de novo em falha de rede sem risco.
      try {
        const refreshed = await fetchWithNetworkRetry("/api/series").then((r) => r.json());
        if (Array.isArray(refreshed)) setSeries(refreshed);
      } catch {
        // A geração já teve sucesso (mensagem acima já foi mostrada); só a
        // atualização da lista falhou — não sobrescreve o aviso de sucesso.
      }
    } catch (err) {
      setNotice(describeError(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          {series.length === 0
            ? "Você ainda não criou nenhuma série. Toque em “Nova série” para começar."
            : `${series.length} ${series.length === 1 ? "série" : "séries"}`}
          {!isAdmin && plan && (
            <span className="ml-2 text-zinc-600">
              · Vídeos de hoje: {Math.min(usedToday, dailyVideoLimit)} de {dailyVideoLimit}
              {bonusVideos > 0 ? ` (+${bonusVideos} de bônus)` : ""}
            </span>
          )}
        </p>
        {/* Criar série é sempre o passo a passo novo (o mesmo da tela inicial). Quem não tem plano
            vê o aviso de planos dentro dele. */}
        <Link
          href="/dashboard/series/nova"
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#4C3BFF]/20"
        >
          <Plus className="h-4 w-4" />
          Nova série
        </Link>
      </div>

      {notice && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-zinc-200">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-zinc-500 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {series.length === 0 ? (
        <div className="card-glass flex flex-col items-center gap-3 rounded-2xl p-10 text-center">
          <Wand2 className="h-8 w-8 text-[#4C3BFF]" strokeWidth={1.5} />
          <p className="text-sm text-zinc-400">
            Crie sua primeira série para gerar vídeos novos quando você pedir, ou todo dia no automático.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {series.map((s) => (
            <div key={s.id} className="card-glass flex flex-col gap-3 rounded-2xl p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{s.title}</p>
                  <p className="truncate text-xs text-zinc-500">{s.nicho}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${STATUS_BADGE[s.status]}`}
                >
                  {STATUS_LABEL[s.status]}
                </span>
              </div>

              {s.status !== "arquivada" && (
                <div
                  className={`rounded-xl border px-3 py-2 text-[13px] font-semibold ${
                    s.status === "ativa"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                  }`}
                >
                  {s.status === "ativa"
                    ? `Automático · ${automaticLabel(s.frequenciaDias)} ${s.horario.slice(0, 5)}`
                    : "Manual · só quando eu pedir"}
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 text-[11px] text-zinc-400">
                {s.realistic && (
                  <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-amber-200">
                    Realista ✨
                  </span>
                )}
                <span className="rounded-full border border-white/10 px-2 py-0.5">{s.visualStyle}</span>
                <span className="rounded-full border border-white/10 px-2 py-0.5">{s.tomDeVoz}</span>
                <span className="rounded-full border border-white/10 px-2 py-0.5">
                  {IDIOMA_OPTIONS.find((o) => o.value === s.idioma)?.label ?? s.idioma}
                </span>
                {s.status === "ativa" && (
                  <span className="rounded-full border border-white/10 px-2 py-0.5">
                    {FREQUENCIA_OPTIONS.find((f) => f.value === s.frequenciaDias)?.label ??
                      `A cada ${s.frequenciaDias}d`}{" "}
                    · {s.horario.slice(0, 5)}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>
                  {s.totalVideosGerados === 0
                    ? "Nenhum vídeo feito ainda"
                    : `${s.totalVideosGerados} ${s.totalVideosGerados === 1 ? "vídeo feito" : "vídeos feitos"}`}
                </span>
                <span>
                  {s.status === "ativa"
                    ? `Próximo vídeo: ${formatDateTime(s.nextGenerationAt)}`
                    : s.status === "pausada"
                      ? "Gera só quando você pedir"
                      : "—"}
                </span>
              </div>

              {s.realistic && s.status === "pausada" && realisticCredits < 1 && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200">
                  Série parada: seus créditos de Vídeo Realista acabaram.{" "}
                  <button type="button" onClick={openRealisticBuy} className="font-semibold underline">
                    Comprar mais
                  </button>{" "}
                  e depois toque em “Ligar automático”.
                </div>
              )}

              {s.status !== "arquivada" && limitMessage(s) && (
                <p className="rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-[11px] text-amber-200">
                  {limitMessage(s)}
                </p>
              )}

              <div className="mt-1 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busyId === s.id || s.status === "arquivada" || !!limitMessage(s)}
                  title={limitMessage(s) ?? undefined}
                  onClick={() => (s.realistic ? handleGenerateNow(s.id) : setScriptModal({ id: s.id, intent: "generate" }))}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busyId === s.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="h-3.5 w-3.5" />
                  )}
                  Gerar um vídeo agora
                </button>

                {s.status !== "arquivada" && (
                  <button
                    type="button"
                    disabled={busyId === s.id}
                    onClick={() => {
                      if (s.status !== "ativa" && lacksRealisticCredits(s)) {
                        setNoCreditsOpen(true);
                        return;
                      }
                      void patchSeries(s.id, { status: s.status === "ativa" ? "pausada" : "ativa" });
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/5 disabled:opacity-40"
                  >
                    {s.status === "ativa" ? (
                      <Pause className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    {s.status === "ativa" ? "Desligar automático" : "Ligar automático"}
                  </button>
                )}

                {!s.realistic && s.status !== "arquivada" && (
                  <button
                    type="button"
                    disabled={busyId === s.id}
                    onClick={() => setScriptModal({ id: s.id, intent: "prepare" })}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/5 disabled:opacity-40"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Escrever a história do próximo vídeo
                    {s.hasNextScript && (
                      <span className="rounded-full bg-emerald-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                        história pronta
                      </span>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => openEditModal(s)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/5"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </button>

                <button
                  type="button"
                  disabled={busyId === s.id}
                  onClick={() => handleDelete(s.id)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {noCreditsOpen && (
        <RealisticNoCreditsModal
          onClose={() => setNoCreditsOpen(false)}
          normalLabel="Criar série de vídeo normal"
          onUseNormal={() => router.push("/dashboard/series/nova")}
        />
      )}

      {scriptModal && series.find((x) => x.id === scriptModal.id) && (
        <NextScriptModal
          series={series.find((x) => x.id === scriptModal.id)!}
          intent={scriptModal.intent}
          first={scriptModal.first}
          onClose={() => setScriptModal(null)}
          onChanged={(hasScript) =>
            setSeries((prev) => prev.map((x) => (x.id === scriptModal.id ? { ...x, hasNextScript: hasScript } : x)))
          }
          onGenerateNow={() => {
            const id = scriptModal.id;
            setScriptModal(null);
            void handleGenerateNow(id);
          }}
        />
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#0a0a12] sm:max-w-lg sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-5 py-4 sm:px-6">
              <h2 className="text-base font-semibold text-white sm:text-lg">
                Editar série
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:bg-white/5 hover:text-white"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {editingRealistic && <RealisticNotice className="mx-5 mt-3 sm:mx-6" />}

            <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-4">
                <Field label="Nome da série">
                  <input
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Ex.: Curiosidades Históricas Diárias"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-[#4C3BFF]/50 focus:outline-none"
                  />
                </Field>

                <Field label="Nicho">
                  <Combobox
                    value={form.nicho}
                    onChange={(v) => setForm((f) => ({ ...f, nicho: v }))}
                    options={NICHO_SUGESTOES}
                    placeholder="Ex.: Curiosidades históricas (ou digite o seu)"
                    aria-label="Nicho"
                  />
                </Field>

                <Field label="Tom de voz do conteúdo">
                  <Select
                    value={form.tomDeVoz}
                    onChange={(v) => setForm((f) => ({ ...f, tomDeVoz: v }))}
                    options={withCurrent(
                      styleOptions.map((s) => ({ value: s.title, label: s.title })),
                      form.tomDeVoz,
                    )}
                    aria-label="Tom de voz do conteúdo"
                  />
                </Field>

                {/* Onde escrever a história do próximo vídeo (antes o cliente não achava). */}
                {editingId && !editingRealistic && (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-sm font-semibold text-white">História do próximo vídeo</p>
                    <p className="mt-1 text-[13px] leading-snug text-zinc-400">
                      {series.find((x) => x.id === editingId)?.hasNextScript
                        ? "Você já deixou uma história pronta para o próximo vídeo."
                        : "Nenhuma história guardada: a IA cria sozinha. Se quiser, escreva a sua."}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const id = editingId;
                        setModalOpen(false);
                        setScriptModal({ id, intent: "prepare" });
                      }}
                      className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/15 text-sm font-semibold text-zinc-100 hover:bg-white/5"
                    >
                      <FileText className="h-4 w-4" />
                      Escrever a história do próximo vídeo
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Idioma">
                    <Select
                      value={form.idioma}
                      onChange={(v) => setForm((f) => ({ ...f, idioma: v as FormState["idioma"] }))}
                      options={IDIOMA_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                      aria-label="Idioma"
                    />
                  </Field>

                  <Field label="Duração">
                    <Select
                      value={form.duration}
                      onChange={(v) => setForm((f) => ({ ...f, duration: v }))}
                      // 60s só existe na série de Vídeo Realista; nos planos
                      // normais a duração é sempre 30s.
                      options={(editingRealistic
                        ? SERIES_DURATIONS
                        : canUseLong
                          ? [...NORMAL_SERIES_DURATIONS, LONG_SERIES_DURATION]
                          : NORMAL_SERIES_DURATIONS
                      ).map((d) => ({
                        value: d.value,
                        label: d.value,
                        description: editingRealistic
                          ? d.value === "60s"
                            ? "60 segundos (2 créditos por episódio)"
                            : "30 segundos (1 crédito por episódio)"
                          : d.label,
                      }))}
                      aria-label="Duração"
                    />
                    {!editingRealistic && longVideosEnabled && !canUseLong && (
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
                  </Field>
                </div>

                <Field label="Estilo visual">
                  <Select
                    value={form.visualStyle}
                    onChange={(v) => setForm((f) => ({ ...f, visualStyle: v }))}
                    options={withCurrent(
                      (editingRealistic ? REALISTIC_STYLES : VISUAL_STYLES).map((v) => ({ value: v.name, label: v.name })),
                      form.visualStyle,
                    )}
                    aria-label="Estilo visual"
                  />
                </Field>

                <Field label="Voz da narração">
                  <Select
                    value={form.voice}
                    onChange={(v) => setForm((f) => ({ ...f, voice: v }))}
                    options={SERIES_VOICES.map((v) => ({
                      value: v.name,
                      label: v.name,
                      description: `${v.gender} · ${v.description}`,
                    }))}
                    aria-label="Voz da narração"
                  />
                </Field>

                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-3">
                  <span className="text-sm text-white">Legendas</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.captionsEnabled}
                    onClick={() => setForm((f) => ({ ...f, captionsEnabled: !f.captionsEnabled }))}
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
                  <Field label="Estilo da legenda">
                    <Select
                      value={form.captionStyle ?? SERIES_CAPTION_STYLES[0]?.name}
                      onChange={(v) => setForm((f) => ({ ...f, captionStyle: v }))}
                      options={SERIES_CAPTION_STYLES.map((c) => ({ value: c.name, label: c.name }))}
                      aria-label="Estilo da legenda"
                    />
                  </Field>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Frequência">
                    <Select
                      value={String(form.frequenciaDias)}
                      onChange={(v) => setForm((f) => ({ ...f, frequenciaDias: Number(v) }))}
                      options={FREQUENCIA_OPTIONS.map((f) => ({ value: String(f.value), label: f.label }))}
                      aria-label="Frequência"
                    />
                  </Field>

                  <Field label="Horário (de Brasília)">
                    <input
                      type="time"
                      value={form.horario}
                      onChange={(e) => setForm((f) => ({ ...f, horario: e.target.value }))}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white focus:border-[#4C3BFF]/50 focus:outline-none"
                    />
                  </Field>
                </div>

                {formError && (
                  <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-xs font-medium text-red-400">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {formError}
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 border-t border-white/[0.06] px-5 py-4 sm:px-6">
              <button
                type="button"
                disabled={saving}
                onClick={handleSubmit}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#4C3BFF] to-[#A855F7] text-[15px] font-medium text-white shadow-lg shadow-[#4C3BFF]/25 disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Salvar alterações
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-zinc-400">{label}</span>
      {children}
    </label>
  );
}
