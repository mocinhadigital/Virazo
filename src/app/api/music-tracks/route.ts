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
    .order("created_at", { ascending: true })
    .returns<MusicTrackRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const tracks = (data ?? []).map((row) => {
    const { data: urlData } = supabase.storage.from("music").getPublicUrl(row.storage_path);
    return mapMusicTrackRow(row, urlData.publicUrl);
  });

  return NextResponse.json(tracks);
}
