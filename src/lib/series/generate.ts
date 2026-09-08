import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateScript } from "@/lib/ai/script";
import { renderFinalVideo } from "@/lib/video/render";
import { buildRenderScenes } from "@/lib/video/scenePipeline";
import type { VideoRow } from "@/components/dashboard/videoMapping";
import type { SeriesRow } from "@/components/dashboard/seriesMapping";
import { PLANS, DEFAULT_MAX_CONCURRENT_GENERATIONS } from "@/lib/billing/plans";

// Núcleo da geração de um vídeo a partir de uma série. Recebe o cliente
// Supabase já pronto (o de cookies do usuário no disparo manual, ou o
// service-role no agendador rodando sem sessão) e o `userId` explícito, pra
// funcionar nos dois casos sem duplicar a lógica de novo. Espelha a
// sequência de /api/videos/generate/route.ts (que continua intocado) —
// mesmas libs de IA, mesma ordem de chamadas.
export type SeriesGenerationResult =
  | { ok: true; video: VideoRow }
  | { ok: false; error: string; video: VideoRow | null; alreadyInProgress?: boolean };

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

// Proteção técnica de concorrência — INDEPENDENTE do limite diário
// comercial (reserve_daily_video_slot). Impede que este usuário tenha mais
// de `maxConcurrentGenerations` vídeos rodando ao mesmo tempo, protegendo a
// carga simultânea sobre ElevenLabs e os demais providers de IA — mesmo
// que o limite diário do plano ainda não tenha sido atingido.
export async function checkConcurrencyLimit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: activeSubscription } = await supabase
    .from("subscriptions")
    .select("plan")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const maxConcurrent = activeSubscription
    ? (PLANS[activeSubscription.plan as keyof typeof PLANS]?.maxConcurrentGenerations ??
      DEFAULT_MAX_CONCURRENT_GENERATIONS)
    : DEFAULT_MAX_CONCURRENT_GENERATIONS;

  const { count: inProgressCount } = await supabase
    .from("videos")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "Processando");

  if ((inProgressCount ?? 0) >= maxConcurrent) {
    return {
      ok: false,
      error: `Você já tem ${inProgressCount} vídeo(s) sendo gerado(s) ao mesmo tempo — seu plano permite até ${maxConcurrent}. Aguarde um terminar antes de gerar outro.`,
    };
  }
  return { ok: true };
}

export async function runSeriesGeneration(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string,
  series: SeriesRow,
): Promise<SeriesGenerationResult> {
  // 0. Reivindica a série atomicamente ANTES de criar qualquer vídeo — a
  // trava de verdade contra dupla geração (cron, "Gerar agora", clique
  // duplicado). Se outra execução já detém o lock, paramos aqui sem criar
  // vídeo nem reservar vaga do limite diário.
  const { data: claimed, error: claimError } = await supabase
    .rpc("claim_series_for_generation", { p_series_id: series.id, p_user_id: userId })
    .single()
    .returns<SeriesRow>();

  if (claimError || !claimed) {
    return {
      ok: false,
      error: claimError?.message ?? "Esta série já está gerando um vídeo.",
      video: null,
      alreadyInProgress: true,
    };
  }

  const { data: recentVideos } = await supabase
    .from("videos")
    .select("title")
    .eq("series_id", series.id)
    .order("created_at", { ascending: false })
    .limit(5)
    .returns<{ title: string }[]>();

  const recentTitles = (recentVideos ?? []).map((v: { title: string }) => v.title);
  const topic =
    recentTitles.length > 0
      ? `Escolha um subtema específico e ainda não coberto dentro do nicho "${series.nicho}", com tom de voz ${series.tom_de_voz}. Não repita nem se aproxime demais destes títulos já usados nesta série: ${recentTitles.join("; ")}.`
      : `Escolha um subtema específico e interessante dentro do nicho "${series.nicho}", com tom de voz ${series.tom_de_voz}.`;

  // Sorteia uma das músicas de fundo selecionadas na série (se houver) —
  // uma faixa diferente por vídeo, igual ao comportamento do AutoShortz.
  const musicIds = series.background_music_ids ?? [];
  const chosenMusicId =
    musicIds.length > 0 ? musicIds[Math.floor(Math.random() * musicIds.length)] : null;

  // 1. Reserva atomicamente 1 vaga do limite diário do plano — rejeita sem
  // assinatura ativa ou se o limite de hoje já foi atingido, sem criar
  // vídeo nenhum nesses casos.
  const { data: created, error: createError } = await supabase
    .rpc("reserve_daily_video_slot", {
      p_title: `${series.title} — ${new Date().toLocaleDateString("pt-BR")}`,
      p_topic: topic,
      p_style: series.tom_de_voz,
      p_duration: series.duration,
      p_voice: series.voice,
      p_captions_enabled: series.captions_enabled,
      p_caption_style: series.caption_style,
      p_gradient: "from-orange-500 via-amber-500 to-rose-500",
      p_visual_style: series.visual_style,
      p_background_music_id: chosenMusicId,
      p_series_id: series.id,
      p_user_id: userId,
    })
    .single()
    .returns<VideoRow>();

  if (createError || !created) {
    // Libera o lock e reagenda — não há vídeo pra registrar no log.
    await supabase.rpc("record_series_generation", {
      p_series_id: series.id,
      p_video_id: null,
      p_status: "erro",
      p_message: createError?.message ?? "Não foi possível reservar a vaga de geração.",
      p_user_id: userId,
    });
    return {
      ok: false,
      error: createError?.message ?? "Não foi possível reservar a vaga de geração.",
      video: null,
    };
  }

  try {
    let backgroundMusic: Buffer | undefined;
    if (chosenMusicId) {
      const { data: track } = await supabase
        .from("music_tracks")
        .select("storage_path")
        .eq("id", chosenMusicId)
        .maybeSingle<{ storage_path: string }>();
      if (track) {
        const { data: musicBlob } = await supabase.storage.from("music").download(track.storage_path);
        if (musicBlob) backgroundMusic = Buffer.from(await musicBlob.arrayBuffer());
      }
    }

    const script = await generateScript({
      topic,
      contentStyle: series.tom_de_voz,
      visualStyle: series.visual_style,
      duration: series.duration,
      language: series.idioma,
    });

    const renderScenes = await buildRenderScenes(script, series.voice ?? "", series.visual_style, series.idioma);

    const finalVideo = await renderFinalVideo(renderScenes, series.captions_enabled, backgroundMusic);
    const thumbnail = renderScenes[0]?.image;

    const videoPath = `${userId}/${created.id}.mp4`;
    const { error: uploadVideoError } = await supabase.storage
      .from("videos")
      .upload(videoPath, finalVideo, { contentType: "video/mp4", upsert: true });
    if (uploadVideoError) throw new Error(`Falha ao salvar o vídeo: ${uploadVideoError.message}`);

    let thumbnailUrl: string | null = null;
    if (thumbnail) {
      const thumbnailPath = `${userId}/${created.id}-thumb.jpg`;
      const { error: uploadThumbError } = await supabase.storage
        .from("videos")
        .upload(thumbnailPath, thumbnail, { contentType: "image/jpeg", upsert: true });
      if (!uploadThumbError) {
        thumbnailUrl = supabase.storage.from("videos").getPublicUrl(thumbnailPath).data.publicUrl;
      }
    }

    const videoUrl = supabase.storage.from("videos").getPublicUrl(videoPath).data.publicUrl;

    const { data: ready, error: readyError } = await supabase
      .rpc("mark_video_ready", {
        p_video_id: created.id,
        p_video_url: videoUrl,
        p_thumbnail_url: thumbnailUrl,
        p_user_id: userId,
      })
      .single()
      .returns<VideoRow>();

    if (readyError || !ready) {
      throw new Error(readyError?.message ?? "Não foi possível finalizar o vídeo.");
    }

    await supabase.rpc("record_series_generation", {
      p_series_id: series.id,
      p_video_id: created.id,
      p_status: "sucesso",
      p_message: null,
      p_user_id: userId,
    });

    return { ok: true, video: ready };
  } catch (err) {
    console.error("[series/generate] falhou:", err);
    const message = extractErrorMessage(err);

    const { data: errored, error: failError } = await supabase
      .rpc("mark_video_failed", {
        p_video_id: created.id,
        p_message: message,
        p_user_id: userId,
      })
      .single()
      .returns<VideoRow>();

    if (failError) {
      console.error("[series/generate] mark_video_failed também falhou:", failError);
    }

    await supabase.rpc("record_series_generation", {
      p_series_id: series.id,
      p_video_id: created.id,
      p_status: "erro",
      p_message: message,
      p_user_id: userId,
    });

    return { ok: false, error: message, video: errored ?? null };
  }
}
