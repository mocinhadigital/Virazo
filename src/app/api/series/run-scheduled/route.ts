import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import type { SeriesRow } from "@/components/dashboard/seriesMapping";
import { checkConcurrencyLimit, runSeriesGeneration } from "@/lib/series/generate";
import { checkGenerationGate } from "@/lib/series/gate";
import { GENERATION_TIME_BUDGET_MS } from "@/lib/video/generateAssets";
import { runRealisticSeriesGeneration } from "@/lib/realistic/pipeline";

// Agendador das séries, chamado a cada poucos minutos pelo Vercel Cron (vercel.json).
// A Vercel manda `Authorization: Bearer <CRON_SECRET>` (GET). Também aceita POST com o
// cabeçalho antigo `x-cron-secret` (SERIES_CRON_SECRET) ou o mesmo Bearer, para chamada
// manual. Não há sessão de usuário (máquina-a-máquina), por isso usa o cliente service-role.
//
// REGRAS DE SEGURANÇA (para não gerar tudo de uma vez nem gastar à toa):
//  - Chave de desligar: só trabalha com SERIES_SCHEDULER_ENABLED=true; sem ela responde
//    "desligado" e não toca em nenhuma série.
//  - Sem recuperar dias perdidos: série atrasada além da tolerância (6h) pula direto para o
//    próximo horário normal dela, sem gerar episódio (reschedule_stale_series, migration 0044).
//  - Fila aos poucos: no máximo MAX_GENERATIONS_PER_RUN episódios por execução, do mais
//    antigo para o mais novo (empate: quem gerou há mais tempo vai primeiro).
//  - Limite diário respeitado ANTES de tentar: cliente sem plano ou sem vídeos disponíveis no
//    dia é adiado para o próximo horário normal, em silêncio (sem erro, sem consumir nada).
export const runtime = "nodejs";
export const maxDuration = 300;

// Tempo mínimo restante para começar a gerar mais uma série nesta invocação.
const MIN_TIME_TO_START_SERIES_MS = 150_000;
// Episódio de série realista leva mais (animação das 6 cenas): precisa de mais folga.
// (só roteiro e imagens; a animação segue em etapas, fora desta chamada).
const MIN_TIME_TO_START_REALISTIC_SERIES_MS = 90_000;

const MAX_GENERATIONS_PER_RUN = 4;
// Quantas séries vencidas olhamos por execução (a conferência de limite é barata, a geração não).
const MAX_DUE_CHECKED_PER_RUN = 80;
// Série vencida há mais que isto pula para o próximo horário normal, sem gerar.
const STALE_GRACE_HOURS = 6;

function secretsMatch(received: string, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const a = createHash("sha256").update(received).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (secretsMatch(bearer, process.env.CRON_SECRET)) return true;
  return secretsMatch(request.headers.get("x-cron-secret") ?? "", process.env.SERIES_CRON_SECRET);
}

async function handle(request: Request) {
  const startedAt = Date.now();

  if (!process.env.CRON_SECRET && !process.env.SERIES_CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET não configurado — automação desativada." }, { status: 503 });
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (process.env.SERIES_SCHEDULER_ENABLED?.trim().toLowerCase() !== "true") {
    return NextResponse.json({ skipped: "Agendador de séries desligado (SERIES_SCHEDULER_ENABLED)." });
  }

  const url = new URL(request.url);
  // Só para testes controlados: limita tudo a estes usuários (nunca mexe nos demais).
  const onlyUsers = (url.searchParams.get("only_users") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s));
  const userFilter = onlyUsers.length > 0 ? onlyUsers : null;

  const supabase = createServiceRoleClient();
  // Prazo da invocação INTEIRA: as séries vencidas são geradas uma depois
  // da outra dentro destes mesmos 300s.
  const deadline = startedAt + GENERATION_TIME_BUDGET_MS;

  // Rede de segurança: vídeo de qualquer usuário em "Gerando" há mais de 10
  // minutos vira "Falhou" (ver migration 0025).
  const { error: expireError } = await supabase.rpc("expire_stale_videos");
  if (expireError) console.error("[run-scheduled] expire_stale_videos falhou:", expireError.message);
  // Idem para vídeos realistas travados (o crédito volta).
  const { error: expireRealisticError } = await supabase.rpc("expire_stale_realistic_videos");
  if (expireRealisticError) {
    console.error("[run-scheduled] expire_stale_realistic_videos falhou:", expireRealisticError.message);
  }

  // Séries atrasadas demais: vão para o próximo horário normal, SEM gerar os dias perdidos.
  const { data: staleCount, error: staleError } = await supabase.rpc("reschedule_stale_series", {
    p_grace_hours: STALE_GRACE_HOURS,
    p_user_ids: userFilter,
  });
  if (staleError) {
    // Sem esta função (migration 0044 não rodada) NÃO seguimos: seria gerar o atraso todo.
    console.error("[run-scheduled] reschedule_stale_series falhou:", staleError.message);
    return NextResponse.json({ error: "Reagendamento indisponível (migration 0044?): " + staleError.message }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const lockCutoff = new Date(Date.now() - 10 * 60_000).toISOString();
  let dueQuery = supabase
    .from("series")
    .select("*")
    .eq("status", "ativa")
    .lte("next_generation_at", nowIso)
    .or(`generation_locked_at.is.null,generation_locked_at.lt.${lockCutoff}`)
    .order("next_generation_at", { ascending: true })
    .order("last_generated_at", { ascending: true, nullsFirst: true })
    .limit(MAX_DUE_CHECKED_PER_RUN);
  if (userFilter) dueQuery = dueQuery.in("user_id", userFilter);
  const { data: dueSeriesData, error: dueError } = await dueQuery;
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
  let attempts = 0;
  let deferredNoPlan = 0;
  let deferredLimit = 0;

  for (const series of dueSeries) {
    if (attempts >= MAX_GENERATIONS_PER_RUN) break;

    // Sem tempo para mais um vídeo inteiro: não começa. A série continua
    // vencida (next_generation_at não muda) e entra na próxima execução —
    // começar agora só produziria um vídeo cortado pelo limite da função.
    if (deadline - Date.now() < (series.realistic ? MIN_TIME_TO_START_REALISTIC_SERIES_MS : MIN_TIME_TO_START_SERIES_MS)) {
      results.push({ seriesId: series.id, ok: false, deferred: true, error: "Adiada para a próxima execução." });
      break;
    }

    // Série de vídeo normal: confere plano e limite do dia ANTES de tentar. Sem plano ou
    // sem vídeos disponíveis hoje = adia para o próximo horário normal, sem erro.
    if (!series.realistic) {
      const gate = await checkGenerationGate(series.user_id, series.duration);
      if (!gate.ok) {
        const { error: deferError } = await supabase.rpc("defer_series_to_next_slot", { p_series_id: series.id });
        if (deferError) console.error("[run-scheduled] defer_series_to_next_slot falhou:", deferError.message);
        if (gate.reason === "no_subscription") deferredNoPlan++;
        else deferredLimit++;
        continue;
      }
    }

    const concurrency = await checkConcurrencyLimit(supabase, series.user_id);
    if (!concurrency.ok) {
      results.push({ seriesId: series.id, ok: false, error: concurrency.error });
      continue;
    }

    attempts++;
    const result = series.realistic
      ? await runRealisticSeriesGeneration(supabase, series.user_id, series, url.origin)
      : await runSeriesGeneration(supabase, series.user_id, series, deadline, false); // false = sem bônus
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
    rescheduledStale: staleCount ?? 0,
    dueChecked: dueSeries.length,
    deferredNoPlan,
    deferredLimit,
    processed: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}

// Vercel Cron chama com GET.
export async function GET(request: Request) {
  return handle(request);
}

// Chamada manual (compatível com o formato antigo).
export async function POST(request: Request) {
  return handle(request);
}
