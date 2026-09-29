import "server-only";
import { findPlanKeyByCaktoProductId } from "@/lib/billing/cakto";
import {
  getCaktoSubscription,
  isCaktoApiConfigured,
  latestOrderBySubscription,
  listCustomerOrders,
  type CaktoSubscription,
} from "@/lib/billing/caktoApi";
import {
  activationKey,
  FALLBACK_PERIOD_MS,
  processCaktoItem,
  str,
  type CaktoItem,
} from "@/lib/billing/caktoEvents";
import type { PlanKey } from "@/lib/billing/plans";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

// Consulta ATIVA à API da Cakto — caminho principal de ativação, já que o
// webhook não dispara em vendas reais. Busca os pedidos pagos do e-mail do
// usuário logado e ativa o plano pelo mesmo processCaktoItem do webhook,
// com a mesma chave de idempotência ('activate:<id do pedido>'): um pedido
// já aplicado (por aqui ou pelo webhook) nunca é aplicado de novo.

const MIN_INTERVAL_SECONDS = 30;

// Nome gravado em cakto_events.event para as ativações vindas daqui —
// separa no log o que veio da API do que veio do webhook.
const API_EVENT = "api_order_paid";

// Assinatura nesses estados ainda dá direito ao plano. 'late' = cobrança do
// ciclo atrasada, mas a Cakto ainda está tentando; cancelada, expirada,
// inativa ou pausada não ativa.
export const ENTITLED_SUBSCRIPTION_STATUSES = new Set(["active", "trial", "late"]);

export type CaktoSyncResult =
  | { status: "activated"; plan: PlanKey }
  | { status: "not_found" }
  | { status: "rate_limited"; retryAfterSeconds: number }
  | { status: "not_configured" };

export async function syncCaktoPaymentsForUser(user: {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
}): Promise<CaktoSyncResult> {
  if (!isCaktoApiConfigured()) return { status: "not_configured" };

  // Mesmo critério das compras pendentes: sem e-mail confirmado, quem
  // cadastrasse o e-mail de um comprador levaria o plano dele.
  const email = user.email?.trim().toLowerCase();
  if (!email || !user.email_confirmed_at) return { status: "not_found" };

  const supabase = createServiceRoleClient();

  // No banco (e não em memória) porque na Vercel cada requisição pode cair
  // numa instância diferente.
  const { data: waitSeconds, error: limitError } = await supabase.rpc("try_claim_cakto_sync", {
    p_user_id: user.id,
    p_min_interval_seconds: MIN_INTERVAL_SECONDS,
  });
  if (limitError) throw new Error(`try_claim_cakto_sync falhou: ${limitError.message}`);
  if (typeof waitSeconds === "number" && waitSeconds > 0) {
    return { status: "rate_limited", retryAfterSeconds: waitSeconds };
  }

  // Reembolsados/contestados vêm junto só para saber qual é o pedido mais
  // recente de cada assinatura: se ele foi reembolsado, um pedido pago mais
  // antigo da mesma assinatura NÃO reativa o plano (é o que o cron de
  // cancelamentos acabou de desligar).
  const orders = (await listCustomerOrders(email, ["paid", "refunded", "chargedback"])).filter(
    (order) =>
      !!order.id &&
      order.customer?.email?.trim().toLowerCase() === email &&
      !!order.product?.id &&
      !!findPlanKeyByCaktoProductId(order.product.id),
  );
  const latestBySubscription = latestOrderBySubscription(orders);

  const candidates = orders.filter(
    (order) =>
      order.status === "paid" &&
      (!order.subscription || latestBySubscription.get(order.subscription)?.status === "paid"),
  );
  if (candidates.length === 0) return { status: "not_found" };

  // Pula, sem nem registrar, o que já foi aplicado — senão cada consulta
  // encheria cakto_events de linhas "duplicate" do mesmo pedido.
  const { data: done, error: doneError } = await supabase
    .from("cakto_events")
    .select("idempotency_key")
    .in("idempotency_key", candidates.map((order) => activationKey(order.id!)))
    .not("processed_at", "is", null);
  if (doneError) throw new Error(`consulta a cakto_events falhou: ${doneError.message}`);
  const alreadyApplied = new Set((done ?? []).map((row) => row.idempotency_key as string));

  // Do mais antigo para o mais recente: se houver mais de um pedido novo,
  // o plano que fica valendo é o da compra mais recente.
  const pending = candidates.filter((order) => !alreadyApplied.has(activationKey(order.id!))).reverse();

  const subscriptions = new Map<string, CaktoSubscription>();
  let activatedPlan: PlanKey | undefined;

  for (const order of pending) {
    const item: CaktoItem = { ...order };

    if (order.subscription) {
      let subscription = subscriptions.get(order.subscription);
      if (!subscription) {
        subscription = await getCaktoSubscription(order.subscription);
        subscriptions.set(order.subscription, subscription);
      }
      if (!ENTITLED_SUBSCRIPTION_STATUSES.has(subscription.status ?? "")) continue;

      // Objeto no lugar do id: processCaktoItem tira daqui a chave da
      // assinatura (a mesma do webhook) e a próxima cobrança.
      item.subscription = { ...subscription, id: subscription.id ?? order.subscription };
    } else {
      // Pedido avulso: vale um ciclo a partir do pagamento.
      const paidAt = str(order.paidAt);
      if (!paidAt || Date.now() - new Date(paidAt).getTime() > FALLBACK_PERIOD_MS) continue;
    }

    const outcome = await processCaktoItem(supabase, API_EVENT, item, {
      forceActivate: true,
      userId: user.id,
    });
    if (outcome === "processed") activatedPlan = findPlanKeyByCaktoProductId(order.product!.id!);
  }

  return activatedPlan ? { status: "activated", plan: activatedPlan } : { status: "not_found" };
}
