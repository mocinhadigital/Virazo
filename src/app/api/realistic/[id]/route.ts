import { after, NextResponse } from "next/server";
import { authenticate, loadOwnedVideo, NOT_FOUND } from "@/lib/realistic/api";
import { mapRealisticRow } from "@/lib/realistic/row";
import { extractErrorMessage, regenerateSceneImages } from "@/lib/realistic/pipeline";
import { rewriteSceneVisuals } from "@/lib/realistic/script";
import { realisticMaxImageEdits } from "@/lib/realistic/constants";
import { advanceRealisticVideo, isStalled } from "@/lib/realistic/advance";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// Estado atual do vídeo (a tela consulta enquanto ele está "Gerando").
export const maxDuration = 300;

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const { user, service } = auth;

  // Geração travada há mais de 10 min vira "Erro" e o crédito volta.
  await service.rpc("expire_stale_realistic_videos", { p_user_id: user.id });

  const video = await loadOwnedVideo(service, user.id, id);
  if (!video) return NOT_FOUND();

  // Se a corrente de etapas parou (ninguém renova a trava), retoma daqui.
  if (isStalled(video)) {
    const origin = new URL(request.url).origin;
    after(async () => {
      await advanceRealisticVideo(service, id, origin);
    });
  }
  return NextResponse.json(mapRealisticRow(video));
}

// Passo 5: o cliente edita o texto do roteiro (de graça). Para cada cena cujo
// texto mudou, a descrição da imagem/movimento é reescrita para combinar com o
// novo texto; se as imagens já existem, a imagem dessa cena é refeita (grátis,
// até 6 por vídeo de 30s e 12 por vídeo de 60s, separado das 3 trocas). Tudo ou
// nada: se algo falha, nada é salvo e nenhuma tentativa é gasta.
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const { user, service } = auth;

  const body = (await request.json().catch(() => ({}))) as { narrations?: unknown; title?: unknown };
  const video = await loadOwnedVideo(service, user.id, id);
  if (!video || !video.script) return NOT_FOUND();
  if (video.status !== "Rascunho" && video.status !== "Erro") {
    return NextResponse.json({ error: "Este vídeo já está sendo gerado." }, { status: 409 });
  }

  const narrations = body.narrations;
  if (
    !Array.isArray(narrations) ||
    narrations.length !== video.script.scenes.length ||
    narrations.some((n) => typeof n !== "string" || n.trim().length === 0 || n.length > 240)
  ) {
    return NextResponse.json(
      { error: `Cada uma das ${video.script.scenes.length} cenas precisa de um texto (até 240 caracteres).` },
      { status: 400 },
    );
  }

  const texts = (narrations as string[]).map((n) => n.trim());
  const changed = texts.map((t, i) => i).filter((i) => texts[i] !== video.script!.scenes[i].narration);

  try {
    let scenes = video.script.scenes.map((scene, i) => ({ ...scene, narration: texts[i] }));
    const base = { ...video.script, scenes };

    // Descrição visual nova só das cenas cujo texto mudou.
    const rewritten = await Promise.all(
      changed.map((i) =>
        rewriteSceneVisuals({ script: base, index: i, narration: texts[i], styleName: video.realistic_style }),
      ),
    );
    scenes = scenes.map((scene, i) => {
      const k = changed.indexOf(i);
      return k >= 0 ? { ...scene, ...rewritten[k] } : scene;
    });
    let script = {
      ...video.script,
      title: typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 120) : video.script.title,
      scenes,
    };

    // Imagens já criadas: refaz as das cenas editadas, dentro do limite.
    let images = video.scene_images;
    let skipped = 0;
    if (images && images.length === scenes.length && changed.length > 0) {
      const used = script.imageEditsUsed ?? 0;
      const left = Math.max(0, realisticMaxImageEdits(video.duration_seconds) - used);
      const toRedo = changed.slice(0, left);
      skipped = changed.length - toRedo.length;
      if (toRedo.length > 0) {
        images = await regenerateSceneImages(service, video, script, toRedo, images);
        script = { ...script, imageEditsUsed: used + toRedo.length };
      }
    }

    const { data, error } = await service
      .from("realistic_videos")
      .update({ script, title: script.title, ...(images !== video.scene_images ? { scene_images: images } : {}) })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Não foi possível salvar o roteiro.");
    return NextResponse.json({ ...mapRealisticRow(data), imageEditsSkipped: skipped });
  } catch (err) {
    console.error("[/api/realistic PATCH] falhou:", err);
    return NextResponse.json({ error: extractErrorMessage(err) }, { status: 500 });
  }
}

// "Excluir" só esconde o vídeo da tela (não se exclui vídeo gerando).
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const { supabase } = auth;

  const { data, error } = await supabase.rpc("delete_my_realistic_video", { p_video_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) {
    return NextResponse.json({ error: "Vídeo não encontrado ou ainda sendo gerado." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
