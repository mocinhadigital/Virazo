import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { isCaktoApiConfigured } from "@/lib/billing/caktoApi";
import { checkCaktoSubscriptions } from "@/lib/billing/caktoCron";

// Chamada pelo Vercel Cron (vercel.json, 1x por dia — limite do plano
// Hobby). A Vercel manda automaticamente `Authorization: Bearer
// <CRON_SECRET>` quando essa variável existe no projeto; sem ela a rota
// fica desligada.
export const runtime = "nodejs";
export const maxDuration = 300;

// Para de puxar assinaturas novas com folga antes do maxDuration, para as
// que estão em andamento terminarem e o resumo ser devolvido.
const TIME_BUDGET_MS = 240_000;

// Teto de consultas à Cakto por execução. A cota da Cakto é de 5.000
// req/hora por conta, dividida com a verificação feita pelos usuários
// (dashboard/"Já paguei") — por isso o padrão fica bem abaixo dela.
const DEFAULT_MAX_REQUESTS = 2000;
const HARD_MAX_REQUESTS = 4500;

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET não configurado — rotina desativada." }, { status: 503 });
  }

  const auth = request.headers.get("authorization") ?? "";
  const received = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (!secretsMatch(received, expected)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  if (!isCaktoApiConfigured()) {
    return NextResponse.json({ error: "CAKTO_CLIENT_ID/CAKTO_CLIENT_SECRET não configurados." }, { status: 503 });
  }

  const configured = Number(process.env.CAKTO_CRON_MAX_REQUESTS);
  const maxRequests = Math.min(
    Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_REQUESTS,
    HARD_MAX_REQUESTS,
  );

  try {
    const summary = await checkCaktoSubscriptions(createServiceRoleClient(), {
      maxRequests,
      deadline: Date.now() + TIME_BUDGET_MS,
    });
    console.log("[cron/cakto] resumo:", JSON.stringify(summary));
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[cron/cakto] falhou:", err);
    return NextResponse.json({ error: "Falha na checagem das assinaturas Cakto." }, { status: 500 });
  }
}

function secretsMatch(received: string, expected: string): boolean {
  if (!received) return false;
  const a = createHash("sha256").update(received).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
