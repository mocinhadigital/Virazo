import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createProgressReporter,
  generateVideoAssets,
  GENERATION_TIME_BUDGET_MS,
  withDeadline,
} from "@/lib/video/generateAssets";
import { effectiveDuration, isLongDuration } from "@/lib/video/durations";
import { userCanUseLongVideos } from "@/lib/billing/longVideos";
import { readStoredScript } from "@/lib/script/prepare";
import { loadBackgroundMusic } from "@/lib/video/music";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { areLongVideosEnabled } from "@/lib/video/featureFlags";
import type { VideoRow } from "@/components/dashboard/videoMapping";
import type { SeriesRow } from "@/components/dashboard/seriesMapping";
import { PLANS, DEFAULT_MAX_CONCURRENT_GENERATIONS } from "@/lib/billing/plans";
import { isAdminUserId } from "@/lib/admin/requireAdmin";
import { buildSeriesMemory, describeNicho, toPastEpisode } from "@/lib/series/memory";

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

  // Admin não tem limite diário (migration 0030) e pode não ter assinatura: sem
  // esta exceção ele caía em 0 gerações simultâneas e não conseguia gerar nada.
  // Vale o teto do maior plano.
  let maxConcurrent: number;
  if (activeSubscription) {
    maxConcurrent =
      PLANS[activeSubscription.plan as keyof typeof PLANS]?.maxConcurrentGenerations ??
      DEFAULT_MAX_CONCURRENT_GENERATIONS;
  } else if (await isAdminUserId(userId)) {
    maxConcurrent = PLANS.ultra.maxConcurrentGenerations;
  } else {
    // Sem plano ativo: a resposta certa é "assine um plano", não "seu plano permite até 0".
    return { ok: false, error: "no_subscription: assinatura ativa necessária para gerar vídeos." };
  }

  // Chave de serviço: quem "excluiu" um vídeo ainda em geração (ele só fica
  // escondido, migration 0034) continua contando aqui — senão dava para burlar a
  // trava de gerações simultâneas excluindo o vídeo em andamento.
  const { count: inProgressCount } = await createServiceRoleClient()
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

// Prepara o episódio da série: que episódio é este, a memória do que já foi contado
// e a instrução (tema) para escrever o roteiro. Usada tanto na geração do episódio
// quanto ao escrever o roteiro do PRÓXIMO episódio para o cliente editar (assim os
// dois usam exatamente a mesma instrução e a mesma memória).
export async function buildEpisodePlan(series: SeriesRow): Promise<{
  episodeNumber: number;
  seriesMemory: string;
  topic: string;
}> {
  // Memória da série: o que os episódios anteriores já contaram (roteiro
  // guardado em videos.script) e que episódio é este. Chave de serviço de
  // propósito: o cliente "excluir" um vídeo só o esconde (migration 0034), e um
  // episódio escondido continua sendo um episódio já contado.
  const { data: pastRows, count: pastCount } = await createServiceRoleClient()
    .from("videos")
    .select("title, script", { count: "exact" })
    .eq("series_id", series.id)
    .eq("status", "Pronto")
    .order("created_at", { ascending: false })
    .limit(6)
    .returns<{ title: string; script: unknown }[]>();
  const episodeNumber = (pastCount ?? pastRows?.length ?? 0) + 1;
  const seriesMemory = buildSeriesMemory({
    episodeNumber,
    past: (pastRows ?? []).map(toPastEpisode),
  });

  // BUG REAL em produção (confirmado direto no banco): uma série chamada
  // "A volta de jesus" com nicho "Medieval" gerou vídeos sobre peste
  // medieval — porque esta instrução usava SÓ o nicho, nunca o título da
  // série. O usuário digita o assunto de verdade no título ("Nome da
  // série"); o nicho é só a categoria/estética (igual a "estilo de
  // conteúdo"), nunca deveria substituir o assunto. Agora o título é o
  // ASSUNTO CENTRAL obrigatório, e o nicho vira só o "tom"/categoria
  // narrativa — mesma distinção tema vs. estilo do vídeo avulso.
  // O que já foi contado vai em `seriesMemory` (abaixo), não aqui: antes a
  // lista de "ângulos já usados" eram só títulos iguais ("série — data") e a IA
  // repetia o episódio. O nicho entra como categoria (curto) ou como ambientação
  // (longo) — ver describeNicho.
  const topic =
    episodeNumber > 1
      ? `O ASSUNTO CENTRAL E OBRIGATÓRIO de todos os vídeos desta série é: "${series.title}". Desenvolva um roteiro que aborde diretamente esse assunto — nunca troque por um assunto diferente. Explore um ângulo, momento ou aspecto específico e ainda não coberto dentro desse mesmo assunto. ${describeNicho(series.nicho)} Tom de voz ${series.tom_de_voz}.`
      : `O ASSUNTO CENTRAL E OBRIGATÓRIO deste vídeo é: "${series.title}". Desenvolva um roteiro que aborde diretamente esse assunto — nunca troque por um assunto diferente. Escolha um ângulo específico e interessante dentro desse mesmo assunto. ${describeNicho(series.nicho)} Tom de voz ${series.tom_de_voz}.`;

  return { episodeNumber, seriesMemory, topic };
}

export async function runSeriesGeneration(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string,
  series: SeriesRow,
  // Até quando a geração pode rodar. O padrão serve para uma invocação que
  // gera UM vídeo ("Gerar agora"); o agendador, que gera várias séries na
  // mesma invocação, passa o prazo da invocação inteira.
  deadline: number = Date.now() + GENERATION_TIME_BUDGET_MS,
): Promise<SeriesGenerationResult> {
  // Série configurada em 60s com a chave de vídeos longos desligada gera
  // em 30s (ver src/lib/video/durations.ts) — melhor que um vídeo que
  // estoura o tempo e falha.
  // 60s só para Pro/Ultra/admin (migration 0042): série em 60s de quem hoje é
  // Diário gera em 30s em vez de falhar.
  const longAllowed = isLongDuration(series.duration)
    ? await userCanUseLongVideos(createServiceRoleClient(), userId)
    : true;
  const duration = effectiveDuration(series.duration, areLongVideosEnabled(), longAllowed);

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

  // Memória da série + instrução do episódio (ver buildEpisodePlan).
  const { seriesMemory, topic } = await buildEpisodePlan(series);

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
      p_duration: duration,
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
    const backgroundMusic = await loadBackgroundMusic(supabase, chosenMusicId);

    // Roteiro do PRÓXIMO episódio que o cliente já escreveu/editou (series.next_script,
    // migration 0043): usado uma vez, no lugar do roteiro automático. Sem ele, ou se
    // não tiver o formato esperado, a série segue 100% automática como sempre.
    const nextStored = readStoredScript(
      (claimed as { next_script?: unknown }).next_script ?? series.next_script,
    );
    if (nextStored) {
      // Guarda já no vídeo: se a geração falhar, "Tentar de novo" reusa este roteiro.
      await createServiceRoleClient()
        .from("videos")
        .update({ script: { ...nextStored.script, source: nextStored.source }, script_locked: true })
        .eq("id", created.id);
    }

    const report = createProgressReporter(supabase, created.id, userId);

    // Roteiro → cenas → montagem → upload → pronto, contra o prazo da
    // invocação (ver GENERATION_TIME_BUDGET_MS em generateAssets.ts): se
    // estourar, cai no catch e o vídeo vira "Falhou" em vez de ficar
    // "Gerando" para sempre.
    const ready = await withDeadline(
      (async () => {
        const { finalVideo, thumbnail, script } = await generateVideoAssets({
          script: {
            topic,
            coreTheme: series.title,
            contentStyle: series.tom_de_voz,
            visualStyle: series.visual_style,
            duration,
            language: series.idioma,
            seriesMemory,
            isSeries: true,
          },
          scriptOverride: nextStored?.script,
          allowExtraScenes: nextStored ? nextStored.source === "ai" : true,
          voice: series.voice ?? "",
          visualStyle: series.visual_style,
          language: series.idioma,
          captionsEnabled: series.captions_enabled,
          captionStyle: series.caption_style,
          backgroundMusic,
          report,
          videoId: created.id,
        });

        // Guarda o roteiro: é a memória do próximo episódio. Falhar aqui não
        // derruba o vídeo (só o próximo episódio ficaria sem esta memória).
        const { error: saveScriptError } = await createServiceRoleClient()
          .from("videos")
          .update({ script: nextStored ? { ...script, source: nextStored.source } : script })
          .eq("id", created.id);
        if (saveScriptError) {
          console.warn("[series/generate] não foi possível guardar o roteiro:", saveScriptError.message);
        }

        await report("salvando");
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
        return ready;
      })(),
      deadline,
    );

    await supabase.rpc("record_series_generation", {
      p_series_id: series.id,
      p_video_id: created.id,
      p_status: "sucesso",
      p_message: null,
      p_user_id: userId,
    });

    // O roteiro guardado valeu para ESTE episódio; o próximo volta ao automático
    // (até o cliente escrever outro).
    if (nextStored) {
      await createServiceRoleClient().from("series").update({ next_script: null }).eq("id", series.id);
    }

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
