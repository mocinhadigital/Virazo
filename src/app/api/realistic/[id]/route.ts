import { after, NextResponse } from "next/server";
import { authenticate, loadOwnedVideo, NOT_FOUND } from "@/lib/realistic/api";
import { mapRealisticRow } from "@/lib/realistic/row";
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

// Passo 5: o cliente edita o texto do roteiro (de graça). Só as narrações
// mudam; as descrições das imagens e dos movimentos continuam as mesmas.
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

  const script = {
    ...video.script,
    title: typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 120) : video.script.title,
    scenes: video.script.scenes.map((scene, i) => ({ ...scene, narration: (narrations[i] as string).trim() })),
  };

  const { data, error } = await service
    .from("realistic_videos")
    .update({ script, title: script.title })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Não foi possível salvar o roteiro." }, { status: 500 });
  }
  return NextResponse.json(mapRealisticRow(data));
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
