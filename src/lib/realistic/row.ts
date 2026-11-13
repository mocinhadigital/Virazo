import {
  type RealisticLanguage,
  type RealisticScript,
  type RealisticVideoRecord,
  type RealisticVideoStatus,
} from "./constants";

// Linha crua de public.realistic_videos (migration 0035). Sem "server-only":
// o navegador também lê a tabela (política de SELECT do dono) e mapeia aqui.
export type RealisticVideoRow = {
  id: string;
  user_id: string;
  series_id: string | null;
  mode: "guided" | "free" | "series";
  title: string;
  topic: string;
  language: RealisticLanguage;
  realistic_style: string;
  duration_seconds: 30 | 60;
  credit_cost: number;
  fal_jobs: FalJob[] | null;
  narration: NarrationItem[] | null;
  stage_lock_at: string | null;
  voice: string | null;
  captions_enabled: boolean;
  caption_style: string | null;
  background_music_id: string | null;
  script: RealisticScript | null;
  scene_images: string[] | null;
  script_generations: number;
  swaps_used: number;
  status: RealisticVideoStatus;
  credit_spent: boolean;
  credit_refunded: boolean;
  caption_failed?: boolean;
  video_url: string | null;
  thumbnail_url: string | null;
  error_message: string | null;
  progress_stage: string | null;
  progress_current: number | null;
  progress_total: number | null;
  reserved_at: string | null;
  created_at: string;
};

export const REALISTIC_BUCKET = "videos";

// Uma animação enviada à fila do fal.ai (uma por cena).
export type FalJob = {
  requestId: string;
  status: "pending" | "done";
  attempts: number;
  clipPath: string | null;
};

// Narração já gerada de uma cena (arquivo no Storage + tempos das palavras).
export type NarrationItem = {
  audioPath: string;
  durationSeconds: number;
  words: { word: string; start: number; end: number }[];
  // A Groq (legenda) falhou nesta cena: ela fica sem legenda (e o cliente é ressarcido).
  captionsFailed?: boolean;
};

export function publicStorageUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/${REALISTIC_BUCKET}/${path}`;
}

export function mapRealisticRow(row: RealisticVideoRow): RealisticVideoRecord {
  return {
    id: row.id,
    seriesId: row.series_id,
    mode: row.mode,
    title: row.title,
    topic: row.topic,
    language: row.language,
    realisticStyle: row.realistic_style,
    durationSeconds: row.duration_seconds ?? 30,
    creditCost: row.credit_cost ?? 1,
    voice: row.voice,
    captionsEnabled: row.captions_enabled,
    captionStyle: row.caption_style,
    backgroundMusicId: row.background_music_id,
    script: row.script,
    sceneImageUrls: (row.scene_images ?? []).map(publicStorageUrl),
    scriptGenerations: row.script_generations,
    swapsUsed: row.swaps_used,
    status: row.status,
    creditRefunded: row.credit_refunded,
    captionFailed: row.caption_failed ?? false,
    videoUrl: row.video_url,
    thumbnailUrl: row.thumbnail_url,
    errorMessage: row.error_message,
    progressStage: row.progress_stage,
    progressCurrent: row.progress_current,
    progressTotal: row.progress_total,
    startedAtIso: row.reserved_at ?? row.created_at,
    createdAtIso: row.created_at,
  };
}
