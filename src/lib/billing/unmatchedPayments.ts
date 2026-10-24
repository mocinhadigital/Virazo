import "server-only";
import type { PlanKey } from "@/lib/billing/plans";
import { PLANS } from "@/lib/billing/plans";
import type { Supabase } from "@/lib/billing/caktoEvents";

// Pagamento aprovado na Cakto cujo e-mail não tem conta no Virazo: grava em
// cakto_unmatched_payments (migration 0031) e avisa por e-mail para o
// administrador ativar manualmente. NUNCA lança: o webhook já guardou a
// compra em cakto_pending_purchases, e uma falha aqui (tabela ainda não
// criada, e-mail fora do ar) não pode derrubar nem mudar o resultado dele.
//
// E-mail via Resend (https://resend.com), chamada HTTP direta, sem
// dependência nova. Variáveis (Vercel):
// - RESEND_API_KEY         obrigatória para enviar (sem ela só grava a linha);
// - UNMATCHED_ALERT_TO     destinatário (padrão: mocinhadigital@gmail.com);
// - ALERT_EMAIL_FROM       remetente (padrão: "Virazo <onboarding@resend.dev>",
//                          que só entrega para o dono da conta Resend).

const DEFAULT_ALERT_TO = "mocinhadigital@gmail.com";
const DEFAULT_FROM = "Virazo <onboarding@resend.dev>";
const EMAIL_TIMEOUT_MS = 4_000; // a Cakto espera até 8s pela resposta do webhook

export type UnmatchedPayment = {
  orderId: string;
  event: string;
  email: string;
  customerName?: string;
  customerPhone?: string;
  plan: PlanKey;
  productName?: string;
  refId?: string;
  amount?: number;
  caktoEventId?: number;
};

export async function recordUnmatchedPayment(supabase: Supabase, payment: UnmatchedPayment): Promise<void> {
  try {
    // ignoreDuplicates: reenvio do mesmo pedido não grava de novo — e, sem
    // linha nova, também não manda e-mail de novo.
    const { data: inserted, error } = await supabase
      .from("cakto_unmatched_payments")
      .upsert(
        {
          order_id: payment.orderId,
          event: payment.event,
          email: payment.email,
          customer_name: payment.customerName ?? null,
          customer_phone: payment.customerPhone ?? null,
          plan: payment.plan,
          product_name: payment.productName ?? null,
          ref_id: payment.refId ?? null,
          amount: payment.amount ?? null,
          cakto_event_id: payment.caktoEventId ?? null,
        },
        { onConflict: "order_id", ignoreDuplicates: true },
      )
      .select("id");

    if (error) {
      console.error("[billing/unmatched] falha ao gravar pagamento sem conta:", error.message);
      return;
    }
    const row = inserted?.[0];
    if (!row) return; // já existia (reenvio) — não avisa de novo

    const result = await sendAlertEmail(payment);
    const { error: updateError } = await supabase
      .from("cakto_unmatched_payments")
      .update(
        result.ok
          ? { notified_at: new Date().toISOString(), notify_error: null }
          : { notify_error: result.error.slice(0, 500) },
      )
      .eq("id", row.id);
    if (updateError) console.error("[billing/unmatched] falha ao registrar o envio:", updateError.message);
  } catch (err) {
    console.error("[billing/unmatched] erro inesperado:", err instanceof Error ? err.message : err);
  }
}

export function buildAlertEmail(payment: UnmatchedPayment): { subject: string; text: string } {
  const planName = PLANS[payment.plan]?.name ?? payment.plan;
  const lines = [
    "Entrou um pagamento aprovado na Cakto, mas o e-mail do comprador não tem conta no Virazo.",
    "",
    `E-mail:   ${payment.email}`,
    `Nome:     ${payment.customerName || "(não informado)"}`,
    `Telefone: ${payment.customerPhone || "(não informado)"}`,
    `Plano:    ${planName}${payment.amount != null ? ` (R$ ${payment.amount})` : ""}`,
    `Pedido:   ${payment.refId ? `${payment.refId} — ` : ""}${payment.orderId}`,
    "",
    "O que fazer:",
    "- Se a pessoa criar a conta com ESTE e-mail, o plano é liberado sozinho.",
    "- Se ela criou a conta com OUTRO e-mail (o mais comum), ative o plano manualmente na conta certa.",
    "- A lista completa fica na tabela cakto_unmatched_payments do Supabase.",
  ];
  return {
    subject: `Pagamento sem conta no Virazo: ${planName} — ${payment.email}`,
    text: lines.join("\n"),
  };
}

async function sendAlertEmail(payment: UnmatchedPayment): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY não configurada — e-mail não enviado" };

  const { subject, text } = buildAlertEmail(payment);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.ALERT_EMAIL_FROM?.trim() || DEFAULT_FROM,
        to: [process.env.UNMATCHED_ALERT_TO?.trim() || DEFAULT_ALERT_TO],
        subject,
        text,
      }),
      signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { ok: false, error: `Resend HTTP ${response.status}: ${detail.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
