export type VideoStatus = "Pronto" | "Processando" | "Rascunho" | "Erro";

export type VideoRecord = {
  id: string;
  title: string;
  style: string;
  visualStyle: string | null;
  status: VideoStatus;
  duration: string;
  createdAt: string;
  gradient: string;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  errorMessage: string | null;
};
