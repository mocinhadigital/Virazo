import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

// Carrega os bytes da faixa escolhida. Faixas prontas (is_builtin) têm
// storage_path = "/audio/music-library/x.mp3", um arquivo de public/ — NÃO
// existem no bucket "music" do Supabase (só as enviadas pelo usuário). Antes,
// tudo era baixado do bucket: pras prontas o download falhava em silêncio e o
// MP4 saía sem música.
export async function loadBackgroundMusic(
  supabase: SupabaseClient,
  musicId: string | null | undefined,
): Promise<Buffer | undefined> {
  if (!musicId) return undefined;

  const { data: track, error } = await supabase
    .from("music_tracks")
    .select("storage_path, is_builtin")
    .eq("id", musicId)
    .maybeSingle<{ storage_path: string; is_builtin: boolean }>();
  if (error || !track) {
    console.warn(`[video/music] faixa ${musicId} não encontrada:`, error?.message ?? "sem linha");
    return undefined;
  }

  try {
    if (track.is_builtin) {
      // Só aceita caminhos dentro de public/audio/music-library.
      const rel = track.storage_path.replace(/^\/+/, "");
      const full = path.join(process.cwd(), "public", rel);
      const libDir = path.join(process.cwd(), "public", "audio", "music-library") + path.sep;
      if (!full.startsWith(libDir)) throw new Error(`caminho inválido: ${track.storage_path}`);
      try {
        return await readFile(full);
      } catch {
        // Fallback: busca o asset estático pela URL pública do próprio site.
        const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
        if (!host) throw new Error("arquivo ausente no bundle e sem URL do site para fallback");
        const res = await fetch(`https://${host}/${rel}`);
        if (!res.ok) throw new Error(`fallback HTTP ${res.status}`);
        return Buffer.from(await res.arrayBuffer());
      }
    }

    const { data: blob, error: dlError } = await supabase.storage.from("music").download(track.storage_path);
    if (dlError || !blob) throw new Error(dlError?.message ?? "download vazio");
    return Buffer.from(await blob.arrayBuffer());
  } catch (err) {
    console.warn(`[video/music] não foi possível carregar "${track.storage_path}":`, err);
    return undefined;
  }
}
