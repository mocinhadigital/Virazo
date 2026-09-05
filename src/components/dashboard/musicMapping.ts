export type MusicTrackRow = {
  id: string;
  title: string;
  description: string | null;
  storage_path: string;
  is_builtin: boolean;
  owner_user_id: string | null;
  duration_seconds: number | null;
  created_at: string;
};

export type MusicTrackRecord = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  isBuiltin: boolean;
};

export function mapMusicTrackRow(row: MusicTrackRow, publicUrl: string): MusicTrackRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    url: publicUrl,
    isBuiltin: row.is_builtin,
  };
}
