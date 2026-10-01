export type VideoStatus = "Pronto" | "Processando" | "Rascunho" | "Erro";

export type VideoRecord = {
  id: string;
  title: string;
  topic: string;
  style: string;
  visualStyle: string | null;
  status: VideoStatus;
  duration: string;
  voice: string | null;
  captionsEnabled: boolean;
  captionStyle: string | null;
  createdAt: string;
  createdAtIso: string;
  gradient: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  errorMessage: string | null;
  seriesId: string | null;
  // Progresso da geração (migration 0025) — só faz sentido em 'Processando'.
  progressStage: string | null;
  progressCurrent: number | null;
  progressTotal: number | null;
  // Início da tentativa atual (reserved_at; o "Tentar de novo" renova).
  // Base do tempo estimado e do limite de 10 minutos.
  startedAtIso: string;
};

export type SeriesStatus = "ativa" | "pausada" | "arquivada";

export type SeriesRecord = {
  id: string;
  title: string;
  nicho: string;
  tomDeVoz: string;
  idioma: "pt" | "en" | "es";
  visualStyle: string;
  voice: string | null;
  duration: string;
  captionsEnabled: boolean;
  captionStyle: string | null;
  backgroundMusicIds: string[];
  frequenciaDias: number;
  horario: string;
  status: SeriesStatus;
  nextGenerationAt: string | null;
  lastGeneratedAt: string | null;
  totalVideosGerados: number;
  createdAt: string;
};
