import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { mapMusicTrackRow, type MusicTrackRow } from "@/components/dashboard/musicMapping";

// Lista as faixas prontas (biblioteca) + as que o próprio usuário subiu.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("music_tracks")
    .select("*")
    .order("is_builtin", { ascending: false })
    .order("id", { ascending: true })
    .returns<MusicTrackRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const tracks = (data ?? []).map((row) => {
    // Faixas prontas são asset estático do próprio Next.js
    // (public/audio/music-library) — só as personalizadas vêm do bucket.
    const url = row.is_builtin
      ? row.storage_path
      : supabase.storage.from("music").getPublicUrl(row.storage_path).data.publicUrl;
    return mapMusicTrackRow(row, url);
  });

  return NextResponse.json(tracks);
}
