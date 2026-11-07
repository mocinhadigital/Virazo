import { NextResponse } from "next/server";
import { authenticate, loadOwnedVideo, NOT_FOUND } from "@/lib/realistic/api";
import { extractErrorMessage, regenerateSceneImages } from "@/lib/realistic/pipeline";
import { rewriteSceneVisuals } from "@/lib/realistic/script";
import { mapRealisticRow } from "@/lib/realistic/row";
import { REALISTIC_MAX_IMAGE_SWAPS, type RealisticScript } from "@/lib/realistic/constants";

export const runtime = "nodejs";
export const maxDuration = 90;

// Passo 6: troca UMA das imagens por outra (de graça, até 3 trocas). A nova
// imagem parte do TEXTO ATUAL da cena e, se o cliente escreveu o que quer
// mudar, esse pedido entra na descrição. O personagem continua o mesmo.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const { user, service } = auth;

  const body = (await request.json().catch(() => ({}))) as { scene?: unknown; change?: unknown };
  const scene = body.scene;
  const change = typeof body.change === "string" ? body.change.trim().slice(0, 240) : "";

  const video = await loadOwnedVideo(service, user.id, id);
  if (!video || !video.script || !video.scene_images) return NOT_FOUND();
  if (typeof scene !== "number" || !Number.isInteger(scene) || scene < 0 || scene >= video.script.scenes.length) {
    return NextResponse.json({ error: "Cena inválida." }, { status: 400 });
  }
  if (video.status !== "Rascunho" && video.status !== "Erro") {
    return NextResponse.json({ error: "Este vídeo já está sendo gerado." }, { status: 409 });
  }
  if (video.swaps_used >= REALISTIC_MAX_IMAGE_SWAPS) {
    return NextResponse.json(
      { error: `Você já usou as ${REALISTIC_MAX_IMAGE_SWAPS} trocas de imagem gratuitas.` },
      { status: 429 },
    );
  }

  // Reserva a troca ANTES de gerar (comparação com o valor lido): dois
  // cliques ao mesmo tempo não passam do limite.
  const { data: reserved } = await service
    .from("realistic_videos")
    .update({ swaps_used: video.swaps_used + 1 })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("swaps_used", video.swaps_used)
    .select("id")
    .maybeSingle();
  if (!reserved) {
    return NextResponse.json({ error: "Aguarde a troca anterior terminar." }, { status: 409 });
  }

  try {
    let script: RealisticScript = video.script;
    // Com pedido do cliente, a descrição da cena é reescrita (texto atual +
    // pedido). Sem pedido, vale a descrição da cena, que já acompanha o texto.
    if (change) {
      const visuals = await rewriteSceneVisuals({
        script,
        index: scene,
        narration: script.scenes[scene].narration,
        styleName: video.realistic_style,
        instruction: change,
      });
      script = {
        ...script,
        scenes: script.scenes.map((s, i) => (i === scene ? { ...s, ...visuals } : s)),
      };
    }

    const images = await regenerateSceneImages(service, video, script, [scene], video.scene_images);
    const { data, error } = await service
      .from("realistic_videos")
      .update({ scene_images: images, script })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Não foi possível guardar a nova imagem.");
    return NextResponse.json(mapRealisticRow(data));
  } catch (err) {
    console.error("[/api/realistic/swap] falhou:", err);
    // A troca não aconteceu: devolve a tentativa gratuita.
    await service
      .from("realistic_videos")
      .update({ swaps_used: video.swaps_used })
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("swaps_used", video.swaps_used + 1);
    return NextResponse.json({ error: extractErrorMessage(err) }, { status: 500 });
  }
}
