import { NextResponse } from "next/server";
import { authenticate, loadOwnedVideo, NOT_FOUND } from "@/lib/realistic/api";
import { parseRealisticDbError, startRealisticGeneration } from "@/lib/realistic/pipeline";
import { mapRealisticRow, type RealisticVideoRow } from "@/lib/realistic/row";
import { realisticSceneCount } from "@/lib/realistic/constants";

export const runtime = "nodejs";
// A geração roda DEPOIS da resposta, em ETAPAS encadeadas (ver advance.ts):
// cada etapa cabe nos 300s da função, e o vídeo todo pode levar até 25 min
// antes de virar "Erro" (com os créditos devolvidos).
export const maxDuration = 300;

// Passo 7: "Animar meu vídeo (usa 1 crédito)". É AQUI, e só aqui, que o
// crédito realista é descontado. Responde na hora com o vídeo "Processando";
// o cliente acompanha por GET /api/realistic/[id].
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const { user, service } = auth;

  const video = await loadOwnedVideo(service, user.id, id);
  if (!video) return NOT_FOUND();
  const expectedScenes = realisticSceneCount(video.duration_seconds);
  if (
    !video.script ||
    video.script.scenes.length !== expectedScenes ||
    !video.scene_images ||
    video.scene_images.length !== expectedScenes
  ) {
    return NextResponse.json({ error: "Gere a prévia das cenas antes de animar." }, { status: 400 });
  }

  const { data: started, error } = await service
    .rpc("spend_realistic_credit", { p_video_id: id, p_user_id: user.id })
    .single<RealisticVideoRow>();
  if (error || !started) {
    const parsed = parseRealisticDbError(error?.message ?? "Não foi possível iniciar a geração.");
    const status =
      parsed.code === "no_realistic_credits" ? 402 : parsed.code === "too_many_in_progress" ? 429 : parsed.code ? 409 : 500;
    return NextResponse.json(
      { error: parsed.code ? `${parsed.code}: ${parsed.message}` : parsed.message },
      { status },
    );
  }

  startRealisticGeneration(service, started.id, new URL(request.url).origin);

  return NextResponse.json(mapRealisticRow(started));
}
