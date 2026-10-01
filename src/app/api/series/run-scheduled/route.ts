import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import type { SeriesRow } from "@/components/dashboard/seriesMapping";
import { checkConcurrencyLimit, runSeriesGeneration } from "@/lib/series/generate";
import { GENERATION_TIME_BUDGET_MS } from "@/lib/video/generateAssets";

// Endpoint interno pra um agendador externo (Vercel Cron, Supabase Cron,
// etc.) disparar todas as séries ativas com `next_generation_at` vencido.
// Não há sessão de usuário aqui (é uma chamada máquina-a-máquina), por isso
// — e só por isso — usamos o cliente service-role, do mesmo jeito que o
// webhook da Stripe já faz. Protegido por um segredo compartilhado; sem ele,
// qualquer um poderia disparar geração de vídeo (e gastar a vaga do limite
// diário) de qualquer usuário.
//
// IMPORTANTE: isso só funciona de verdade com o app publicado numa URL
// pública que o agendador consiga chamar — em `localhost` (dev local) não
// há nada rodando esse cron automaticamente ainda. Ver relatório da ETAPA 6.
export const runtime = "nodejs";
export const maxDuration = 300;

// Tempo mínimo restante para começar a gerar mais uma série nesta invocação.
const MIN_TIME_TO_START_SERIES_MS = 150_000;

export async function POST(request: Request) {
  const startedAt = Date.now();
  const secret = request.headers.get("x-cron-secret");
  const expected = process.env.SERIES_CRON_SECRET;

  if (!expected) {
    return NextResponse.json(
      { error: "SERIES_CRON_SECRET não configurado — automação desativada." },
      { status: 503 },
    );
  }
  if (secret !== expected) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  // Prazo da invocação INTEIRA: as séries vencidas são geradas uma depois
  // da outra dentro destes mesmos 300s.
  const deadline = startedAt + GENERATION_TIME_BUDGET_MS;

  // Rede de segurança: vídeo de qualquer usuário em "Gerando" há mais de 10
  // minutos vira "Falhou" (ver migration 0025).
  const { error: expireError } = await supabase.rpc("expire_stale_videos");
  if (expireError) console.error("[run-scheduled] expire_stale_videos falhou:", expireError.message);

  const { data: dueSeriesData, error: dueError } = await supabase
    .from("series")
    .select("*")
    .eq("status", "ativa")
    .lte("next_generation_at", new Date().toISOString());
  const dueSeries = (dueSeriesData ?? []) as SeriesRow[];

  if (dueError) {
    return NextResponse.json({ error: dueError.message }, { status: 500 });
  }

  const results: {
    seriesId: string;
    ok: boolean;
    error?: string;
    alreadyInProgress?: boolean;
    deferred?: boolean;
  }[] = [];

  for (const series of dueSeries) {
    // Sem tempo para mais um vídeo inteiro: não começa. A série continua
    // vencida (next_generation_at não muda) e entra na próxima execução —
    // começar agora só produziria um vídeo cortado pelo limite da função.
    if (deadline - Date.now() < MIN_TIME_TO_START_SERIES_MS) {
      results.push({ seriesId: series.id, ok: false, deferred: true, error: "Adiada para a próxima execução." });
      continue;
    }

    const concurrency = await checkConcurrencyLimit(supabase, series.user_id);
    if (!concurrency.ok) {
      results.push({ seriesId: series.id, ok: false, error: concurrency.error });
      continue;
    }

    const result = await runSeriesGeneration(supabase, series.user_id, series, deadline);
    results.push(
      result.ok
        ? { seriesId: series.id, ok: true }
        : {
            seriesId: series.id,
            ok: false,
            error: result.error,
            alreadyInProgress: result.alreadyInProgress,
          },
    );
  }

  return NextResponse.json({
    processed: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
