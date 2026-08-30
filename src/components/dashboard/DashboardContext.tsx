"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
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
    setVideos((prev) => prev.filter((v) => v.id !== id));
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
