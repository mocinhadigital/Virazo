import "server-only";
import { findPlanKeyByCaktoProductId } from "@/lib/billing/cakto";
import {
  CaktoApiError,
  getCaktoOrder,
  getCaktoSubscription,
  latestOrderBySubscription,
  listCustomerOrders,
  type CaktoOrder,
} from "@/lib/billing/caktoApi";
import type { Supabase } from "@/lib/billing/caktoEvents";
import { ENTITLED_SUBSCRIPTION_STATUSES } from "@/lib/billing/caktoSync";

// Checagem periódica das assinaturas ATIVAS vindas da Cakto (o webhook não
// dispara em vendas reais, então cancelamento/reembolso só chega por aqui).
// Para cada uma, consulta a Cakto e:
// - desativa (status 'canceled' — nada é apagado, vídeos ficam) se a
//   assinatura foi cancelada/expirou, se o pedido do período atual foi
//   reembolsado ou teve chargeback, ou se venceu sem renovação;
// - estende o current_period_end se a assinatura renovou.
// Assinaturas do Stripe nunca entram (filtro 'cakto_' no SQL).

// Folga depois do vencimento antes de desligar: a Cakto ainda tenta cobrar
// por alguns dias quando o cartão falha (assinatura 'late').
const EXPIRY_GRACE_MS = 3 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// Assinaturas conferidas em paralelo — só para caber mais no tempo da
// função; a cota é controlada pela contagem de requisições, não por isto.
const CONCURRENCY = 5;
// Pior caso de requisições por assinatura (assinatura + pedidos do cliente).
const MAX_REQUESTS_PER_ITEM = 2;

const DEACTIVATING_ORDER_STATUSES = new Set(["refunded", "chargedback", "canceled"]);

type Row = {
  user_id: string;
  plan: string;
  subscription_key: string;
  current_period_end: string | null;
  email: string | null;
};

type Decision =
  | { action: "deactivate"; reason: string; productId?: string }
  | { action: "extend"; periodEnd: string; plan: string; productId?: string }
  | { action: "keep"; reason: string };

export type CronSummary = {
  checked: number;
  deactivated: number;
  extended: number;
  kept: number;
  errors: number;
  requestsUsed: number;
  stoppedBy: "done" | "request_budget" | "time_budget" | "cakto_rate_limit";
};

export async function checkCaktoSubscriptions(
  supabase: Supabase,
  { maxRequests, deadline }: { maxRequests: number; deadline: number },
): Promise<CronSummary> {
  const summary: CronSummary = {
    checked: 0,
    deactivated: 0,
    extended: 0,
    kept: 0,
    errors: 0,
    requestsUsed: 0,
    stoppedBy: "done",
  };

  const { data, error } = await supabase.rpc("list_cakto_subscriptions_to_check", {
    p_limit: Math.max(1, Math.floor(maxRequests)),
  });
  if (error) throw new Error(`list_cakto_subscriptions_to_check falhou: ${error.message}`);
  const rows = (data ?? []) as Row[];

  let next = 0;
  let stop: CronSummary["stoppedBy"] | null = null;

  // Contagem conservadora: reserva o pior caso ANTES de começar cada item,
  // então nunca passa do teto nem com itens rodando em paralelo.
  async function worker() {
    while (!stop && next < rows.length) {
      if (Date.now() > deadline) {
        stop = "time_budget";
        return;
      }
      if (summary.requestsUsed + MAX_REQUESTS_PER_ITEM > maxRequests) {
        stop = "request_budget";
        return;
      }
      const row = rows[next++];
      summary.requestsUsed += MAX_REQUESTS_PER_ITEM;

      try {
        const decision = await decide(row);
        await applyDecision(supabase, row, decision);
        await recordCheck(supabase, row, decision.action === "keep" ? decision.reason : decision.action, null);
        summary.checked++;
        if (decision.action === "deactivate") summary.deactivated++;
        else if (decision.action === "extend") summary.extended++;
        else summary.kept++;
      } catch (err) {
        if (err instanceof CaktoApiError && err.status === 429) {
          // Cota da Cakto esgotada: para tudo. Esta assinatura não é marcada
          // como conferida, então entra primeiro na próxima execução.
          stop = "cakto_rate_limit";
          return;
        }
        summary.errors++;
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[cron/cakto] falha ao conferir ${row.subscription_key}:`, message);
        await recordCheck(supabase, row, "error", message);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  summary.stoppedBy = stop ?? "done";
  return summary;
}

async function decide(row: Row): Promise<Decision> {
  const now = Date.now();
  const currentEnd = parseTime(row.current_period_end);

  // Pedido avulso (sem assinatura na Cakto): só o pedido importa.
  if (row.subscription_key.startsWith("cakto_order_")) {
    const order = await getCaktoOrder(row.subscription_key.slice("cakto_order_".length));
    const productId = order.product?.id;
    if (DEACTIVATING_ORDER_STATUSES.has(order.status ?? "")) {
      return { action: "deactivate", reason: `order_${order.status}`, productId };
    }
    if (currentEnd !== undefined && currentEnd + EXPIRY_GRACE_MS < now) {
      return { action: "deactivate", reason: "expired_without_renewal", productId };
    }
    return { action: "keep", reason: `ok_order_${order.status ?? "unknown"}` };
  }

  const subscriptionId = row.subscription_key.slice("cakto_".length);
  const subscription = await getCaktoSubscription(subscriptionId);
  const productId = subscription.product ?? undefined;

  // Pedido mais recente desta assinatura: se foi reembolsado ou contestado,
  // o período atual não está pago — mesmo com a assinatura ainda 'active'
  // na Cakto.
  let latestPaid: CaktoOrder | undefined;
  const email = row.email?.trim().toLowerCase();
  if (email) {
    const orders = (await listCustomerOrders(email, ["paid", "refunded", "chargedback"])).filter(
      (order) => order.subscription === subscriptionId && order.customer?.email?.trim().toLowerCase() === email,
    );
    const latest = latestOrderBySubscription(orders).get(subscriptionId);
    if (latest && (latest.status === "refunded" || latest.status === "chargedback")) {
      return { action: "deactivate", reason: `order_${latest.status}`, productId };
    }
    if (latest?.status === "paid") latestPaid = latest;
  }

  if (!ENTITLED_SUBSCRIPTION_STATUSES.has(subscription.status ?? "")) {
    return { action: "deactivate", reason: `subscription_${subscription.status ?? "unknown"}`, productId };
  }

  // Até quando está pago: a próxima cobrança da Cakto; na falta dela, o
  // último pagamento + o período de recorrência; na falta dos dois, o que
  // já estava gravado.
  const paidAt = parseTime(latestPaid?.paidAt);
  const recurrenceDays = Number(subscription.recurrence_period) || 30;
  const periodEnd =
    parseTime(subscription.next_payment_date) ??
    (paidAt !== undefined ? paidAt + recurrenceDays * DAY_MS : undefined) ??
    currentEnd;

  if (periodEnd !== undefined && periodEnd + EXPIRY_GRACE_MS < now) {
    return { action: "deactivate", reason: "expired_without_renewal", productId };
  }

  if (periodEnd !== undefined && (currentEnd === undefined || periodEnd > currentEnd + 60_000)) {
    const plan = (productId && findPlanKeyByCaktoProductId(productId)) || row.plan;
    return { action: "extend", periodEnd: new Date(periodEnd).toISOString(), plan, productId };
  }

  return { action: "keep", reason: `ok_subscription_${subscription.status}` };
}

async function applyDecision(supabase: Supabase, row: Row, decision: Decision): Promise<void> {
  if (decision.action === "keep") return;

  if (decision.action === "deactivate") {
    const { error } = await supabase.rpc("deactivate_cakto_subscription", {
      p_user_id: row.user_id,
      p_subscription_key: row.subscription_key,
    });
    if (error) throw new Error(`deactivate_cakto_subscription falhou: ${error.message}`);
  } else {
    // Mesma função de ativação do webhook e do Stripe — só atualiza a linha
    // existente (upsert por stripe_subscription_id).
    const { error } = await supabase.rpc("apply_subscription_plan", {
      p_user_id: row.user_id,
      p_plan: decision.plan,
      p_stripe_customer_id: null,
      p_stripe_subscription_id: row.subscription_key,
      p_status: "active",
      p_current_period_end: decision.periodEnd,
    });
    if (error) throw new Error(`apply_subscription_plan (extensão) falhou: ${error.message}`);
  }

  // Trilha de auditoria no mesmo log dos eventos da Cakto. Falhar aqui não
  // desfaz a decisão, que já foi aplicada.
  const { error: logError } = await supabase.from("cakto_events").insert({
    event: decision.action === "deactivate" ? "cron_deactivated" : "cron_extended",
    email: row.email,
    product_id: decision.productId ?? null,
    status: "processed",
    payload: {
      subscription_key: row.subscription_key,
      previous_period_end: row.current_period_end,
      ...(decision.action === "deactivate" ? { reason: decision.reason } : { new_period_end: decision.periodEnd }),
    },
  });
  if (logError) console.error("[cron/cakto] falha ao registrar em cakto_events:", logError);
}

async function recordCheck(supabase: Supabase, row: Row, result: string, errorMessage: string | null) {
  const { error } = await supabase.from("cakto_subscription_checks").upsert({
    subscription_key: row.subscription_key,
    user_id: row.user_id,
    last_checked_at: new Date().toISOString(),
    last_result: result,
    last_error: errorMessage,
  });
  if (error) console.error("[cron/cakto] falha ao gravar cakto_subscription_checks:", error);
}

function parseTime(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? undefined : time;
}
