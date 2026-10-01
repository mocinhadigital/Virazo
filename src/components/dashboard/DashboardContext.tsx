"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { mapVideoRow, type VideoRow } from "./videoMapping";
import type { VideoRecord } from "./types";
import { PLANS, type PlanKey } from "@/lib/billing/plans";
import { countVideosUsedToday, parseGenerationError } from "@/lib/billing/dailyLimit";

export type WizardInitial = {
  topic?: string;
  style?: string;
};

// Intervalo da consulta de status enquanto houver vídeo "Gerando".
const PROGRESS_POLL_MS = 4000;

// Falha de geração. `videoId` vem preenchido quando o registro existe e
// ficou como "Falhou" — é o que permite oferecer "Tentar de novo".
export class VideoGenerationError extends Error {
  constructor(
    message: string,
    readonly videoId?: string,
  ) {
    super(message);
    this.name = "VideoGenerationError";
  }
}

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
  retryVideo: (videoId: string) => Promise<void>;
  // false = só 15s/30s disponíveis (LONG_VIDEOS_ENABLED, ver
  // src/lib/video/durations.ts).
  longVideosEnabled: boolean;
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
  // Verificação ativa de pagamento na Cakto (POST /api/billing/cakto/verify).
  // caktoVerifyEnabled = CAKTO_CLIENT_ID/SECRET configurados no servidor.
  caktoVerifyEnabled: boolean;
  isVerifyingPayment: boolean;
  verifyPayment: () => Promise<PaymentVerification>;
  paymentNotice: string | null;
  dismissPaymentNotice: () => void;
};

export type PaymentVerification =
  | { status: "activated"; plan: PlanKey }
  | { status: "not_found" }
  | { status: "rate_limited"; retryAfterSeconds: number }
  | { status: "not_configured" }
  | { status: "error"; message: string };

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({
  children,
  initialVideos,
  initialPlan,
  caktoVerifyEnabled = false,
  longVideosEnabled = false,
}: {
  children: ReactNode;
  initialVideos: VideoRecord[];
  initialPlan: PlanKey | null;
  caktoVerifyEnabled?: boolean;
  longVideosEnabled?: boolean;
}) {
  const router = useRouter();
  const [videos, setVideos] = useState<VideoRecord[]>(initialVideos);
  const [plan, setPlan] = useState<PlanKey | null>(initialPlan);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardInitial, setWizardInitial] = useState<WizardInitial>({});
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);
  const verifyInFlight = useRef<Promise<PaymentVerification> | null>(null);

  // Quem chamar enquanto já existe uma verificação no ar recebe a MESMA
  // promessa — o botão do pop-up e a verificação automática nunca disparam
  // duas consultas ao mesmo tempo.
  const verifyPayment = useCallback((): Promise<PaymentVerification> => {
    if (verifyInFlight.current) return verifyInFlight.current;

    const run = (async (): Promise<PaymentVerification> => {
      setIsVerifyingPayment(true);
      try {
        const response = await fetch("/api/billing/cakto/verify", { method: "POST" });
        const rawBody = await response.text();
        let data: Partial<PaymentVerification> & { error?: string } = {};
        try {
          data = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          // corpo não-JSON: cai no erro genérico abaixo
        }
        if (!response.ok || !data.status) {
          return { status: "error", message: data.error ?? "Não foi possível verificar o pagamento agora." };
        }

        const result = data as PaymentVerification;
        if (result.status === "activated") {
          setPlan(result.plan);
          setPaymentNotice(`Pagamento confirmado! Plano ${PLANS[result.plan].name} ativado.`);
          // Atualiza o que foi renderizado no servidor (ex.: Configurações).
          router.refresh();
        }
        return result;
      } catch {
        return { status: "error", message: "Não foi possível conectar ao servidor." };
      } finally {
        setIsVerifyingPayment(false);
        verifyInFlight.current = null;
      }
    })();

    verifyInFlight.current = run;
    return run;
  }, [router]);

  const dismissPaymentNotice = useCallback(() => setPaymentNotice(null), []);

  const dailyVideoLimit = plan ? PLANS[plan].dailyVideoLimit : 0;
  const videosUsedToday = useMemo(() => countVideosUsedToday(videos), [videos]);
  const videosRemainingToday = Math.max(0, dailyVideoLimit - videosUsedToday);

  const openPlanModal = useCallback(() => setIsPlanModalOpen(true), []);
  const closePlanModal = useCallback(() => setIsPlanModalOpen(false), []);

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

    // Antes de ler: vídeo "Gerando" há mais de 10 minutos vira "Falhou"
    // (migration 0025). Falha aqui não impede a leitura.
    const { error: expireError } = await supabase.rpc("expire_stale_videos");
    if (expireError) console.warn("[DashboardContext] expire_stale_videos falhou:", expireError.message);

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

  // Enquanto houver vídeo "Gerando", relê a lista a cada poucos segundos —
  // é o que faz a etapa/tempo estimado andarem na tela e o card virar
  // "Pronto" ou "Falhou" sozinho, inclusive para vídeos de série gerados
  // no servidor sem esta aba ter pedido nada.
  const hasVideoInProgress = videos.some((v) => v.status === "Processando");
  useEffect(() => {
    if (!hasVideoInProgress) return;
    const timer = setInterval(() => void refetchVideos(), PROGRESS_POLL_MS);
    return () => clearInterval(timer);
  }, [hasVideoInProgress, refetchVideos]);

  const addVideo = useCallback(async (input: NewVideoInput) => {
    const tempId = `temp-${Date.now()}`;
    const nowIso = new Date().toISOString();
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
      createdAtIso: nowIso,
      gradient: input.gradient,
      videoUrl: null,
      thumbnailUrl: null,
      errorMessage: null,
      seriesId: null,
      progressStage: null,
      progressCurrent: null,
      progressTotal: null,
      startedAtIso: nowIso,
    };
    setVideos((prev) => [placeholder, ...prev]);

    let result: VideoRow | null = null;
    let errorMessage: string | null = null;
    let reason: "no_subscription" | "daily_limit_reached" | "other" = "other";
    let connectionLost = false;

    try {
      const response = await fetch("/api/videos/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data: unknown = await response.json();
      if (data && typeof data === "object" && "id" in data) {
        result = data as VideoRow;
        // Em falha a rota devolve o próprio registro já marcado como
        // 'Erro' (status 500) — tem "id", mas NÃO é sucesso. Antes isso
        // caía aqui como pronto e o wizard mostrava "vídeo gerado".
        if (result.status === "Erro") errorMessage = result.error_message ?? "Não foi possível gerar o vídeo.";
      } else {
        const rawMessage = (data as { error?: string } | null)?.error ?? "Não foi possível gerar o vídeo.";
        const parsed = parseGenerationError(rawMessage);
        errorMessage = parsed.message;
        reason = parsed.reason;
      }
    } catch {
      // Resposta perdida (rede caiu, aba suspensa) — a geração pode seguir
      // no servidor. Relê a lista para o card real aparecer com o status
      // de verdade.
      connectionLost = true;
      errorMessage =
        'Perdemos a conexão com o servidor. Se o vídeo continuar gerando, ele aparece em "Meus vídeos" quando terminar.';
    }

    setVideos((prev) => {
      // Tira o placeholder e uma eventual cópia do mesmo registro que a
      // consulta periódica já tenha trazido, antes de inserir o resultado.
      const rest = prev.filter((v) => v.id !== tempId && v.id !== result?.id);
      return result ? [mapVideoRow(result), ...rest] : rest;
    });
    if (connectionLost) void refetchVideos();

    if (errorMessage) {
      if (reason === "no_subscription") {
        setIsWizardOpen(false);
        openPlanModal();
      }
      throw new VideoGenerationError(errorMessage, result?.status === "Erro" ? result.id : undefined);
    }
  }, [openPlanModal, refetchVideos]);

  // "Tentar de novo": reprocessa o MESMO registro (mesmo id), sem gastar
  // vaga nova do limite diário. Marca o card como "Gerando" na hora para o
  // progresso aparecer enquanto a requisição está no ar.
  const retryVideo = useCallback(
    async (videoId: string): Promise<void> => {
      const nowIso = new Date().toISOString();
      setVideos((prev) =>
        prev.map((v) =>
          v.id === videoId
            ? {
                ...v,
                status: "Processando",
                errorMessage: null,
                progressStage: null,
                progressCurrent: null,
                progressTotal: null,
                startedAtIso: nowIso,
              }
            : v,
        ),
      );

      try {
        const res = await fetch(`/api/videos/${videoId}/retry`, { method: "POST" });
        const data: unknown = await res.json().catch(() => null);
        const row = data as (VideoRow & { error?: string }) | null;
        if (!res.ok || row?.status === "Erro") {
          throw new VideoGenerationError(
            row?.error_message ?? row?.error ?? "Não foi possível gerar o vídeo.",
            videoId,
          );
        }
      } finally {
        // Status final real (Pronto/Erro) direto do Supabase.
        await refetchVideos();
      }
    },
    [refetchVideos],
  );

  const removeVideo = useCallback((id: string) => {
    setVideos((prev) => prev.filter((v) => v.id !== id));
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
        retryVideo,
        longVideosEnabled,
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
        caktoVerifyEnabled,
        isVerifyingPayment,
        verifyPayment,
        paymentNotice,
        dismissPaymentNotice,
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
