import { NextResponse } from "next/server";
import { authenticate, loadOwnedVideo, NOT_FOUND } from "@/lib/realistic/api";
import { generateRealisticScript } from "@/lib/realistic/script";
import { extractErrorMessage } from "@/lib/realistic/pipeline";
import { mapRealisticRow } from "@/lib/realistic/row";
import { REALISTIC_MAX_SCRIPT_GENERATIONS, realisticSceneCount } from "@/lib/realistic/constants";

export const runtime = "nodejs";
export const maxDuration = 120;

// Passo 5: "pedir outro roteiro" — de graça (limitado por rascunho). As
// imagens da prévia pertenciam ao roteiro antigo, então são descartadas e
// geradas de novo no passo seguinte.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const { user, service } = auth;

  const video = await loadOwnedVideo(service, user.id, id);
  if (!video) return NOT_FOUND();
  if (video.status !== "Rascunho" && video.status !== "Erro") {
    return NextResponse.json({ error: "Este vídeo já está sendo gerado." }, { status: 409 });
  }
  if (video.script_generations >= REALISTIC_MAX_SCRIPT_GENERATIONS) {
    return NextResponse.json(
      { error: `Você já pediu ${REALISTIC_MAX_SCRIPT_GENERATIONS} roteiros para este vídeo. Edite o texto do roteiro atual.` },
      { status: 429 },
    );
  }

  let script;
  try {
    script = await generateRealisticScript({
      request: video.topic,
      kind: video.mode === "free" ? "idea" : "topic",
      language: video.language,
      styleName: video.realistic_style,
      sceneCount: realisticSceneCount(video.duration_seconds),
      extra: "Escreva uma versão DIFERENTE das anteriores: outro gancho, outro ângulo e outras cenas.",
    });
  } catch (err) {
    console.error("[/api/realistic/script] falhou:", err);
    return NextResponse.json({ error: extractErrorMessage(err) }, { status: 500 });
  }

  // As imagens refeitas por edição de texto continuam contando ao pedir outro
  // roteiro (senão o limite voltaria a zero a cada roteiro novo).
  script = { ...script, imageEditsUsed: video.script?.imageEditsUsed ?? 0 };

  const { data, error } = await service
    .from("realistic_videos")
    .update({
      script,
      title: script.title,
      scene_images: null,
      swaps_used: 0,
      script_generations: video.script_generations + 1,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("script_generations", video.script_generations)
    .select("*")
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Tente de novo em instantes." }, { status: 409 });
  }
  return NextResponse.json(mapRealisticRow(data));
}
