import "server-only";
import { findPlanKeyByCaktoProductId } from "@/lib/billing/cakto";
import { PLANS, type PlanKey } from "@/lib/billing/plans";
import { findRealisticPackageByCaktoProductId } from "@/lib/billing/realisticPackages";
import { REALISTIC_PACKAGES } from "@/lib/realistic/constants";
import type { createServiceRoleClient } from "@/utils/supabase/service-role";

// E-mail de recuperação: quem gera o Pix e não paga recebe, 15 minutos depois,
// um e-mail curto da Andreia com o link para concluir o pagamento.
//
// O envio é AGENDADO no Resend (scheduled_at) no momento em que o aviso
// "pix_gerado" chega, e CANCELADO se a pessoa pagar antes (qualquer ativação
// com o mesmo e-mail). Assim não depende de tarefa agendada na Vercel.
//
// Só funciona com tudo configurado — senão não faz nada, sem erro:
//   RECOVERY_EMAIL_ENABLED=true      liga o recurso
//   RESEND_API_KEY                   chave do Resend
//   RECOVERY_EMAIL_FROM              ex.: "Andreia | Virazo <andreia@seudominio.com>"
//                                    (domínio verificado no Resend)
//   RECOVERY_EMAIL_REPLY_TO          opcional: para onde vão as respostas
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

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildRecoveryEmail(firstName: string | null, product: string, link: string) {
  const greeting = firstName ? `Oi, ${firstName}!` : "Oi!";
  const intro = "Aqui é a Andreia, do Virazo.";
  const body1 = `Vi que você gerou o Pix ${product}, mas o pagamento ainda não chegou por aqui. Às vezes o app do banco trava ou a gente se distrai no meio, acontece!`;
  const body2 = "Se ainda quiser, é só concluir por este link (ele gera um Pix novo):";
  const cta = "Concluir meu pagamento";
  const body3 = "E sem risco nenhum: você tem 7 dias de garantia. Se não gostar, devolvemos o valor.";
  const body4 = "Se travou em alguma coisa ou ficou com dúvida, responda este e-mail que eu te ajudo.";
  const sign = ["Um abraço,", "Andreia / Equipe Virazo"];

  const text = [
    `${greeting} ${intro}`,
    body1,
    `${body2}\n${link}`,
    body3,
    body4,
    sign.join("\n"),
  ].join("\n\n");

  const p = (t: string) => `<p style="margin:0 0 16px">${t}</p>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#222">${[
    p(`${escapeHtml(greeting)} ${intro}`),
    p(escapeHtml(body1)),
    p(`${body2}<br><a href="${escapeHtml(link)}" style="color:#4C3BFF;font-weight:bold">${cta}</a>`),
    p(body3),
    p(body4),
    `<p style="margin:0">${sign[0]}<br>${sign[1]}</p>`,
  ].join("")}</div>`;

  return { text, html };
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
    const firstName = fullName ? fullName.split(/\s+/)[0] : null;
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
      .in("status", ["scheduled", "canceled"])
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
      scheduled_for: scheduledFor.toISOString(),
    });
    if (insertError) {
      // 23505 = esse pedido já foi agendado (reenvio do aviso): normal.
      if (insertError.code !== "23505") console.error("[pixRecovery] não gravou o agendamento:", insertError.message);
      return;
    }

    const { text, html } = buildRecoveryEmail(firstName, productText, link);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `pix-recovery-${orderId}`,
      },
      body: JSON.stringify({
        from: cfg.from,
        to: [email],
        ...(cfg.replyTo ? { reply_to: cfg.replyTo } : {}),
        subject: "Sobre o seu pagamento no Virazo",
        text,
        html,
        scheduled_at: scheduledFor.toISOString(),
      }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!response.ok || !body.id) {
      await supabase
        .from("pix_recovery_emails")
        .update({ status: "failed", note: `Resend HTTP ${response.status}: ${(body.message ?? "").slice(0, 200)}` })
        .eq("order_id", orderId);
      console.error("[pixRecovery] Resend recusou o agendamento:", response.status, body.message);
      return;
    }
    await supabase.from("pix_recovery_emails").update({ resend_id: body.id }).eq("order_id", orderId);
  } catch (err) {
    console.error("[pixRecovery] falhou ao agendar:", err instanceof Error ? err.message : err);
  }
}

// Chamado quando a pessoa paga (qualquer ativação): cancela os envios ainda
// agendados para esse e-mail. Se o e-mail já saiu, o Resend recusa e nada muda.
export async function cancelRecoveryEmails(supabase: Supabase, email: string | undefined): Promise<void> {
  try {
    const cfg = config();
    if (!cfg || !email) return;
    const { data: rows } = await supabase
      .from("pix_recovery_emails")
      .select("order_id,resend_id")
      .eq("email", email.toLowerCase())
      .eq("status", "scheduled")
      .returns<{ order_id: string; resend_id: string | null }[]>();
    for (const row of rows ?? []) {
      let note: string | null = null;
      if (row.resend_id) {
        const response = await fetch(`https://api.resend.com/emails/${row.resend_id}/cancel`, {
          method: "POST",
          headers: { Authorization: `Bearer ${cfg.apiKey}` },
          signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
        });
        if (!response.ok) note = `cancelamento no Resend: HTTP ${response.status} (talvez já enviado)`;
      }
      await supabase.from("pix_recovery_emails").update({ status: "canceled", note }).eq("order_id", row.order_id);
    }
  } catch (err) {
    console.error("[pixRecovery] falhou ao cancelar:", err instanceof Error ? err.message : err);
  }
}
