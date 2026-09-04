"use client";

import { useState } from "react";
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
} from "lucide-react";
import type { SeriesRecord, SeriesStatus } from "../types";
import { styleOptions } from "../styleOptions";
import { VISUAL_STYLES } from "../visualStyles";
import Select from "@/components/ui/Select";
import Combobox from "@/components/ui/Combobox";
import {
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
  captionStyle: "Destaque",
  frequenciaDias: 1,
  horario: "09:00",
};

function formStateFromSeries(series: SeriesRecord): FormState {
  return {
    title: series.title,
    nicho: series.nicho,
    tomDeVoz: series.tomDeVoz,
    idioma: series.idioma,
    visualStyle: series.visualStyle,
    voice: series.voice ?? SERIES_VOICES[0]?.name ?? "Ana",
    duration: series.duration,
    captionsEnabled: series.captionsEnabled,
    captionStyle: series.captionStyle,
    frequenciaDias: series.frequenciaDias,
    horario: series.horario.slice(0, 5),
  };
}

const STATUS_LABEL: Record<SeriesStatus, string> = {
  ativa: "Ativa",
  pausada: "Pausada",
  arquivada: "Arquivada",
};

const STATUS_BADGE: Record<SeriesStatus, string> = {
  ativa: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  pausada: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  arquivada: "border-white/10 bg-white/[0.04] text-zinc-500",
};

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
  const [series, setSeries] = useState<SeriesRecord[]>(initialSeries);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function openCreateModal() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(target: SeriesRecord) {
    setEditingId(target.id);
    setForm(formStateFromSeries(target));
    setFormError(null);
    setModalOpen(true);
  }

  async function handleSubmit() {
    if (!form.title.trim() || !form.nicho.trim()) {
      setFormError("Preencha pelo menos o nome da série e o nicho.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(editingId ? `/api/series/${editingId}` : "/api/series", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível salvar a série.");

      setSeries((prev) =>
        editingId ? prev.map((s) => (s.id === editingId ? data : s)) : [data, ...prev],
      );
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Não foi possível salvar a série.");
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
      if (!res.ok) throw new Error(data.error ?? "Não foi possível atualizar a série.");
      setSeries((prev) => prev.map((s) => (s.id === id ? data : s)));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Não foi possível atualizar a série.");
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
      setNotice(err instanceof Error ? err.message : "Não foi possível excluir a série.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleGenerateNow(id: string) {
    setBusyId(id);
    setNotice(null);
    try {
      const res = await fetch(`/api/series/${id}/generate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível gerar o vídeo.");
      setNotice(`Vídeo gerado com sucesso a partir desta série — confira em "Meus vídeos" no painel.`);
      // Reflete o novo total/agendamento sem precisar recarregar a página.
      const refreshed = await fetch("/api/series").then((r) => r.json());
      if (Array.isArray(refreshed)) setSeries(refreshed);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Não foi possível gerar o vídeo.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          {series.length === 0
            ? "Nenhuma série cadastrada ainda."
            : `${series.length} ${series.length === 1 ? "série cadastrada" : "séries cadastradas"}`}
        </p>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#4C3BFF]/20"
        >
          <Plus className="h-4 w-4" />
          Nova série
        </button>
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
            Crie sua primeira série pra gerar vídeos automaticamente, no ritmo que você definir.
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

              <div className="flex flex-wrap gap-1.5 text-[11px] text-zinc-400">
                <span className="rounded-full border border-white/10 px-2 py-0.5">{s.visualStyle}</span>
                <span className="rounded-full border border-white/10 px-2 py-0.5">{s.tomDeVoz}</span>
                <span className="rounded-full border border-white/10 px-2 py-0.5">
                  {IDIOMA_OPTIONS.find((o) => o.value === s.idioma)?.label ?? s.idioma}
                </span>
                <span className="rounded-full border border-white/10 px-2 py-0.5">
                  {FREQUENCIA_OPTIONS.find((f) => f.value === s.frequenciaDias)?.label ??
                    `A cada ${s.frequenciaDias}d`}{" "}
                  · {s.horario.slice(0, 5)}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>{s.totalVideosGerados} vídeo(s) gerado(s)</span>
                <span>
                  {s.status === "ativa" ? `Próxima: ${formatDateTime(s.nextGenerationAt)}` : "—"}
                </span>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busyId === s.id || s.status === "arquivada"}
                  onClick={() => handleGenerateNow(s.id)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busyId === s.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="h-3.5 w-3.5" />
                  )}
                  Gerar agora
                </button>

                {s.status !== "arquivada" && (
                  <button
                    type="button"
                    disabled={busyId === s.id}
                    onClick={() =>
                      patchSeries(s.id, { status: s.status === "ativa" ? "pausada" : "ativa" })
                    }
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/5 disabled:opacity-40"
                  >
                    {s.status === "ativa" ? (
                      <Pause className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    {s.status === "ativa" ? "Pausar" : "Retomar"}
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
                {editingId ? "Editar série" : "Nova série"}
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
                    options={styleOptions.map((s) => ({ value: s.title, label: s.title }))}
                    aria-label="Tom de voz do conteúdo"
                  />
                </Field>

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
                      options={SERIES_DURATIONS.map((d) => ({ value: d.value, label: d.value, description: d.label }))}
                      aria-label="Duração"
                    />
                  </Field>
                </div>

                <Field label="Estilo visual">
                  <Select
                    value={form.visualStyle}
                    onChange={(v) => setForm((f) => ({ ...f, visualStyle: v }))}
                    options={VISUAL_STYLES.map((v) => ({ value: v.name, label: v.name }))}
                    aria-label="Estilo visual"
                  />
                </Field>

                <Field label="Voz da narração">
                  <Select
                    value={form.voice}
                    onChange={(v) => setForm((f) => ({ ...f, voice: v }))}
                    options={SERIES_VOICES.map((v) => ({ value: v.name, label: v.name, description: v.tag }))}
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
                      value={form.captionStyle ?? SERIES_CAPTION_STYLES[0]}
                      onChange={(v) => setForm((f) => ({ ...f, captionStyle: v }))}
                      options={SERIES_CAPTION_STYLES.map((c) => ({ value: c, label: c }))}
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

                  <Field label="Horário">
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
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[#4C3BFF]/25 disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {editingId ? "Salvar alterações" : "Criar série"}
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
