import { NextResponse } from "next/server";
import { after } from "next/server";
import { authenticate, getRealisticCredits } from "@/lib/realistic/api";
import { advanceRealisticVideo, isStalled } from "@/lib/realistic/advance";
import { generateRealisticScript } from "@/lib/realistic/script";
import { extractErrorMessage } from "@/lib/realistic/pipeline";
import { mapRealisticRow, type RealisticVideoRow } from "@/lib/realistic/row";
import {
  DEFAULT_REALISTIC_STYLE,
  isRealisticDuration,
  isRealisticStyle,
  realisticCreditCost,
  realisticSceneCount,
  type RealisticLanguage,
} from "@/lib/realistic/constants";

export const runtime = "nodejs";
export const maxDuration = 120;

// Rascunhos novos por dia por usuário. Cada rascunho custa roteiro + imagens
// (sem gastar crédito), então há um teto para o custo não ficar aberto.
const MAX_DRAFTS_PER_DAY = 25;

type CreateBody = {
  mode?: "guided" | "free";
  topic?: string;
  idea?: string;
  language?: RealisticLanguage;
  realisticStyle?: string;
  durationSeconds?: number;
  voice?: string;
  backgroundMusicId?: string | null;
  captionsEnabled?: boolean;
  captionStyle?: string | null;
};

// Lista os vídeos realistas do usuário (para a tela "Meus vídeos").
export async function GET(request: Request) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const { user, service } = auth;

  await service.rpc("expire_stale_realistic_videos", { p_user_id: user.id });

  const { data, error } = await service
    .from("realistic_videos")
    .select("*")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<RealisticVideoRow[]>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Retoma geração em etapas cuja corrente parou (ver advance.ts).
  const origin = new URL(request.url).origin;
  for (const row of data ?? []) {
    if (isStalled(row)) {
      after(async () => {
        await advanceRealisticVideo(service, row.id, origin);
      });
    }
  }

  return NextResponse.json({
    credits: await getRealisticCredits(service, user.id),
    videos: (data ?? []).map(mapRealisticRow),
  });
}

// Passos 2-5 do fluxo (guiado) / 1-3 (prompt livre): cria o rascunho e o
// roteiro. NÃO gasta crédito — o crédito só sai em /animate.
export async function POST(request: Request) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const { user, supabase, service } = auth;

  const body = (await request.json().catch(() => ({}))) as CreateBody;
  const mode = body.mode === "free" ? "free" : "guided";
  const request_ = (mode === "free" ? body.idea : body.topic)?.trim() ?? "";
  if (request_.length < 3) {
    return NextResponse.json(
      { error: mode === "free" ? "Escreva a sua ideia." : "Escreva o tema do vídeo." },
      { status: 400 },
    );
  }
  if (request_.length > 1200) {
    return NextResponse.json({ error: "O texto está muito longo." }, { status: 400 });
  }
  const language: RealisticLanguage = body.language && ["pt", "en", "es"].includes(body.language) ? body.language : "pt";
  const styleName =
    mode === "free" || !body.realisticStyle
      ? DEFAULT_REALISTIC_STYLE
      : isRealisticStyle(body.realisticStyle)
        ? body.realisticStyle
        : null;
  if (!styleName) {
    return NextResponse.json({ error: "Estilo realista inválido." }, { status: 400 });
  }

  const durationSeconds = isRealisticDuration(body.durationSeconds) ? body.durationSeconds : 30;
  const creditCost = realisticCreditCost(durationSeconds);

  // Sem créditos suficientes não há o que aprovar no final: avisa logo, antes de gastar IA.
  if ((await getRealisticCredits(service, user.id)) < creditCost) {
    return NextResponse.json(
      {
        error:
          creditCost > 1
            ? "no_realistic_credits: você precisa de 2 créditos para um vídeo de 60s. Compre mais para criar."
            : "no_realistic_credits: você não tem créditos realistas. Compre um pacote para criar.",
      },
      { status: 402 },
    );
  }

  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count: recentDrafts } = await service
    .from("realistic_videos")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", since);
  if ((recentDrafts ?? 0) >= MAX_DRAFTS_PER_DAY) {
    return NextResponse.json(
      { error: "Você criou muitos rascunhos hoje. Tente de novo amanhã ou conclua os que já começou." },
      { status: 429 },
    );
  }

  const musicId = body.backgroundMusicId || null;
  if (musicId) {
    // A segurança por linha de music_tracks já restringe a faixas prontas + as
    // do próprio usuário (consulta com a sessão dele, não a de serviço).
    const { count } = await supabase
      .from("music_tracks")
      .select("id", { count: "exact", head: true })
      .eq("id", musicId);
    if (count !== 1) return NextResponse.json({ error: "Música inválida." }, { status: 400 });
  }

  let script;
  try {
    script = await generateRealisticScript({
      request: request_,
      kind: mode === "free" ? "idea" : "topic",
      language,
      styleName,
      sceneCount: realisticSceneCount(durationSeconds),
    });
  } catch (err) {
    console.error("[/api/realistic] roteiro falhou:", err);
    return NextResponse.json({ error: extractErrorMessage(err) }, { status: 500 });
  }

  const { data, error } = await service
    .from("realistic_videos")
    .insert({
      user_id: user.id,
      mode,
      title: script.title || request_.slice(0, 80),
      topic: request_,
      language,
      realistic_style: styleName,
      duration_seconds: durationSeconds,
      credit_cost: creditCost,
      voice: body.voice?.trim() || null,
      captions_enabled: body.captionsEnabled !== false,
      caption_style: body.captionsEnabled === false ? null : (body.captionStyle ?? null),
      background_music_id: musicId,
      script,
      script_generations: 1,
    })
    .select("*")
    .single<RealisticVideoRow>();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Não foi possível criar o rascunho." }, { status: 500 });
  }
  return NextResponse.json(mapRealisticRow(data));
}
