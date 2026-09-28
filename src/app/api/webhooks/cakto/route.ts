import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { findPlanKeyByCaktoProductId } from "@/lib/billing/cakto";
import type { PlanKey } from "@/lib/billing/plans";

export const runtime = "nodejs";

type Supabase = ReturnType<typeof createServiceRoleClient>;

// Eventos que mudam alguma coisa no Virazo. Qualquer outro (pix_gerado,
// checkout_abandonment...) só é registrado em cakto_events e respondido com
// 200.
//
// A Cakto manda purchase_approved E subscription_created com o MESMO data.id
// na compra inicial — os dois liberam o plano, mas a chave de idempotência
// (activationKey) é só o data.id, então quem chegar primeiro aplica e o
// outro cai como duplicata. Cada renovação chega com um data.id novo.
const ACTIVATE_EVENTS = new Set(["purchase_approved", "subscription_created", "subscription_renewed"]);
const DEACTIVATE_EVENTS = new Set(["subscription_canceled", "refund", "chargeback"]);

// Sem assinatura a Cakto não manda próxima cobrança; o plano vale um ciclo
// mensal a partir de agora. current_period_end só é exibido em
// Configurações — quem desliga o acesso é o status, não esta data.
const FALLBACK_PERIOD_MS = 31 * 24 * 60 * 60 * 1000;

type CaktoItem = Record<string, unknown>;

type Outcome = { status: "processed" | "pending_user" | "ignored"; message?: string };

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
      await handleItem(supabase, event, item);
    }
  } catch (err) {
    // Falha NOSSA (banco fora, RPC com erro) num evento que deveria ter
    // sido aplicado: 500 para a Cakto reenviar. A trava de idempotência
    // desse pedido já foi liberada em handleItem, então o reenvio
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

async function handleItem(supabase: Supabase, event: string, item: CaktoItem): Promise<void> {
  const orderId = str(item.id);
  const customer = item.customer as CaktoItem | undefined;
  const product = item.product as CaktoItem | undefined;
  const email = str(customer?.email)?.trim().toLowerCase();
  const productId = str(product?.id) ?? str(product?.short_id);
  const isActivate = ACTIVATE_EVENTS.has(event);
  const isDeactivate = DEACTIVATE_EVENTS.has(event);

  // Só UMA linha por idempotency_key pode ser marcada como processada
  // (índice único da migration 0022). Liberação de plano: só o data.id,
  // seja qual for o evento. Desativação: evento + data.id, como antes.
  const idempotencyKey = !orderId
    ? null
    : isActivate
      ? `activate:${orderId}`
      : isDeactivate
        ? `${event}:${orderId}`
        : null;

  // Registra TODA entrega, antes de qualquer decisão. O segredo não é
  // gravado — só evento e dados do pedido.
  const { data: logRow, error: logError } = await supabase
    .from("cakto_events")
    .insert({
      order_id: orderId,
      event: event || "(sem evento)",
      email,
      product_id: productId,
      idempotency_key: idempotencyKey,
      payload: { event, data: item },
    })
    .select("id")
    .single<{ id: number }>();

  if (logError || !logRow) {
    throw new Error(`falha ao registrar em cakto_events: ${logError?.message}`);
  }
  const logId = logRow.id;

  if (!isActivate && !isDeactivate) {
    await finishLog(supabase, logId, { status: "ignored" });
    return;
  }

  // Sem data.id não há como garantir que o evento não seja aplicado duas
  // vezes — melhor não aplicar e deixar registrado para conferência.
  if (!orderId) {
    await finishLog(supabase, logId, { status: "ignored", message: "payload sem data.id" });
    return;
  }

  const { data: claimed, error: claimError } = await supabase.rpc("try_claim_cakto_event", {
    p_event_row_id: logId,
  });
  if (claimError) {
    throw new Error(`try_claim_cakto_event falhou: ${claimError.message}`);
  }
  if (!claimed) {
    await finishLog(supabase, logId, { status: "duplicate" });
    return;
  }

  try {
    const outcome = isActivate
      ? await activate(supabase, logId, event, item, orderId, email, productId)
      : await deactivate(supabase, logId, event, item, orderId, email);
    await finishLog(supabase, logId, outcome);
  } catch (err) {
    // Devolve a trava para o reenvio da Cakto conseguir reprocessar.
    await supabase
      .from("cakto_events")
      .update({
        processed_at: null,
        status: "error",
        error_message: err instanceof Error ? err.message : String(err),
      })
      .eq("id", logId);
    throw err;
  }
}

async function activate(
  supabase: Supabase,
  logId: number,
  event: string,
  item: CaktoItem,
  orderId: string,
  email: string | undefined,
  productId: string | undefined,
): Promise<Outcome> {
  const plan: PlanKey | undefined = productId ? findPlanKeyByCaktoProductId(productId) : undefined;
  if (!plan) {
    return { status: "ignored", message: `produto ${productId ?? "(vazio)"} não corresponde a nenhum plano` };
  }
  if (!email) return { status: "ignored", message: "payload sem data.customer.email" };

  const subscriptionKey = caktoSubscriptionKey(item, orderId);
  const periodEnd = nextPaymentDate(item) ?? new Date(Date.now() + FALLBACK_PERIOD_MS).toISOString();
  const userId = await findUserId(supabase, email);

  if (!userId) {
    await savePending(supabase, {
      email,
      action: "activate",
      plan,
      subscription_key: subscriptionKey,
      current_period_end: periodEnd,
      order_id: orderId,
      event,
      cakto_event_id: logId,
    });
    return { status: "pending_user" };
  }

  // Mesma função usada pelo webhook do Stripe. stripe_customer_id fica
  // null de propósito: a rota de checkout do Stripe lê essa coluna.
  const { error } = await supabase.rpc("apply_subscription_plan", {
    p_user_id: userId,
    p_plan: plan,
    p_stripe_customer_id: null,
    p_stripe_subscription_id: subscriptionKey,
    p_status: "active",
    p_current_period_end: periodEnd,
  });
  if (error) throw new Error(`apply_subscription_plan (${event}) falhou: ${error.message}`);

  return { status: "processed" };
}

async function deactivate(
  supabase: Supabase,
  logId: number,
  event: string,
  item: CaktoItem,
  orderId: string,
  email: string | undefined,
): Promise<Outcome> {
  if (!email) return { status: "ignored", message: "payload sem data.customer.email" };

  const subscriptionKey = caktoSubscriptionKey(item, orderId);
  const userId = await findUserId(supabase, email);

  if (!userId) {
    // Guarda mesmo assim: se houver uma compra pendente deste e-mail, ela
    // será desfeita na ordem certa quando a conta for criada.
    await savePending(supabase, {
      email,
      action: "deactivate",
      plan: null,
      subscription_key: subscriptionKey,
      current_period_end: null,
      order_id: orderId,
      event,
      cakto_event_id: logId,
    });
    return { status: "pending_user" };
  }

  const { data: affected, error } = await supabase.rpc("deactivate_cakto_subscription", {
    p_user_id: userId,
    p_subscription_key: subscriptionKey,
  });
  if (error) throw new Error(`deactivate_cakto_subscription (${event}) falhou: ${error.message}`);

  return affected ? { status: "processed" } : { status: "processed", message: "nenhuma assinatura Cakto ativa" };
}

async function findUserId(supabase: Supabase, email: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("find_user_id_by_email", { p_email: email });
  if (error) throw new Error(`find_user_id_by_email falhou: ${error.message}`);
  return (data as string | null) ?? null;
}

async function savePending(supabase: Supabase, row: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from("cakto_pending_purchases").insert(row);
  if (error) throw new Error(`falha ao salvar em cakto_pending_purchases: ${error.message}`);
}

async function finishLog(
  supabase: Supabase,
  logId: number,
  outcome: { status: Outcome["status"] | "duplicate"; message?: string },
): Promise<void> {
  const { error } = await supabase
    .from("cakto_events")
    .update({ status: outcome.status, error_message: outcome.message ?? null })
    .eq("id", logId);
  // O evento já foi aplicado (ou decidido); status do log é só informativo.
  if (error) console.error(`[webhooks/cakto] falha ao atualizar status do log ${logId}:`, error);
}

// Chave gravada em subscriptions.stripe_subscription_id. Usa o id da
// assinatura da Cakto quando vem no pedido — assim a renovação atualiza a
// MESMA linha da compra inicial. O prefixo "cakto_" nunca colide com um id
// do Stripe ("sub_...").
function caktoSubscriptionKey(item: CaktoItem, orderId: string): string {
  const sub = item.subscription;
  const subId = typeof sub === "string" ? sub : str((sub as CaktoItem | null | undefined)?.id);
  return subId ? `cakto_${subId}` : `cakto_order_${orderId}`;
}

function nextPaymentDate(item: CaktoItem): string | undefined {
  const sub = item.subscription as CaktoItem | null | undefined;
  const raw = sub && typeof sub === "object" ? str(sub.next_payment_date) : undefined;
  if (!raw) return undefined;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function str(value: unknown): string | undefined {
  if (typeof value === "string" && value) return value;
  if (typeof value === "number") return String(value);
  return undefined;
}
