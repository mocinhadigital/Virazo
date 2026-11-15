import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  createProgressReporter,
  generateVideoAssets,
  GENERATION_TIME_BUDGET_MS,
  withDeadline,
} from "@/lib/video/generateAssets";
import { isLongDuration, OFFERED_LONG_DURATION } from "@/lib/video/durations";
import { areLongVideosEnabled } from "@/lib/video/featureFlags";
import type { VideoRow } from "@/components/dashboard/videoMapping";
import { checkConcurrencyLimit } from "@/lib/series/generate";
import { prepareApprovedScript, type ApprovedScript } from "@/lib/script/prepare";
import { claimScriptRequest } from "@/lib/script/access";
import { LONG_VIDEO_NOT_ALLOWED_MESSAGE, userCanUseLongVideos } from "@/lib/billing/longVideos";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

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
  // Roteiro que o cliente aprovou no passo "Roteiro" (editado, próprio ou o da IA).
  // Ausente = a IA escreve o roteiro aqui, como sempre.
  script?: unknown;
};

export async function POST(request: Request) {
  const startedAt = Date.now();
  const body = (await request.json()) as GenerateVideoBody;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  // Ver src/lib/video/durations.ts — recusado ANTES de reservar a vaga do
  // dia, então não gasta nada do usuário.
  // Com a chave ligada só o 60s passa (90s nunca é oferecido). Quem pode usar o
  // 60s (Pro/Ultra) e quantos vídeos ele gasta é decidido no banco, em
  // reserve_daily_video_slot (migration 0042).
  if (isLongDuration(body.duration) && (!areLongVideosEnabled() || body.duration !== OFFERED_LONG_DURATION)) {
    return NextResponse.json(
      { error: "Vídeos de 60 segundos ou mais estão temporariamente indisponíveis. Escolha 30 segundos." },
      { status: 400 },
    );
  }

  const visualStyle = body.visualStyle ?? "Realista";

  // 0. Proteção técnica de concorrência (independente do limite diário
  // comercial) — não deixa este usuário ter mais vídeos 'Processando' ao
  // mesmo tempo do que seu plano permite.
  const concurrency = await checkConcurrencyLimit(supabase, user.id);
  if (!concurrency.ok) {
    return NextResponse.json({ error: concurrency.error }, { status: 429 });
  }

  // Roteiro aprovado pelo cliente: conferido e com as descrições de imagem
  // refeitas nas cenas editadas ANTES de reservar a vaga — roteiro inválido ou
  // falha de IA aqui não gasta nada do limite do dia.
  let approved: ApprovedScript | null = null;
  if (body.script !== undefined && body.script !== null) {
    // 60s sem plano Pro/Ultra é recusado já aqui, antes de gastar IA com o roteiro.
    if (isLongDuration(body.duration) && !(await userCanUseLongVideos(supabase, user.id))) {
      return NextResponse.json({ error: LONG_VIDEO_NOT_ALLOWED_MESSAGE }, { status: 403 });
    }
    // Texto editado/próprio pede descrição de imagem nova à IA: conta no teto diário de pedidos.
    if (typeof (body.script as { text?: unknown }).text === "string") {
      const claim = await claimScriptRequest(user.id, "video");
      if (!claim.ok) return NextResponse.json({ error: claim.error }, { status: 429 });
    }
    const prepared = await prepareApprovedScript(body.script, body.duration, visualStyle, body.title || body.topic);
    if (!prepared.ok) return NextResponse.json({ error: prepared.error }, { status: 400 });
    approved = prepared.approved;
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
    const report = createProgressReporter(supabase, created.id);

    // Guarda o roteiro aprovado no vídeo: "Tentar de novo" reaproveita o mesmo
    // roteiro (com as edições do cliente) em vez de escrever outro.
    if (approved) {
      const { error: saveScriptError } = await createServiceRoleClient()
        .from("videos")
        .update({ script: approved.stored, script_locked: true })
        .eq("id", created.id);
      if (saveScriptError) {
        console.warn("[/api/videos/generate] não foi possível guardar o roteiro:", saveScriptError.message);
      }
    }

    // 2-6 correm contra o prazo de GENERATION_TIME_BUDGET_MS: se estourar,
    // cai no catch abaixo e o vídeo vira "Falhou" em vez de ficar
    // "Gerando" para sempre quando a Vercel encerra a função.
    const ready = await withDeadline(
      (async () => {
        // 2-4. Roteiro, narração + legenda + imagem por cena, montagem.
        const { finalVideo, thumbnail } = await generateVideoAssets({
          script: {
            topic: body.topic,
            coreTheme: body.topic,
            contentStyle: body.style,
            visualStyle,
            duration: body.duration,
          },
          scriptOverride: approved?.script,
          allowExtraScenes: approved ? approved.source === "ai" : true,
          voice: body.voice,
          visualStyle,
          captionsEnabled: body.captionsEnabled,
          captionStyle: body.captionStyle,
          report,
          videoId: created.id,
        });

        // 5. Sobe pro Storage.
        await report("salvando");
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
        return ready;
      })(),
      startedAt + GENERATION_TIME_BUDGET_MS,
    );

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
