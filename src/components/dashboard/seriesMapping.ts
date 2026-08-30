import type { SeriesRecord, SeriesStatus } from "./types";

export type SeriesRow = {
  id: string;
  user_id: string;
  title: string;
  nicho: string;
  tom_de_voz: string;
  idioma: "pt" | "en" | "es";
  visual_style: string;
  voice: string | null;
  duration: string;
  captions_enabled: boolean;
  caption_style: string | null;
  frequencia_dias: number;
  horario: string;
  status: SeriesStatus;
  next_generation_at: string | null;
  last_generated_at: string | null;
  total_videos_gerados: number;
  created_at: string;
  updated_at: string;
};

export function mapSeriesRow(row: SeriesRow): SeriesRecord {
  return {
    id: row.id,
    title: row.title,
    nicho: row.nicho,
    tomDeVoz: row.tom_de_voz,
    idioma: row.idioma,
    visualStyle: row.visual_style,
    voice: row.voice,
    duration: row.duration,
    captionsEnabled: row.captions_enabled,
    captionStyle: row.caption_style,
    frequenciaDias: row.frequencia_dias,
    horario: row.horario,
    status: row.status,
    nextGenerationAt: row.next_generation_at,
    lastGeneratedAt: row.last_generated_at,
    totalVideosGerados: row.total_videos_gerados,
    createdAt: row.created_at,
  };
}
