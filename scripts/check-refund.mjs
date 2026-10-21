// Consulta SOMENTE LEITURA: depois de um reembolso/cancelamento na Cakto,
// mostra se o webhook entregou o evento, como foi processado e como ficaram
// o plano e os créditos do cliente. Não altera nada no banco.
//
// Uso:  node scripts/check-refund.mjs <email> [codigo-do-pedido]
// Ex.:  node scripts/check-refund.mjs cliente@gmail.com 558yKAx
//
// O código do pedido (refId, ex. "558yKAx", ou o id longo) é opcional: serve
// para achar o evento mesmo se o e-mail vier diferente no aviso da Cakto.
// Precisa de NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
const orderRef = process.argv[3]?.trim().toLowerCase();
if (!email) {
  console.error("Uso: node scripts/check-refund.mjs <email> [codigo-do-pedido]");
  process.exit(1);
}

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const REFUND_EVENTS = new Set(["refund", "chargeback"]);
const CANCEL_EVENTS = new Set(["subscription_canceled"]);
const fmt = (iso) => (iso ? iso.slice(0, 19).replace("T", " ") + " UTC" : "-");
const ok = (cond) => (cond ? "✅" : "❌");

const { data: userId } = await supabase.rpc("find_user_id_by_email", { p_email: email });

// 1) Eventos da Cakto deste cliente (por e-mail ou pelo código do pedido).
const { data: all, error } = await supabase
  .from("cakto_events")
  .select("id, event, status, email, order_id, received_at, processed_at, error_message, payload")
  .order("id", { ascending: false })
  .limit(1000);
if (error) throw new Error(error.message);

const mine = all.filter((r) => {
  const text = JSON.stringify(r.payload ?? {}).toLowerCase();
  return (r.email ?? "").toLowerCase() === email || text.includes(email) || (orderRef && text.includes(orderRef));
});

console.log(`\n=== ${email}${orderRef ? ` (pedido ${orderRef})` : ""} ===`);
console.log(`Consulta feita em ${fmt(new Date().toISOString())}\n`);

console.log("1) EVENTOS DA CAKTO RECEBIDOS (mais recentes primeiro)");
if (mine.length === 0) console.log("   nenhum evento deste cliente no log");
for (const r of mine.slice(0, 12)) {
  const d = r.payload?.data ?? {};
  console.log(
    `   #${r.id} ${r.event.padEnd(22)} ${r.status.padEnd(10)} recebido ${fmt(r.received_at)}` +
      (d.status ? ` | pedido na Cakto: ${d.status}` : "") +
      (r.error_message ? `\n        mensagem: ${r.error_message}` : ""),
  );
}

const refundEvents = mine.filter((r) => REFUND_EVENTS.has(r.event));
const cancelEvents = mine.filter((r) => CANCEL_EVENTS.has(r.event));
const manual = mine.filter((r) => r.event === "manual_refund_revoke");
const cron = mine.filter((r) => r.event === "cron_deactivated");

// 2) Situação atual da conta.
console.log("\n2) SITUAÇÃO ATUAL NO VIRAZO");
let subs = [];
let credits = null;
if (!userId) {
  console.log("   conta não existe (excluída ou nunca criada)");
} else {
  const { data: p } = await supabase.from("profiles").select("credits").eq("id", userId).maybeSingle();
  const { data: s } = await supabase
    .from("subscriptions")
    .select("plan, status, stripe_subscription_id, created_at, updated_at, current_period_end")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  credits = p?.credits ?? null;
  subs = s ?? [];
  console.log(`   créditos: ${credits}`);
  if (subs.length === 0) console.log("   assinaturas: nenhuma");
  for (const x of subs) {
    console.log(
      `   assinatura ${x.plan} -> ${x.status} | criada ${fmt(x.created_at)} | última mudança ${fmt(x.updated_at)} | ${x.stripe_subscription_id}`,
    );
  }
}

const { data: pending } = await supabase
  .from("cakto_pending_purchases")
  .select("event, action, applied_at, created_at")
  .ilike("email", email);
if ((pending ?? []).length) {
  console.log(`   pendências (e-mail sem conta na hora do evento): ${JSON.stringify(pending)}`);
}

// 3) Veredito.
console.log("\n3) VEREDITO");
const hasActive = subs.some((x) => x.status === "active");
const lastRefund = refundEvents[0];
const lastCancel = cancelEvents[0];

if (!lastRefund && !lastCancel) {
  console.log(`   ${ok(false)} O webhook NÃO entregou evento de reembolso/chargeback/cancelamento deste cliente.`);
  if (cron[0]) console.log(`   ℹ️  A checagem diária desativou a assinatura em ${fmt(cron[0].received_at)}.`);
  else console.log("   ℹ️  Sem evento do webhook, o plano só sai na checagem diária (≈09:25 UTC) ou manualmente.");
} else {
  const e = lastRefund ?? lastCancel;
  console.log(`   ${ok(true)} Evento recebido: ${e.event} em ${fmt(e.received_at)}.`);
  console.log(`   ${ok(e.status === "processed")} Status do processamento: ${e.status}${e.error_message ? ` (${e.error_message})` : ""}`);
  if (e.status === "ignored") {
    console.log("      -> 'ignored' = a Cakto ainda não confirmava o reembolso pela API (ou e-mail/ pedido não bateu). Nada foi alterado; a checagem diária completa.");
  }
  if (e.status === "duplicate") console.log("      -> 'duplicate' = o mesmo aviso já tinha sido aplicado antes.");
  if (e.status === "pending_user") console.log("      -> 'pending_user' = não havia conta com esse e-mail.");
}
if (userId) {
  const expectInactive = !!(lastRefund || lastCancel);
  console.log(
    `   ${expectInactive ? ok(!hasActive) : "ℹ️ "} Plano ativo agora: ${hasActive ? "SIM" : "não"}` +
      (expectInactive ? "" : " (sem evento de reembolso/cancelamento, não era esperado mudar)"),
  );
  if (lastRefund) console.log(`   ${ok(credits === 0)} Créditos zerados: ${credits === 0 ? "sim" : `não (${credits})`}`);
  else if (lastCancel) console.log("   ℹ️  Cancelamento comum não zera créditos (só reembolso/chargeback zeram).");
}
if (manual[0]) console.log(`   ⚠️  Houve intervenção MANUAL em ${fmt(manual[0].received_at)} (manual_refund_revoke).`);
const auto = lastRefund?.status === "processed" && userId && !hasActive && !manual[0];
if (auto) console.log("   ✅ Resultado: a automação funcionou sozinha.");
console.log("");
