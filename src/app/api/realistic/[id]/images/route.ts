import { NextResponse } from "next/server";
import { authenticate, loadOwnedVideo, NOT_FOUND } from "@/lib/realistic/api";
import { extractErrorMessage, generateSceneImages } from "@/lib/realistic/pipeline";
import { mapRealisticRow, type RealisticVideoRow } from "@/lib/realistic/row";

export const runtime = "nodejs";
export const maxDuration = 120;

// Passo 6: gera as 6 imagens da prévia (sem texto, fotorrealistas). Não gasta
// crédito. Se já foram geradas, só devolve as existentes.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const { user, service } = auth;

  const video = await loadOwnedVideo(service, user.id, id);
  if (!video || !video.script) return NOT_FOUND();
  if (video.status !== "Rascunho" && video.status !== "Erro") {
    return NextResponse.json({ error: "Este vídeo já está sendo gerado." }, { status: 409 });
  }
  if (video.scene_images && video.scene_images.length === video.script.scenes.length) {
    return NextResponse.json(mapRealisticRow(video));
  }

  try {
    const paths = await generateSceneImages(service, video, video.script);
    return NextResponse.json(mapRealisticRow({ ...video, scene_images: paths } as RealisticVideoRow));
  } catch (err) {
    console.error("[/api/realistic/images] falhou:", err);
    return NextResponse.json({ error: extractErrorMessage(err) }, { status: 500 });
  }
}
