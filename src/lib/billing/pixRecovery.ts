import "server-only";
import { findPlanKeyByCaktoProductId } from "@/lib/billing/cakto";
import { PLANS, type PlanKey } from "@/lib/billing/plans";
import { getCaktoOrder, isCaktoApiConfigured } from "@/lib/billing/caktoApi";
import { findRealisticPackageByCaktoProductId } from "@/lib/billing/realisticPackages";
import { REALISTIC_PACKAGES } from "@/lib/realistic/constants";
import type { createServiceRoleClient } from "@/utils/supabase/service-role";

// E-mail de recuperação: quem gera o Pix e não paga recebe, 15 minutos depois,
// um e-mail curto da Andreia com o link para concluir o pagamento.
//
// Quando o aviso "pix_gerado" chega, só gravamos um registro "scheduled" com o
// horário. O envio é NOSSO (sendDueRecoveryEmails, chamado a cada minuto por
// /api/cron/pix-recovery) e, NA HORA de enviar, o sistema confere de novo se
// o pedido foi pago, se o e-mail já tem pagamento aprovado e se já tem plano
// ativo — em qualquer desses casos não envia. (Antes o envio era agendado no
// Resend e dependia de CANCELAR; o cancelamento falhou com HTTP 401 e o e-mail
// saiu para quem já tinha pago.)
//
// Só funciona com tudo configurado — senão não faz nada, sem erro:
//   RECOVERY_EMAIL_ENABLED=true      liga o recurso
//   RESEND_API_KEY                   chave do Resend (só precisa enviar)
//   RECOVERY_EMAIL_FROM              ex.: "Andreia | Virazo <andreia@seudominio.com>"
//                                    (domínio verificado no Resend)
//   RECOVERY_EMAIL_REPLY_TO          opcional: para onde vão as respostas
//   CRON_SECRET                      protege /api/cron/pix-recovery
// Nunca lança: falha aqui jamais pode atrapalhar o webhook de pagamentos.

type Supabase = ReturnType<typeof createServiceRoleClient>;
type Obj = Record<string, unknown>;

const DELAY_MS = 15 * 60 * 1000;
const RESEND_TIMEOUT_MS = 8000;

const CHECKOUT_ENV: Record<PlanKey, string> = {
  diario: "CAKTO_CHECKOUT_DIARIO",
  pro: "CAKTO_CHECKOUT_PRO",
  ultra: "CAKTO_CHECKOUT_ULTRA",
};
const REALISTIC_CHECKOUT_ENV = { "10": "CAKTO_CHECKOUT_REALISTA_10", "20": "CAKTO_CHECKOUT_REALISTA_20" } as const;

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

function config(): { apiKey: string; from: string; replyTo?: string } | null {
  if (process.env.RECOVERY_EMAIL_ENABLED?.trim().toLowerCase() !== "true") return null;
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RECOVERY_EMAIL_FROM?.trim();
  if (!apiKey || !from) return null;
  return { apiKey, from, replyTo: process.env.RECOVERY_EMAIL_REPLY_TO?.trim() || undefined };
}

function checkoutLink(raw: string | undefined, email: string, name?: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    url.searchParams.set("email", email);
    url.searchParams.set("confirmEmail", email);
    if (name) url.searchParams.set("name", name);
    url.searchParams.set("utm_source", "email");
    url.searchParams.set("utm_campaign", "recuperacao_pix");
    return url.toString().replace(/\+/g, "%20");
  } catch {
    return null;
  }
}

// Só texto, como se tivesse sido digitado: sem HTML, botão ou imagem, para
// ter mais chance de cair na aba Principal do Gmail (e não em Promoções).
export function buildRecoveryEmail(firstName: string | null, product: string, link: string): string {
  const greeting = firstName ? `Oi, ${firstName}! Tudo bem?` : "Oi! Tudo bem?";
  return [
    greeting,
    `Vi que você gerou o Pix ${product}, mas o pagamento não chegou a ser concluído. Deu algum problema?`,
    `Se quiser terminar, é só usar este link: ${link}`,
    "Qualquer dúvida, é só responder este e-mail.",
    "Andreia / Equipe Virazo",
  ].join("\n\n");
}

// Chamado quando chega um "pix_gerado".
export async function scheduleRecoveryEmail(supabase: Supabase, item: Obj): Promise<void> {
  try {
    const cfg = config();
    if (!cfg) return;

    const orderId = str(item.id);
    const customer = (item.customer ?? {}) as Obj;
    const email = str(customer.email)?.toLowerCase();
    const product = (item.product ?? {}) as Obj;
    const productId = str(product.id) ?? str(product.short_id);
    if (!orderId || !email || !productId || email.endsWith("@example.com")) return;

    // Produto -> texto e link do checkout (plano ou pacote do Vídeo Realista).
    const fullName = str(customer.name);
    let productText: string;
    let link: string | null;
    const planKey = findPlanKeyByCaktoProductId(productId);
    const pack = planKey ? undefined : findRealisticPackageByCaktoProductId(productId);
    if (planKey) {
      productText = `do plano ${PLANS[planKey].name}`;
      link = checkoutLink(process.env[CHECKOUT_ENV[planKey]]?.trim(), email, fullName);
    } else if (pack) {
      const credits = REALISTIC_PACKAGES.find((p) => p.key === pack.key)?.credits ?? 0;
      productText = `do pacote de ${credits} vídeos realistas`;
      link = checkoutLink(process.env[REALISTIC_CHECKOUT_ENV[pack.key]]?.trim(), email, fullName);
    } else {
      return; // produto desconhecido (ex.: aviso de teste da Cakto)
    }
    if (!link) return;

    // Um e-mail por pedido (chave primária) e no máximo um por pessoa a cada 24h.
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from("pix_recovery_emails")
      .select("order_id")
      .eq("email", email)
      .in("status", ["scheduled", "sending", "sent", "canceled"])
      .gte("created_at", dayAgo)
      .limit(1);
    if (recent && recent.length > 0) return;

    // Quem já tem plano ativo não precisa de lembrete de plano.
    if (planKey) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .ilike("email", email)
        .maybeSingle<{ id: string }>();
      if (profile) {
        const { data: active } = await supabase
          .from("subscriptions")
          .select("id")
          .eq("user_id", profile.id)
          .eq("status", "active")
          .limit(1);
        if (active && active.length > 0) return;
      }
    }

    const scheduledFor = new Date(Date.now() + DELAY_MS);
    const { error: insertError } = await supabase.from("pix_recovery_emails").insert({
      order_id: orderId,
      email,
      product_label: productText,
      product_id: productId,
      customer_name: fullName ?? null,
      scheduled_for: scheduledFor.toISOString(),
    });
    if (insertError) {
      // 23505 = esse pedido já foi agendado (reenvio do aviso): normal.
      if (insertError.code !== "23505") console.error("[pixRecovery] não gravou o agendamento:", insertError.message);
      return;
    }
  } catch (err) {
    console.error("[pixRecovery] falhou ao agendar:", err instanceof Error ? err.message : err);
  }
}

// Chamado quando a pessoa paga (qualquer ativação): cancela os envios ainda
// agendados para esse e-mail. Se o e-mail já saiu, o Resend recusa e nada muda.
export async function cancelRecoveryEmails(supabase: Supabase, email: string | undefined): Promise<void> {
  try {
    if (!email) return;
    const { data: rows } = await supabase
      .from("pix_recovery_emails")
      .select("order_id,resend_id")
      .eq("email", email.toLowerCase())
      .eq("status", "scheduled")
      .returns<{ order_id: string; resend_id: string | null }[]>();
    for (const row of rows ?? []) {
      let note: string | null = "pagamento recebido antes do envio";
      let status = "canceled";
      // Registros antigos já foram agendados no Resend: tenta cancelar lá. Se
      // não conseguir, NÃO marca como cancelado (o e-mail ainda vai sair).
      const cfg = config();
      if (row.resend_id && cfg) {
        const response = await fetch(`https://api.resend.com/emails/${row.resend_id}/cancel`, {
          method: "POST",
          headers: { Authorization: `Bearer ${cfg.apiKey}` },
          signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
        });
        if (!response.ok) {
          status = "scheduled";
          note = `ATENÇÃO: cancelamento no Resend falhou (HTTP ${response.status}); o e-mail pode ser enviado`;
        }
      }
      await supabase.from("pix_recovery_emails").update({ status, note }).eq("order_id", row.order_id);
    }
  } catch (err) {
    console.error("[pixRecovery] falhou ao cancelar:", err instanceof Error ? err.message : err);
  }
}

// ---------------------------------------------------------------------------
// Envio (chamado a cada minuto por /api/cron/pix-recovery)
// ---------------------------------------------------------------------------

const PAID_ORDER_STATUSES = new Set(["paid", "approved", "authorized", "completed"]);
const PAYMENT_EVENTS = ["purchase_approved", "subscription_created", "subscription_renewed"];
const STALE_AFTER_MS = 2 * 60 * 60 * 1000; // passou de 2h do horário: não manda mais

type DueRow = {
  order_id: string;
  email: string;
  product_label: string | null;
  product_id: string | null;
  customer_name: string | null;
  scheduled_for: string;
};

export type RecoveryDeps = {
  // Pedido na Cakto (status atual), ou null se a API não está configurada.
  // Pode lançar erro de rede/API.
  fetchOrder: (orderId: string) => Promise<{ status?: string; paidAt?: string | null }> | null;
  sendEmail: (args: {
    to: string;
    subject: string;
    text: string;
    idempotencyKey: string;
  }) => Promise<{ id?: string; error?: string }>;
};

// Devolve o motivo para NÃO enviar, ou null se pode enviar. Lança só se a
// consulta à Cakto falhar (aí o envio fica para a próxima rodada).
export async function recoveryBlockReason(
  supabase: Supabase,
  row: Pick<DueRow, "order_id" | "email">,
  deps: Pick<RecoveryDeps, "fetchOrder">,
): Promise<string | null> {
  const email = row.email.toLowerCase();

  // 1) O aviso de pagamento DESTE pedido já chegou?
  const { data: orderEvents } = await supabase
    .from("cakto_events")
    .select("id")
    .eq("order_id", row.order_id)
    .in("event", PAYMENT_EVENTS)
    .limit(1);
  if (orderEvents && orderEvents.length > 0) return "pedido já pago (aviso de pagamento recebido)";

  // 2) Esse e-mail tem algum pagamento aprovado?
  const { data: emailEvents } = await supabase
    .from("cakto_events")
    .select("id")
    .ilike("email", email)
    .in("event", PAYMENT_EVENTS)
    .limit(1);
  if (emailEvents && emailEvents.length > 0) return "e-mail já tem pagamento aprovado";

  // 3) Esse e-mail tem plano ativo?
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle<{ id: string }>();
  if (profile) {
    const { data: active } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("user_id", profile.id)
      .eq("status", "active")
      .limit(1);
    if (active && active.length > 0) return "e-mail já tem plano ativo";
  }

  // 4) Consulta o pedido direto na Cakto (cobre aviso de pagamento que não chegou).
  const pending = deps.fetchOrder(row.order_id);
  if (pending) {
    const order = await pending;
    if (order.paidAt || PAID_ORDER_STATUSES.has(String(order.status ?? "").toLowerCase())) {
      return "pedido pago na Cakto";
    }
  }
  return null;
}

async function sendViaResend(
  cfg: { apiKey: string; from: string; replyTo?: string },
  args: Parameters<RecoveryDeps["sendEmail"]>[0],
): Promise<{ id?: string; error?: string }> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": args.idempotencyKey,
    },
    body: JSON.stringify({
      from: cfg.from,
      to: [args.to],
      ...(cfg.replyTo ? { reply_to: cfg.replyTo } : {}),
      subject: args.subject,
      text: args.text,
    }),
    signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
  });
  const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!response.ok || !body.id) {
    return { error: `Resend HTTP ${response.status}: ${(body.message ?? "").slice(0, 200)}` };
  }
  return { id: body.id };
}

export type RecoverySummary = { due: number; sent: number; skipped: number; failed: number; retry: number };

export async function sendDueRecoveryEmails(supabase: Supabase, deps?: RecoveryDeps): Promise<RecoverySummary> {
  const summary: RecoverySummary = { due: 0, sent: 0, skipped: 0, failed: 0, retry: 0 };
  const cfg = config();
  if (!cfg && !deps) return summary;

  const effective: RecoveryDeps =
    deps ??
    {
      fetchOrder: (orderId) => (isCaktoApiConfigured() ? getCaktoOrder(orderId) : null),
      sendEmail: (args) => sendViaResend(cfg!, args),
    };

  const { data: rows } = await supabase
    .from("pix_recovery_emails")
    .select("order_id,email,product_label,product_id,customer_name,scheduled_for")
    .eq("status", "scheduled")
    .is("resend_id", null)
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(25)
    .returns<DueRow[]>();

  for (const row of rows ?? []) {
    // Reserva o registro (duas rodadas simultâneas não enviam duas vezes).
    const { data: claimed } = await supabase
      .from("pix_recovery_emails")
      .update({ status: "sending" })
      .eq("order_id", row.order_id)
      .eq("status", "scheduled")
      .select("order_id");
    if (!claimed || claimed.length === 0) continue;
    summary.due++;

    const finish = (status: string, note: string | null, extra: Record<string, unknown> = {}) =>
      supabase.from("pix_recovery_emails").update({ status, note, ...extra }).eq("order_id", row.order_id);

    try {
      if (Date.now() - new Date(row.scheduled_for).getTime() > STALE_AFTER_MS) {
        await finish("skipped", "passou do horário de envio");
        summary.skipped++;
        continue;
      }

      let reason: string | null;
      try {
        reason = await recoveryBlockReason(supabase, row, effective);
      } catch (err) {
        // Cakto fora do ar: não manda sem conferir; tenta de novo na próxima rodada.
        const msg = err instanceof Error ? err.message : String(err);
        await finish("scheduled", `consulta à Cakto falhou: ${msg}`.slice(0, 300));
        summary.retry++;
        continue;
      }
      if (reason) {
        await finish("skipped", reason);
        summary.skipped++;
        continue;
      }

      const planKey = row.product_id ? findPlanKeyByCaktoProductId(row.product_id) : undefined;
      const pack = row.product_id && !planKey ? findRealisticPackageByCaktoProductId(row.product_id) : undefined;
      const raw = planKey
        ? process.env[CHECKOUT_ENV[planKey]]?.trim()
        : pack
          ? process.env[REALISTIC_CHECKOUT_ENV[pack.key]]?.trim()
          : undefined;
      const link = checkoutLink(raw, row.email, row.customer_name ?? undefined);
      if (!link) {
        await finish("failed", "sem link de checkout para o produto");
        summary.failed++;
        continue;
      }
      const firstName = row.customer_name ? row.customer_name.split(/\s+/)[0] : null;
      const text = buildRecoveryEmail(firstName, row.product_label ?? "", link);
      const result = await effective.sendEmail({
        to: row.email,
        subject: "Seu Pix do Virazo",
        text,
        idempotencyKey: `pix-recovery-${row.order_id}`,
      });
      if (result.id) {
        await finish("sent", null, { resend_id: result.id });
        summary.sent++;
      } else {
        await finish("failed", result.error ?? "falha no envio");
        summary.failed++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await finish("failed", `erro: ${msg}`.slice(0, 300));
      summary.failed++;
    }
  }
  return summary;
}
