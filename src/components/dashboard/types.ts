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
  gradient: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  errorMessage: string | null;
  seriesId: string | null;
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
  frequenciaDias: number;
  horario: string;
  status: SeriesStatus;
  nextGenerationAt: string | null;
  lastGeneratedAt: string | null;
  totalVideosGerados: number;
  createdAt: string;
};
