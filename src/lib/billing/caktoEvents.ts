import "server-only";
import { findPlanKeyByCaktoProductId } from "@/lib/billing/cakto";
import { CaktoApiError, getCaktoOrder, isCaktoApiConfigured, type CaktoOrder } from "@/lib/billing/caktoApi";
import type { PlanKey } from "@/lib/billing/plans";
import { recordUnmatchedPayment } from "@/lib/billing/unmatchedPayments";
import type { createServiceRoleClient } from "@/utils/supabase/service-role";

// Registro + idempotência + ativação/desativação de um pedido da Cakto.
// Compartilhado pelos dois caminhos que ativam plano:
// - o webhook (/api/webhooks/cakto), que recebe o evento da Cakto;
// - a consulta ativa à API da Cakto (caktoSync.ts), que busca os pedidos
//   pagos do usuário logado.
// Os dois usam a MESMA chave de idempotência ('activate:<id do pedido>'),
// então um pedido nunca é aplicado duas vezes, venha por onde vier.

export type Supabase = ReturnType<typeof createServiceRoleClient>;

export type CaktoItem = Record<string, unknown>;

// Eventos que mudam alguma coisa no Virazo. Qualquer outro (pix_gerado,
// checkout_abandonment...) só é registrado em cakto_events.
//
// A Cakto manda purchase_approved E subscription_created com o MESMO data.id
// na compra inicial — os dois liberam o plano, mas a chave de idempotência
// é só o data.id, então quem chegar primeiro aplica e o outro cai como
// duplicata. Cada renovação chega com um data.id novo.
const ACTIVATE_EVENTS = new Set(["purchase_approved", "subscription_created", "subscription_renewed"]);
const DEACTIVATE_EVENTS = new Set(["subscription_canceled", "refund", "chargeback"]);
// Dinheiro devolvido ao cliente: além do plano, zera profiles.credits.
const REFUND_EVENTS = new Set(["refund", "chargeback"]);
// Status de pedido da API da Cakto que confirmam dinheiro devolvido (os
// mesmos que a checagem diária usa em caktoCron.ts).
const REFUNDED_ORDER_STATUSES = new Set(["refunded", "chargedback"]);

// profiles.credits é um resquício do modelo antigo de créditos (migration
// 0019: nenhuma função nova lê esse campo; o acesso hoje é só a assinatura
// ativa + limite diário). Zerar aqui garante que, num reembolso, nada
// "sobre" para o cliente mesmo que esse campo volte a ser usado. Falhar
// não desfaz a remoção do plano, que já foi aplicada.
export async function zeroLegacyCredits(supabase: Supabase, userId: string): Promise<void> {
  const { error } = await supabase.from("profiles").update({ credits: 0 }).eq("id", userId);
  if (error) console.error(`[billing/caktoEvents] falha ao zerar créditos de ${userId}:`, error.message);
}

// Sem assinatura a Cakto não manda próxima cobrança; o plano vale um ciclo
// mensal a partir de agora. current_period_end só é exibido em
// Configurações — quem desliga o acesso é o status, não esta data.
export const FALLBACK_PERIOD_MS = 31 * 24 * 60 * 60 * 1000;

export type CaktoOutcomeStatus = "processed" | "pending_user" | "ignored" | "duplicate";

type Outcome = {
  status: Exclude<CaktoOutcomeStatus, "duplicate">;
  message?: string;
  // Devolve a trava de idempotência (como no caso de erro): um reenvio do
  // mesmo evento será reprocessado em vez de cair como duplicata.
  release?: boolean;
};

export type ProcessOptions = {
  // Caminho da API: o pedido já foi filtrado como pago, então ativa mesmo
  // sem um nome de evento da lista acima.
  forceActivate?: boolean;
  // Caminho da API: o dono do pedido é o usuário logado — dispensa a busca
  // por e-mail em profiles.
  userId?: string;
};

export function activationKey(orderId: string): string {
  return `activate:${orderId}`;
}

export async function processCaktoItem(
  supabase: Supabase,
  event: string,
  item: CaktoItem,
  options: ProcessOptions = {},
): Promise<CaktoOutcomeStatus> {
  const orderId = str(item.id);
  const customer = item.customer as CaktoItem | undefined;
  const product = item.product as CaktoItem | undefined;
  const email = str(customer?.email)?.trim().toLowerCase();
  const productId = str(product?.id) ?? str(product?.short_id);
  const isActivate = options.forceActivate === true || ACTIVATE_EVENTS.has(event);
  const isDeactivate = !isActivate && DEACTIVATE_EVENTS.has(event);

  // Só UMA linha por idempotency_key pode ser marcada como processada
  // (índice único da migration 0022). Liberação de plano: só o data.id,
  // seja qual for o evento. Desativação: evento + data.id, como antes.
  const idempotencyKey = !orderId
    ? null
    : isActivate
      ? activationKey(orderId)
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
    return "ignored";
  }

  // Sem data.id não há como garantir que o evento não seja aplicado duas
  // vezes — melhor não aplicar e deixar registrado para conferência.
  if (!orderId) {
    await finishLog(supabase, logId, { status: "ignored", message: "payload sem data.id" });
    return "ignored";
  }

  const { data: claimed, error: claimError } = await supabase.rpc("try_claim_cakto_event", {
    p_event_row_id: logId,
  });
  if (claimError) {
    throw new Error(`try_claim_cakto_event falhou: ${claimError.message}`);
  }
  if (!claimed) {
    await finishLog(supabase, logId, { status: "duplicate" });
    return "duplicate";
  }

  try {
    const outcome = isActivate
      ? await activate(supabase, logId, event, item, orderId, email, productId, options.userId)
      : await deactivate(supabase, logId, event, item, orderId, email);
    await finishLog(supabase, logId, outcome);
    if (outcome.release) {
      await supabase.from("cakto_events").update({ processed_at: null }).eq("id", logId);
    }
    return outcome.status;
  } catch (err) {
    // Devolve a trava para uma nova tentativa (reenvio da Cakto ou próxima
    // consulta à API) conseguir reprocessar.
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
  knownUserId: string | undefined,
): Promise<Outcome> {
  const plan: PlanKey | undefined = productId ? findPlanKeyByCaktoProductId(productId) : undefined;
  if (!plan) {
    return { status: "ignored", message: `produto ${productId ?? "(vazio)"} não corresponde a nenhum plano` };
  }
  if (!email && !knownUserId) return { status: "ignored", message: "payload sem data.customer.email" };

  const subscriptionKey = caktoSubscriptionKey(item, orderId);
  const periodEnd = nextPaymentDate(item) ?? new Date(Date.now() + FALLBACK_PERIOD_MS).toISOString();
  const userId = knownUserId ?? (await findUserId(supabase, email!));

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

    // Além de guardar a compra pendente (acima, como sempre), registra o
    // pagamento em "pagamentos sem conta" e avisa o administrador por e-mail
    // para ativar manualmente. Nunca lança e não muda o resultado.
    const buyer = item.customer as CaktoItem | undefined;
    const amount = Number(item.amount);
    await recordUnmatchedPayment(supabase, {
      orderId,
      event,
      email: email!,
      customerName: str(buyer?.name),
      customerPhone: str(buyer?.phone),
      plan,
      productName: str((item.product as CaktoItem | undefined)?.name),
      refId: str(item.refId),
      amount: Number.isFinite(amount) ? amount : undefined,
      caktoEventId: logId,
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

  const isRefund = REFUND_EVENTS.has(event);

  // Reembolso/chargeback só valem se a PRÓPRIA Cakto confirmar o pedido
  // como devolvido e com o mesmo e-mail — o segredo do webhook prova a
  // origem da requisição, mas não que aquele pedido foi de fato reembolsado.
  // Sem credenciais da API (CAKTO_CLIENT_ID/SECRET) segue só pelo segredo,
  // como antes. Erro de rede/Cakto: lança, a Cakto reenvia (e a checagem
  // diária também cobre).
  if (isRefund && isCaktoApiConfigured()) {
    let order: CaktoOrder | null = null;
    try {
      order = await getCaktoOrder(orderId);
    } catch (err) {
      if (!(err instanceof CaktoApiError && err.status === 404)) throw err;
    }
    if (!order) {
      return {
        status: "ignored",
        message: `pedido ${orderId} não encontrado na Cakto — nada foi alterado`,
        release: true,
      };
    }
    if (!REFUNDED_ORDER_STATUSES.has(order.status ?? "")) {
      return {
        status: "ignored",
        message: `Cakto informa o pedido ${orderId} como "${order.status ?? "sem status"}", não reembolsado — nada foi alterado`,
        release: true,
      };
    }
    const orderEmail = order.customer?.email?.trim().toLowerCase();
    if (orderEmail && orderEmail !== email) {
      return {
        status: "ignored",
        message: "e-mail do pedido na Cakto difere do evento — nada foi alterado",
        release: true,
      };
    }
  }

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

  // A função do banco, quando a chave não casa com nenhuma linha, cancela
  // TODAS as assinaturas Cakto ativas do usuário. Aqui só deixa chegar nesse
  // caso quando existe exatamente UMA ativa (nenhuma ambiguidade); com mais
  // de uma, não cancela nada — fica registrado para conferência manual.
  const { data: rows, error: rowsError } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id, status")
    .eq("user_id", userId)
    .like("stripe_subscription_id", "cakto\\_%");
  if (rowsError) throw new Error(`falha ao ler assinaturas Cakto: ${rowsError.message}`);

  const hasExactRow = (rows ?? []).some((r) => r.stripe_subscription_id === subscriptionKey);
  const activeRows = (rows ?? []).filter((r) => r.status === "active");
  if (!hasExactRow) {
    if (activeRows.length === 0) return { status: "processed", message: "nenhuma assinatura Cakto ativa" };
    if (activeRows.length > 1) {
      return {
        status: "ignored",
        message: `${event} do pedido ${orderId} não casa com nenhuma assinatura e há ${activeRows.length} ativas — nada foi alterado, conferir manualmente`,
      };
    }
  }

  const { data: affected, error } = await supabase.rpc("deactivate_cakto_subscription", {
    p_user_id: userId,
    p_subscription_key: subscriptionKey,
  });
  if (error) throw new Error(`deactivate_cakto_subscription (${event}) falhou: ${error.message}`);

  // Créditos só são zerados se a remoção do plano de fato aconteceu.
  if (isRefund && affected) await zeroLegacyCredits(supabase, userId);

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
  outcome: { status: CaktoOutcomeStatus; message?: string },
): Promise<void> {
  const { error } = await supabase
    .from("cakto_events")
    .update({ status: outcome.status, error_message: outcome.message ?? null })
    .eq("id", logId);
  // O evento já foi aplicado (ou decidido); status do log é só informativo.
  if (error) console.error(`[billing/caktoEvents] falha ao atualizar status do log ${logId}:`, error);
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

export function str(value: unknown): string | undefined {
  if (typeof value === "string" && value) return value;
  if (typeof value === "number") return String(value);
  return undefined;
}
