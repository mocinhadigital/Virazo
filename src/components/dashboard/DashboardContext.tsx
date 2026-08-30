"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/utils/supabase/client";
import { mapVideoRow, type VideoRow } from "./videoMapping";
import type { VideoRecord } from "./types";

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
  credits: number;
  isWizardOpen: boolean;
  wizardInitial: WizardInitial;
  openWizard: (initial?: WizardInitial) => void;
  closeWizard: () => void;
};

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({
  children,
  initialVideos,
  initialCredits,
}: {
  children: ReactNode;
  initialVideos: VideoRecord[];
  initialCredits: number;
}) {
  const [videos, setVideos] = useState<VideoRecord[]>(initialVideos);
  const [credits, setCredits] = useState(initialCredits);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardInitial, setWizardInitial] = useState<WizardInitial>({});

  // LOG TEMPORÁRIO — remover depois de descobrir o problema dos créditos.
  console.log("[Virazo debug] initialCredits recebido do servidor (layout.tsx):", initialCredits);

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
      gradient: input.gradient,
      videoUrl: null,
      thumbnailUrl: null,
      errorMessage: null,
      seriesId: null,
    };
    setVideos((prev) => [placeholder, ...prev]);
    setCredits((prev) => Math.max(0, prev - 1));

    let result: VideoRow | null = null;
    let errorMessage: string | null = null;

    try {
      const response = await fetch("/api/videos/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data: unknown = await response.json();
      if (data && typeof data === "object" && "id" in data) {
        result = data as VideoRow;
        if (result.status === "Erro") {
          errorMessage = result.error_message ?? "Não foi possível gerar o vídeo.";
        }
      } else {
        errorMessage = (data as { error?: string } | null)?.error ?? "Não foi possível gerar o vídeo.";
      }
    } catch {
      errorMessage = "Não foi possível conectar ao servidor.";
    }

    setVideos((prev) => {
      const withoutPlaceholder = prev.filter((v) => v.id !== tempId);
      return result ? [mapVideoRow(result), ...withoutPlaceholder] : withoutPlaceholder;
    });

    if (errorMessage) {
      setCredits((prev) => prev + 1);
      throw new Error(errorMessage);
    }
  }, []);

  const removeVideo = useCallback((id: string) => {
    console.log(
      "[VIDEOS STATE] REMOVENDO",
      id,
    );
    setVideos((prev) => {
      console.log("[VIDEOS STATE] ANTES", prev.map((v) => v.id));
      const next = prev.filter((v) => v.id !== id);
      console.log("[VIDEOS STATE] DEPOIS DO FILTER LOCAL", next.map((v) => v.id));
      return next;
    });
  }, []);

  // `videos` só é carregado do Supabase UMA vez — no primeiro carregamento
  // do layout (server-side, `dashboard/layout.tsx`). Layouts do Next.js NÃO
  // re-executam ao navegar entre páginas-irmãs (Painel -> Meus vídeos), só
  // no primeiro mount da árvore, ou num F5 de verdade. Isso significa que
  // `initialVideos` pode já estar desatualizado quando o usuário chega em
  // "Meus vídeos" (por exemplo, um vídeo apagado em outra aba/sessão antes
  // desse layout ter montado). Esta função busca de novo, direto no
  // Supabase, e SUBSTITUI o state inteiro pela resposta real do banco — sem
  // mesclar com o array antigo.
  //
  // `requestId` evita que uma chamada mais ANTIGA (que por algum motivo da
  // rede demore mais) sobrescreva o resultado de uma chamada mais NOVA que
  // já respondeu — sem isso, duas chamadas concorrentes (ex.: o refetch do
  // mount da página e o refetch disparado por uma exclusão) podem resolver
  // fora de ordem e a resposta desatualizada "vencer" por último.
  const refetchRequestId = useRef(0);

  const refetchVideos = useCallback(async () => {
    const requestId = ++refetchRequestId.current;
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

    if (requestId !== refetchRequestId.current) {
      console.warn(
        "[DashboardContext] refetch descartado — uma chamada mais nova já respondeu antes dessa (evita reinserir vídeo já excluído).",
      );
      return;
    }

    const freshVideos = (data ?? []).map(mapVideoRow);
    console.log("[VIDEOS STATE] APOS REFRESH SUPABASE", freshVideos.map((v) => v.id));
    setVideos(freshVideos);
  }, []);

  const openWizard = useCallback((initial: WizardInitial = {}) => {
    setWizardInitial(initial);
    setIsWizardOpen(true);

    // O saldo em `credits` foi carregado uma única vez no primeiro carregamento
    // da página e nunca mais é buscado — se o crédito mudou no banco desde
    // então (recarga manual, reembolso, etc.), o app não saberia. Busca de
    // novo aqui, sempre que o wizard abre, pra nunca depender de dado velho.
    void (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      // LOG TEMPORÁRIO — remover depois de descobrir o problema dos créditos.
      console.log("[Virazo debug] usuário autenticado ao abrir o wizard:", user?.id, user?.email);
      if (!user) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("credits")
        .eq("id", user.id)
        .maybeSingle()
        .returns<{ credits: number }>();

      // LOG TEMPORÁRIO — remover depois de descobrir o problema dos créditos.
      console.log("[Virazo debug] resultado da busca de créditos ao abrir o wizard:", { data, error });

      if (data) setCredits(data.credits);
    })();
  }, []);

  const closeWizard = useCallback(() => setIsWizardOpen(false), []);

  return (
    <DashboardContext.Provider
      value={{
        videos,
        addVideo,
        removeVideo,
        refetchVideos,
        credits,
        isWizardOpen,
        wizardInitial,
        openWizard,
        closeWizard,
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
