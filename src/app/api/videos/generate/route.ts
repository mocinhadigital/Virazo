import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { generateScript } from "@/lib/ai/script";
import { synthesizeNarration } from "@/lib/ai/narration";
import { transcribeForCaptions } from "@/lib/ai/captions";
import { generateSceneImage } from "@/lib/ai/image";
import { renderFinalVideo, type RenderScene } from "@/lib/video/render";
import type { VideoRow } from "@/components/dashboard/videoMapping";
import { PLANS, DEFAULT_MAX_CONCURRENT_GENERATIONS } from "@/lib/billing/plans";

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

  // 0. Checa o limite de "séries simultâneas" do plano do usuário — não deixa
  // reservar crédito nem começar a gerar se ele já tem gerações em andamento
  // no limite do plano (ou 1, se não tiver assinatura ativa).
  const { data: activeSubscription } = await supabase
    .from("subscriptions")
    .select("plan, quantity")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const maxConcurrent = activeSubscription
    ? (PLANS[activeSubscription.plan as keyof typeof PLANS]?.maxConcurrentGenerations ??
      DEFAULT_MAX_CONCURRENT_GENERATIONS) * (activeSubscription.quantity ?? 1)
    : DEFAULT_MAX_CONCURRENT_GENERATIONS;

  const { count: inProgressCount } = await supabase
    .from("videos")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "Processando");

  if ((inProgressCount ?? 0) >= maxConcurrent) {
    return NextResponse.json(
      {
        error: `Você já tem ${inProgressCount} vídeo(s) sendo gerado(s) ao mesmo tempo — seu plano permite até ${maxConcurrent}. Aguarde um terminar antes de criar outro.`,
      },
      { status: 429 },
    );
  }

  // 1. Reserva o crédito e cria a linha com status='Processando'.
  const { data: created, error: createError } = await supabase
    .rpc("create_video_and_consume_credit", {
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
      { error: createError?.message ?? "Não foi possível reservar o crédito." },
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

    // 3. Narração + legenda (por cena) + imagem, em paralelo.
    const renderScenes: RenderScene[] = await Promise.all(
      script.scenes.map(async (scene) => {
        const [audio, image] = await Promise.all([
          synthesizeNarration(scene.narration, body.voice),
          generateSceneImage(scene.imagePrompt, visualStyle),
        ]);
        const transcript = await transcribeForCaptions(audio);
        return {
          image,
          audio,
          durationSeconds: transcript.durationSeconds,
          words: transcript.words,
        };
      }),
    );

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

    const { data: errored, error: refundError } = await supabase
      .rpc("refund_credit_and_mark_error", {
        p_video_id: created.id,
        p_message: message,
      })
      .single()
      .returns<VideoRow>();

    if (refundError) {
      console.error("[/api/videos/generate] refund_credit_and_mark_error também falhou:", refundError);
    }

    return NextResponse.json(errored ?? { error: message }, { status: 500 });
  }
}
