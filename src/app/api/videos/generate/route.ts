import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { generateScript } from "@/lib/ai/script";
import { renderFinalVideo } from "@/lib/video/render";
import { buildRenderScenes } from "@/lib/video/scenePipeline";
import type { VideoRow } from "@/components/dashboard/videoMapping";
import { checkConcurrencyLimit } from "@/lib/series/generate";

// Usa Node.js (não Edge) porque o pipeline chama child_process/fs (ffmpeg).
// maxDuration é só relevante em hosts serverless com limite de execução
// (ex.: Vercel) — em dev local (`next dev`) e num servidor Node normal não
// tem efeito.
export const runtime = "nodejs";
export const maxDuration = 300;

// As 4 APIs (Anthropic, fal.ai, ElevenLabs, Groq) empacotam o motivo real do
// erro dentro de `err.body` em formatos diferentes, e `err.message` costuma
// ser só um genérico tipo "Forbidden"/"Bad Request". Essa função tenta achar
// o texto útil antes de cair pro `.message` genérico.
function extractErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "body" in err) {
    const body = (err as { body?: unknown }).body;
    if (body && typeof body === "object" && "detail" in body) {
      const detail = (body as { detail?: unknown }).detail;
      if (typeof detail === "string") return detail;
      if (detail && typeof detail === "object" && "message" in detail) {
        const nested = (detail as { message?: unknown }).message;
        if (typeof nested === "string") return nested;
      }
    }
  }
  if (err instanceof Error) return err.message;
  return "Não foi possível gerar o vídeo.";
}

type GenerateVideoBody = {
  title: string;
  topic: string;
  style: string;
  visualStyle: string | null;
  duration: string;
  voice: string;
  captionsEnabled: boolean;
  captionStyle: string | null;
  gradient: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as GenerateVideoBody;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const visualStyle = body.visualStyle ?? "Realista";

  // 0. Proteção técnica de concorrência (independente do limite diário
  // comercial) — não deixa este usuário ter mais vídeos 'Processando' ao
  // mesmo tempo do que seu plano permite.
  const concurrency = await checkConcurrencyLimit(supabase, user.id);
  if (!concurrency.ok) {
    return NextResponse.json({ error: concurrency.error }, { status: 429 });
  }

  // 1. Reserva atomicamente 1 vaga do limite diário do plano ativo — rejeita
  // sem assinatura ativa ou se o limite de hoje já foi atingido, sem criar
  // vídeo nenhum nesses casos. A trava por usuário (advisory lock, dentro da
  // função) também protege contra clique duplo/requisições concorrentes.
  const { data: created, error: createError } = await supabase
    .rpc("reserve_daily_video_slot", {
      p_title: body.title,
      p_topic: body.topic,
      p_style: body.style,
      p_duration: body.duration,
      p_voice: body.voice,
      p_captions_enabled: body.captionsEnabled,
      p_caption_style: body.captionStyle,
      p_gradient: body.gradient,
      p_visual_style: visualStyle,
    })
    .single()
    .returns<VideoRow>();

  if (createError || !created) {
    return NextResponse.json(
      { error: createError?.message ?? "Não foi possível reservar a vaga de geração." },
      { status: 400 },
    );
  }

  try {
    // 2. Roteiro.
    const script = await generateScript({
      topic: body.topic,
      contentStyle: body.style,
      visualStyle,
      duration: body.duration,
    });

    // 3. Narração (1 chamada TTS por vez — ver scenePipeline.ts) + legenda
    // (por cena) + imagem (fal.ai, em paralelo).
    const renderScenes = await buildRenderScenes(script, body.voice, visualStyle);

    // 4. Monta o vídeo final.
    const finalVideo = await renderFinalVideo(renderScenes, body.captionsEnabled);
    const thumbnail = renderScenes[0]?.image;

    // 5. Sobe pro Storage.
    const videoPath = `${user.id}/${created.id}.mp4`;
    const { error: uploadVideoError } = await supabase.storage
      .from("videos")
      .upload(videoPath, finalVideo, { contentType: "video/mp4", upsert: true });
    if (uploadVideoError) throw new Error(`Falha ao salvar o vídeo: ${uploadVideoError.message}`);

    let thumbnailUrl: string | null = null;
    if (thumbnail) {
      const thumbnailPath = `${user.id}/${created.id}-thumb.jpg`;
      const { error: uploadThumbError } = await supabase.storage
        .from("videos")
        .upload(thumbnailPath, thumbnail, { contentType: "image/jpeg", upsert: true });
      if (!uploadThumbError) {
        thumbnailUrl = supabase.storage.from("videos").getPublicUrl(thumbnailPath).data.publicUrl;
      }
    }

    const videoUrl = supabase.storage.from("videos").getPublicUrl(videoPath).data.publicUrl;

    // 6. Marca como pronto.
    const { data: ready, error: readyError } = await supabase
      .rpc("mark_video_ready", {
        p_video_id: created.id,
        p_video_url: videoUrl,
        p_thumbnail_url: thumbnailUrl,
      })
      .single()
      .returns<VideoRow>();

    if (readyError || !ready) {
      throw new Error(readyError?.message ?? "Não foi possível finalizar o vídeo.");
    }

    return NextResponse.json(ready);
  } catch (err) {
    console.error("[/api/videos/generate] falhou:", err);
    const message = extractErrorMessage(err);

    const { data: errored, error: failError } = await supabase
      .rpc("mark_video_failed", {
        p_video_id: created.id,
        p_message: message,
      })
      .single()
      .returns<VideoRow>();

    if (failError) {
      console.error("[/api/videos/generate] mark_video_failed também falhou:", failError);
    }

    return NextResponse.json(errored ?? { error: message }, { status: 500 });
  }
}
