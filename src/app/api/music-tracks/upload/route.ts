import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { mapMusicTrackRow } from "@/components/dashboard/musicMapping";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB, mesmo limite mostrado na referência
const ALLOWED_TYPES = new Set(["audio/mpeg", "audio/wav", "audio/wave", "audio/x-wav"]);

// Upload real de música personalizada (aba "Personalizada"): sobe o arquivo
// pro bucket "music" do próprio usuário e cria a linha em music_tracks.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Formato inválido. Envie MP3 ou WAV." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Arquivo maior que 10MB." }, { status: 400 });
  }

  const extension = file.type === "audio/mpeg" ? "mp3" : "wav";
  const storagePath = `${user.id}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("music")
    .upload(storagePath, await file.arrayBuffer(), { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: `Falha ao enviar o arquivo: ${uploadError.message}` }, { status: 500 });
  }

  const { data: created, error: insertError } = await supabase
    .from("music_tracks")
    .insert({
      title: file.name.replace(/\.[^.]+$/, ""),
      description: null,
      storage_path: storagePath,
      is_builtin: false,
      owner_user_id: user.id,
    })
    .select("*")
    .single();

  if (insertError || !created) {
    await supabase.storage.from("music").remove([storagePath]);
    return NextResponse.json(
      { error: insertError?.message ?? "Não foi possível registrar a música." },
      { status: 500 },
    );
  }

  const { data: urlData } = supabase.storage.from("music").getPublicUrl(storagePath);
  return NextResponse.json(mapMusicTrackRow(created, urlData.publicUrl));
}
