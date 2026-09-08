"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { createClient } from "@/utils/supabase/client";
import { mapVideoRow, type VideoRow } from "./videoMapping";
import type { VideoRecord } from "./types";
import { PLANS, type PlanKey } from "@/lib/billing/plans";
import { countVideosUsedToday, parseGenerationError } from "@/lib/billing/dailyLimit";

export type WizardInitial = {
  topic?: string;
  style?: string;
};

export type NewVideoInput = {
  title: string;
  topic: string;
  style: string;
  visualStyle: string | null;
  duration: string;
  voice: string;
  captionsEnabled: boolean;
  captionStyle: string | null;
  gradient: string;
};

type DashboardContextValue = {
  videos: VideoRecord[];
  addVideo: (input: NewVideoInput) => Promise<void>;
  removeVideo: (id: string) => void;
  refetchVideos: () => Promise<void>;
  plan: PlanKey | null;
  dailyVideoLimit: number;
  videosUsedToday: number;
  videosRemainingToday: number;
  isWizardOpen: boolean;
  wizardInitial: WizardInitial;
  openWizard: (initial?: WizardInitial) => void;
  closeWizard: () => void;
  isPlanModalOpen: boolean;
  openPlanModal: () => void;
  closePlanModal: () => void;
};

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({
  children,
  initialVideos,
  initialPlan,
}: {
  children: ReactNode;
  initialVideos: VideoRecord[];
  initialPlan: PlanKey | null;
}) {
  const [videos, setVideos] = useState<VideoRecord[]>(initialVideos);
  const [plan, setPlan] = useState<PlanKey | null>(initialPlan);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardInitial, setWizardInitial] = useState<WizardInitial>({});
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);

  const dailyVideoLimit = plan ? PLANS[plan].dailyVideoLimit : 0;
  const videosUsedToday = useMemo(() => countVideosUsedToday(videos), [videos]);
  const videosRemainingToday = Math.max(0, dailyVideoLimit - videosUsedToday);

  const openPlanModal = useCallback(() => setIsPlanModalOpen(true), []);
  const closePlanModal = useCallback(() => setIsPlanModalOpen(false), []);

  const addVideo = useCallback(async (input: NewVideoInput) => {
    const tempId = `temp-${Date.now()}`;
    const placeholder: VideoRecord = {
      id: tempId,
      title: input.title,
      topic: input.topic,
      style: input.style,
      visualStyle: input.visualStyle,
      status: "Processando",
      duration: input.duration,
      voice: input.voice,
      captionsEnabled: input.captionsEnabled,
      captionStyle: input.captionStyle,
      createdAt: "agora",
      createdAtIso: new Date().toISOString(),
      gradient: input.gradient,
      videoUrl: null,
      thumbnailUrl: null,
      errorMessage: null,
      seriesId: null,
    };
    setVideos((prev) => [placeholder, ...prev]);

    let result: VideoRow | null = null;
    let errorMessage: string | null = null;
    let reason: "no_subscription" | "daily_limit_reached" | "other" = "other";

    try {
      const response = await fetch("/api/videos/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data: unknown = await response.json();
      if (data && typeof data === "object" && "id" in data) {
        result = data as VideoRow;
      } else {
        const rawMessage = (data as { error?: string } | null)?.error ?? "Não foi possível gerar o vídeo.";
        const parsed = parseGenerationError(rawMessage);
        errorMessage = parsed.message;
        reason = parsed.reason;
      }
    } catch {
      errorMessage = "Não foi possível conectar ao servidor.";
    }

    setVideos((prev) => {
      const withoutPlaceholder = prev.filter((v) => v.id !== tempId);
      return result ? [mapVideoRow(result), ...withoutPlaceholder] : withoutPlaceholder;
    });

    if (errorMessage) {
      if (reason === "no_subscription") {
        setIsWizardOpen(false);
        openPlanModal();
      }
      throw new Error(errorMessage);
    }
  }, [openPlanModal]);

  const removeVideo = useCallback((id: string) => {
    setVideos((prev) => prev.filter((v) => v.id !== id));
  }, []);

  // `videos` só é carregado do Supabase UMA vez, no primeiro carregamento do
  // layout (server-side); depois disso fica só em memória, mantido por
  // `addVideo`/`removeVideo`. Isso busca de novo direto no Supabase (a
  // fonte da verdade), pra corrigir qualquer divergência — inclusive um
  // registro que já foi apagado mas ainda está nesse estado em memória.
  const refetchVideos = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("videos")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .returns<VideoRow[]>();

    if (error) {
      console.error("[DashboardContext] falha ao rebuscar vídeos:", error);
      return;
    }
    setVideos((data ?? []).map(mapVideoRow));
  }, []);

  const openWizard = useCallback((initial: WizardInitial = {}) => {
    setWizardInitial(initial);

    if (!plan) {
      openPlanModal();
      return;
    }

    setIsWizardOpen(true);

    // O plano ativo foi carregado uma única vez no primeiro carregamento da
    // página — se mudou desde então (upgrade/downgrade/cancelamento), o app
    // não saberia. Busca de novo aqui, sempre que o wizard abre, pra nunca
    // depender de dado velho.
    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("subscriptions")
        .select("plan")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ plan: PlanKey }>();

      setPlan(data?.plan ?? null);
    })();
  }, [plan, openPlanModal]);

  const closeWizard = useCallback(() => setIsWizardOpen(false), []);

  return (
    <DashboardContext.Provider
      value={{
        videos,
        addVideo,
        removeVideo,
        refetchVideos,
        plan,
        dailyVideoLimit,
        videosUsedToday,
        videosRemainingToday,
        isWizardOpen,
        wizardInitial,
        openWizard,
        closeWizard,
        isPlanModalOpen,
        openPlanModal,
        closePlanModal,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) {
    throw new Error("useDashboard deve ser usado dentro de DashboardProvider");
  }
  return ctx;
}
