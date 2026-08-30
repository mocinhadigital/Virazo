import type { VideoRecord, VideoStatus } from "./types";

export type VideoRow = {
  id: string;
  user_id: string;
  title: string;
  topic: string;
  style: string;
  duration: string;
  voice: string | null;
  captions_enabled: boolean;
  caption_style: string | null;
  status: VideoStatus;
  gradient: string;
  visual_style: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  error_message: string | null;
  created_at: string;
  series_id?: string | null;
};

export function mapVideoRow(row: VideoRow): VideoRecord {
  return {
    id: row.id,
    title: row.title,
    style: row.style,
    visualStyle: row.visual_style,
    status: row.status,
    duration: row.duration,
    createdAt: formatCreatedAt(row.created_at),
    gradient: row.gradient,
    videoUrl: row.video_url,
    thumbnailUrl: row.thumbnail_url,
    errorMessage: row.error_message,
    seriesId: row.series_id ?? null,
  };
}

function formatCreatedAt(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 5 * 60 * 1000) return "agora";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}
