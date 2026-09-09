import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { generateScript } from "@/lib/ai/script";
import { renderFinalVideo } from "@/lib/video/render";
import { buildRenderScenes } from "@/lib/video/scenePipeline";
import type { VideoRow } from "@/components/dashboard/videoMapping";

// Reprocessa um vídeo que falhou, no MESMO registro (mesmo id) — nunca cria
// uma linha nova em `videos`. Espelha a mesma sequência de
// /api/videos/generate/route.ts (que continua intocado), só trocando a
// etapa 1 (criar linha nova) por um UPDATE atômico no registro existente
// (retry_video), que também serve de trava contra retry duplicado/paralelo:
// só afeta a linha se ela ainda estiver com status = 'Erro'. Retry não
// consome nenhuma vaga nova do limite diário — a vaga já tinha sido
// reservada na criação original (reserve_daily_video_slot); a falha nunca
// chegou a "gastar" a cota do dia (só sucesso gasta), então reprocessar o
// mesmo registro não deveria contar de novo.
export const runtime = "nodejs";
export const maxDuration = 300;

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

type FailedVideoRow = VideoRow & {
  series_id: string | null;
  background_music_id: string | null;
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: videoId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  // 0. Confere que o vídeo é do usuário e está realmente com falha antes de
  // gastar uma chamada de RPC — a trava de verdade (atômica) é a própria
  // função abaixo, isto aqui só evita uma mensagem genérica quando o vídeo
  // nem existe/não é do usuário.
  const { data: existing } = await supabase
    .from("videos")
    .select("id, status, user_id, series_id, background_music_id")
    .eq("id", videoId)
    .maybeSingle<{ id: string; status: string; user_id: string; series_id: string | null; background_music_id: string | null }>();

  if (!existing || existing.user_id !== user.id) {
    return NextResponse.json({ error: "Vídeo não encontrado." }, { status: 404 });
  }
  if (existing.status !== "Erro") {
    return NextResponse.json(
      { error: "Este vídeo não está com status de falha (já está gerando ou pronto)." },
      { status: 409 },
    );
  }

  // 1. Vira o MESMO registro pra 'Processando' (sem cobrar crédito — retry é
  // gratuito) — atômico: se outra chamada já tiver feito isso primeiro, esta
  // retorna null e paramos aqui sem duplicar geração.
  const { data: retried, error: retryError } = await supabase
    .rpc("retry_video", { p_video_id: videoId })
    .single()
    .returns<FailedVideoRow>();

  if (retryError || !retried) {
    return NextResponse.json(
      { error: retryError?.message ?? "Não foi possível reiniciar a geração (talvez já esteja em andamento)." },
      { status: 409 },
    );
  }

  // Idioma só existe na série (vídeos manuais não têm esse campo) — só
  // busca se o vídeo pertence a uma série, sem alterar nada nela.
  let idioma: "pt" | "en" | "es" | undefined;
  let backgroundMusic: Buffer | undefined;

  try {
    if (retried.series_id) {
      const { data: series } = await supabase
        .from("series")
        .select("idioma")
        .eq("id", retried.series_id)
        .maybeSingle<{ idioma: "pt" | "en" | "es" }>();
      idioma = series?.idioma;
    }

    if (retried.background_music_id) {
      const { data: track } = await supabase
        .from("music_tracks")
        .select("storage_path")
        .eq("id", retried.background_music_id)
        .maybeSingle<{ storage_path: string }>();
      if (track) {
        const { data: musicBlob } = await supabase.storage.from("music").download(track.storage_path);
        if (musicBlob) backgroundMusic = Buffer.from(await musicBlob.arrayBuffer());
      }
    }

    // 2. Roteiro — mesmo título/tópico/estilo/duração já salvos no registro.
    const script = await generateScript({
      topic: retried.topic,
      contentStyle: retried.style,
      visualStyle: retried.visual_style ?? "Realista",
      duration: retried.duration,
      language: idioma,
    });

    // 3. Narração (1 chamada TTS por vez — ver scenePipeline.ts) + legenda
    // (por cena) + imagem (fal.ai, em paralelo) — mesma voz.
    const renderScenes = await buildRenderScenes(
      script,
      retried.voice ?? "",
      retried.visual_style ?? "Realista",
      idioma,
    );

    // 4. Monta o vídeo final — mesma legenda ligada/desligada, mesma música.
    const finalVideo = await renderFinalVideo(
      renderScenes,
      retried.captions_enabled,
      retried.caption_style,
      backgroundMusic,
    );
    const thumbnail = renderScenes[0]?.image;

    // 5. Sobe pro Storage, sobrescrevendo o arquivo antigo (mesmo video_id).
    const videoPath = `${user.id}/${retried.id}.mp4`;
    const { error: uploadVideoError } = await supabase.storage
      .from("videos")
      .upload(videoPath, finalVideo, { contentType: "video/mp4", upsert: true });
    if (uploadVideoError) throw new Error(`Falha ao salvar o vídeo: ${uploadVideoError.message}`);

    let thumbnailUrl: string | null = null;
    if (thumbnail) {
      const thumbnailPath = `${user.id}/${retried.id}-thumb.jpg`;
      const { error: uploadThumbError } = await supabase.storage
        .from("videos")
        .upload(thumbnailPath, thumbnail, { contentType: "image/jpeg", upsert: true });
      if (!uploadThumbError) {
        thumbnailUrl = supabase.storage.from("videos").getPublicUrl(thumbnailPath).data.publicUrl;
      }
    }

    const videoUrl = supabase.storage.from("videos").getPublicUrl(videoPath).data.publicUrl;

    // 6. Marca como pronto — mesmo id do começo ao fim.
    const { data: ready, error: readyError } = await supabase
      .rpc("mark_video_ready", {
        p_video_id: retried.id,
        p_video_url: videoUrl,
        p_thumbnail_url: thumbnailUrl,
      })
      .single()
      .returns<VideoRow>();

    if (readyError || !ready) {
      throw new Error(readyError?.message ?? "Não foi possível finalizar o vídeo.");
    }

    if (retried.series_id) {
      await supabase.rpc("record_series_generation", {
        p_series_id: retried.series_id,
        p_video_id: retried.id,
        p_status: "sucesso",
        p_message: null,
      });
    }

    return NextResponse.json(ready);
  } catch (err) {
    console.error("[/api/videos/[id]/retry] falhou:", err);
    const message = extractErrorMessage(err);

    // Só marca 'Erro' com a mensagem — sem RPC nenhuma, já que não há
    // crédito ou vaga pra devolver (retry nunca consumiu uma vaga nova, ver
    // comentário no topo do arquivo).
    const { data: errored, error: markErrorError } = await supabase
      .from("videos")
      .update({ status: "Erro", error_message: message })
      .eq("id", retried.id)
      .eq("user_id", user.id)
      .select("*")
      .single()
      .returns<VideoRow>();

    if (markErrorError) {
      console.error("[/api/videos/[id]/retry] falha ao marcar erro:", markErrorError);
    }

    if (retried.series_id) {
      await supabase.rpc("record_series_generation", {
        p_series_id: retried.series_id,
        p_video_id: retried.id,
        p_status: "erro",
        p_message: message,
      });
    }

    return NextResponse.json(errored ?? { error: message }, { status: 500 });
  }
}
