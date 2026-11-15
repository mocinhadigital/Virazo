import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { generateScript } from "@/lib/ai/script";
import { canRequestScripts, claimScriptRequest } from "@/lib/script/access";
import { SCRIPT_WORD_LIMITS } from "@/lib/script/limits";
import { isLongDuration } from "@/lib/video/durations";
import { areLongVideosEnabled } from "@/lib/video/featureFlags";
import { LONG_VIDEO_NOT_ALLOWED_MESSAGE, userCanUseLongVideos } from "@/lib/billing/longVideos";

// Roteiro de um vídeo normal ANTES de gerar o vídeo ("Refazer roteiro" também vem
// aqui). Escrever, editar e refazer NÃO gasta o limite de vídeos do plano: nada é
// reservado aqui (a vaga só é reservada em /api/videos/generate, no clique final).
// Só gasta um pouco de IA — por isso há um teto de pedidos por dia por conta.
export const runtime = "nodejs";
export const maxDuration = 120;

type Body = { topic?: string; style?: string; visualStyle?: string | null; duration?: string };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Body;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const topic = body.topic?.trim() ?? "";
  const duration = body.duration ?? "";
  if (!topic) return NextResponse.json({ error: "Escreva o tema do vídeo." }, { status: 400 });
  if (topic.length > 2000) return NextResponse.json({ error: "O tema está muito longo." }, { status: 400 });
  if (!SCRIPT_WORD_LIMITS[duration]) return NextResponse.json({ error: "Duração inválida." }, { status: 400 });

  if (isLongDuration(duration)) {
    if (!areLongVideosEnabled()) {
      return NextResponse.json(
        { error: "Vídeos de 60 segundos ou mais estão temporariamente indisponíveis. Escolha 30 segundos." },
        { status: 400 },
      );
    }
    if (!(await userCanUseLongVideos(supabase, user.id))) {
      return NextResponse.json({ error: LONG_VIDEO_NOT_ALLOWED_MESSAGE }, { status: 403 });
    }
  }

  if (!(await canRequestScripts(supabase, user.id))) {
    return NextResponse.json(
      { error: "no_subscription: assinatura ativa necessária para gerar vídeos." },
      { status: 402 },
    );
  }
  const claim = await claimScriptRequest(user.id, "video");
  if (!claim.ok) return NextResponse.json({ error: claim.error }, { status: 429 });

  try {
    const script = await generateScript({
      topic,
      coreTheme: topic,
      contentStyle: body.style?.trim() || "Personalizado",
      visualStyle: body.visualStyle ?? "Realista",
      duration,
    });
    return NextResponse.json({
      title: script.title,
      scenes: script.scenes.map((s) => ({ narration: s.narration, imagePrompt: s.imagePrompt })),
    });
  } catch (err) {
    console.error("[/api/videos/script] falhou:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Não foi possível escrever o roteiro. Tente de novo." },
      { status: 500 },
    );
  }
}
