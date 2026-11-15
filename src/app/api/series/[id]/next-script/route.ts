import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import type { SeriesRow } from "@/components/dashboard/seriesMapping";
import { generateScript } from "@/lib/ai/script";
import { buildEpisodePlan } from "@/lib/series/generate";
import { canRequestScripts, claimScriptRequest } from "@/lib/script/access";
import { prepareApprovedScript, readStoredScript } from "@/lib/script/prepare";
import { effectiveDuration, isLongDuration } from "@/lib/video/durations";
import { areLongVideosEnabled } from "@/lib/video/featureFlags";
import { userCanUseLongVideos } from "@/lib/billing/longVideos";

// Roteiro do PRÓXIMO episódio de uma série, para o cliente ver e editar antes de
// ele ser gerado. Nada aqui gasta vaga do limite do dia (a vaga é reservada quando
// o episódio é de fato gerado). Se o cliente nunca usar isto, a série continua
// 100% automática: o episódio escreve o próprio roteiro na hora de gerar.
//   GET    -> roteiro guardado (ou null)
//   POST   -> escreve (ou refaz) o roteiro do próximo episódio e guarda
//   PUT    -> guarda o roteiro editado pelo cliente
//   DELETE -> apaga o roteiro guardado (volta ao automático)
export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };
type SeriesWithLock = SeriesRow & { generation_locked_at?: string | null };

async function loadSeries(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) } as const;

  const { data } = await supabase.from("series").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  const series = data as SeriesWithLock | null;
  if (!series) return { error: NextResponse.json({ error: "Série não encontrada." }, { status: 404 }) } as const;
  if (series.realistic) {
    return {
      error: NextResponse.json({ error: "Séries de Vídeo Realista não têm este recurso." }, { status: 400 }),
    } as const;
  }
  if (series.status === "arquivada") {
    return { error: NextResponse.json({ error: "Esta série está arquivada." }, { status: 400 }) } as const;
  }
  return { supabase, user, series } as const;
}

// Episódio em geração agora (lock recente): editar o próximo roteiro nesse
// instante poderia ser apagado quando o episódio terminar.
function isGeneratingNow(series: SeriesWithLock): boolean {
  if (!series.generation_locked_at) return false;
  return Date.now() - new Date(series.generation_locked_at).getTime() < 10 * 60_000;
}

// Duração em que o episódio vai realmente sair (60s só com a chave ligada e plano Pro/Ultra).
async function episodeDuration(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  series: SeriesRow,
): Promise<string> {
  const longAllowed = isLongDuration(series.duration) ? await userCanUseLongVideos(supabase, userId) : true;
  return effectiveDuration(series.duration, areLongVideosEnabled(), longAllowed);
}

export async function GET(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const ctx = await loadSeries(id);
  if ("error" in ctx) return ctx.error;
  const stored = readStoredScript(ctx.series.next_script);
  return NextResponse.json({
    script: stored ? { ...stored.script, source: stored.source } : null,
    duration: await episodeDuration(ctx.supabase, ctx.user.id, ctx.series),
  });
}

export async function POST(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const ctx = await loadSeries(id);
  if ("error" in ctx) return ctx.error;
  const { supabase, user, series } = ctx;

  if (isGeneratingNow(series)) {
    return NextResponse.json(
      { error: "Esta série está gerando um episódio agora. Espere terminar para escrever o próximo roteiro." },
      { status: 409 },
    );
  }
  if (!(await canRequestScripts(supabase, user.id))) {
    return NextResponse.json({ error: "no_subscription: assinatura ativa necessária." }, { status: 402 });
  }
  const claim = await claimScriptRequest(user.id, "series");
  if (!claim.ok) return NextResponse.json({ error: claim.error }, { status: 429 });

  const duration = await episodeDuration(supabase, user.id, series);
  try {
    // Mesma instrução e mesma memória que o episódio usaria na hora de gerar.
    const { topic, seriesMemory } = await buildEpisodePlan(series);
    const script = await generateScript({
      topic,
      coreTheme: series.title,
      contentStyle: series.tom_de_voz,
      visualStyle: series.visual_style,
      duration,
      language: series.idioma,
      seriesMemory,
      isSeries: true,
    });
    const stored = {
      title: script.title,
      scenes: script.scenes.map((s) => ({ narration: s.narration, imagePrompt: s.imagePrompt })),
      source: "ai" as const,
    };
    const { error } = await createServiceRoleClient().from("series").update({ next_script: stored }).eq("id", series.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ script: stored, duration });
  } catch (err) {
    console.error("[/api/series/next-script] falhou:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Não foi possível escrever o roteiro. Tente de novo." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request, { params }: Ctx) {
  const { id } = await params;
  const ctx = await loadSeries(id);
  if ("error" in ctx) return ctx.error;
  const { supabase, user, series } = ctx;
  const body = (await request.json().catch(() => ({}))) as { script?: unknown };

  if (isGeneratingNow(series)) {
    return NextResponse.json(
      { error: "Esta série está gerando um episódio agora. Espere terminar para salvar o próximo roteiro." },
      { status: 409 },
    );
  }

  // Texto editado = divide em cenas e pede descrição de imagem nova à IA (teto diário).
  const edited =
    !!body.script && typeof body.script === "object" && typeof (body.script as { text?: unknown }).text === "string";
  if (edited) {
    const claim = await claimScriptRequest(user.id, "series");
    if (!claim.ok) return NextResponse.json({ error: claim.error }, { status: 429 });
  }

  const duration = await episodeDuration(supabase, user.id, series);
  try {
    // Confere o roteiro e refaz a descrição da imagem das cenas que o cliente
    // mudou (a imagem tem que acompanhar o texto novo).
    const prepared = await prepareApprovedScript(body.script, duration, series.visual_style, series.title);
    if (!prepared.ok) return NextResponse.json({ error: prepared.error }, { status: 400 });
    const { error } = await createServiceRoleClient()
      .from("series")
      .update({ next_script: prepared.approved.stored })
      .eq("id", series.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ script: prepared.approved.stored, duration });
  } catch (err) {
    console.error("[/api/series/next-script PUT] falhou:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Não foi possível salvar o roteiro. Tente de novo." },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const ctx = await loadSeries(id);
  if ("error" in ctx) return ctx.error;
  if (isGeneratingNow(ctx.series)) {
    return NextResponse.json({ error: "Esta série está gerando um episódio agora. Espere terminar." }, { status: 409 });
  }
  const { error } = await createServiceRoleClient().from("series").update({ next_script: null }).eq("id", ctx.series.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ script: null });
}
