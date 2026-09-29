import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { processCaktoItem, type CaktoItem } from "@/lib/billing/caktoEvents";

export const runtime = "nodejs";

// Quais eventos ativam/desativam e como a idempotência funciona está em
// lib/billing/caktoEvents.ts — a mesma lógica é usada pela consulta ativa à
// API da Cakto (lib/billing/caktoSync.ts). Eventos que não mudam nada são
// só registrados em cakto_events e respondidos com 200.
export async function POST(request: Request) {
  const expectedSecret = process.env.CAKTO_WEBHOOK_SECRET;
  if (!expectedSecret) {
    console.error("[webhooks/cakto] CAKTO_WEBHOOK_SECRET não está definida.");
    return NextResponse.json({ error: "Webhook não configurado." }, { status: 500 });
  }

  let body: { secret?: unknown; event?: unknown; data?: unknown };
  try {
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  // A Cakto não assina a requisição: o segredo vem no próprio corpo.
  if (!body || typeof body !== "object" || !secretsMatch(body.secret, expectedSecret)) {
    return NextResponse.json({ error: "Segredo inválido." }, { status: 401 });
  }

  const event = typeof body.event === "string" ? body.event : "";
  // Webhook V2 pode mandar vários pedidos num único envio.
  const items = (Array.isArray(body.data) ? body.data : [body.data]).filter(
    (item): item is CaktoItem => !!item && typeof item === "object",
  );

  const supabase = createServiceRoleClient();

  try {
    for (const item of items) {
      await processCaktoItem(supabase, event, item);
    }
  } catch (err) {
    // Falha NOSSA (banco fora, RPC com erro) num evento que deveria ter
    // sido aplicado: 500 para a Cakto reenviar. A trava de idempotência
    // desse pedido já foi liberada em processCaktoItem, então o reenvio
    // reprocessa em vez de cair como duplicata — mesma lógica do webhook
    // do Stripe.
    console.error("[webhooks/cakto] falhou ao processar evento:", err);
    return NextResponse.json({ error: "Erro ao processar evento." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// Compara via hash para que strings de tamanhos diferentes também sejam
// comparadas em tempo constante (timingSafeEqual exige o mesmo tamanho).
function secretsMatch(received: unknown, expected: string): boolean {
  if (typeof received !== "string" || !received) return false;
  const a = createHash("sha256").update(received).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

