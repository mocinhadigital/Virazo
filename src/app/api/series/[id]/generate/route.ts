import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import type { SeriesRow } from "@/components/dashboard/seriesMapping";
import { checkConcurrencyLimit, runSeriesGeneration } from "@/lib/series/generate";

// Disparo manual ("Gerar agora") de um vídeo a partir de uma série já
// cadastrada. A lógica de geração em si vive em src/lib/series/generate.ts
// (compartilhada com o futuro agendador automático) e espelha, sem alterar,
// a mesma sequência de chamadas às libs de IA usada por
// /api/videos/generate/route.ts.
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: seriesId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data: seriesData, error: seriesError } = await supabase
    .from("series")
    .select("*")
    .eq("id", seriesId)
    .eq("user_id", user.id)
    .maybeSingle();
  const series = seriesData as SeriesRow | null;

  if (seriesError || !series) {
    return NextResponse.json({ error: "Série não encontrada." }, { status: 404 });
  }

  if (series.status === "arquivada") {
    return NextResponse.json({ error: "Esta série está arquivada." }, { status: 400 });
  }

  const concurrency = await checkConcurrencyLimit(supabase, user.id);
  if (!concurrency.ok) {
    return NextResponse.json({ error: concurrency.error }, { status: 429 });
  }

  const result = await runSeriesGeneration(supabase, user.id, series);

  if (!result.ok) {
    return NextResponse.json(result.video ?? { error: result.error }, { status: 500 });
  }

  return NextResponse.json(result.video);
}
