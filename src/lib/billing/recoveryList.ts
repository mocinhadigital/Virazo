import "server-only";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { isCaktoApiConfigured, listCustomerOrders } from "@/lib/billing/caktoApi";
import { readCaktoContact } from "@/lib/billing/caktoContact";
import { hashEmail, loadRecentlyContacted } from "@/lib/billing/recoveryContacts";

// Lista de recuperação de checkout abandonado — SÓ LEITURA. Não grava nada,
// não envia nada: monta, na hora, a lista de quem começou a comprar e não
// comprou, para a administradora contatar manualmente.
//
// Entra: quem iniciou o checkout (funil do Virazo) ou abandonou/gerou Pix na
// Cakto (avisos do webhook, quando estiverem ativados) há mais de
// MIN_AGE e menos de MAX_AGE.
//
// Sai (nesta ordem):
//  1. conta de administradora;
//  2. qualquer assinatura no Supabase (ativa ou antiga — ex-cliente não
//     recebe "conclua sua compra");
//  3. compra registrada no funil (purchase_completed) ou pagamento já
//     aplicado vindo da Cakto (cakto_events processado);
//  4. pedido pago/reembolsado/contestado na Cakto com esse e-mail,
//     consultado AGORA na API — cobre quem pagou o Pix e ainda não voltou
//     ao site (e por isso ainda não tem assinatura no Supabase);
//  5. tentativa recente demais (Pix pode estar compensando);
//  6. já contatada nos últimos 7 dias (recovery_contacts).
// Se a consulta à Cakto não puder ser feita (sem credenciais, erro), a
// pessoa NÃO entra na lista para copiar — fica contada como "não
// verificada". Na dúvida, não se contata.

const HOUR_MS = 60 * 60 * 1000;
const MIN_AGE_MS = 2 * HOUR_MS;
const MAX_AGE_MS = 7 * 24 * HOUR_MS;
const CAKTO_CHECK_CONCURRENCY = 4;

// Avisos da Cakto que indicam compra começada e não concluída. Nomes
// desconhecidos simplesmente não aparecem — não quebram nada.
const CAKTO_ABANDON_EVENTS = ["checkout_abandonment", "pix_gerado", "boleto_gerado", "purchase_refused"];
// Avisos que significam pagamento já aplicado no Virazo.
const CAKTO_PAID_EVENTS = ["purchase_approved", "subscription_created", "subscription_renewed", "api_order_paid"];
const CAKTO_SETTLED_ORDER_STATUSES = ["paid", "refunded", "chargedback"];

const PLAN_LABEL: Record<string, string> = { daily: "Diário", diario: "Diário", pro: "Pro", ultra: "Ultra" };

export type RecoveryCandidate = {
  email: string;
  phone: string | null;
  plans: string[];
  lastAttemptAt: string;
  sources: ("funil" | "cakto")[];
};

export type RecoveryList = {
  generatedAt: string;
  caktoCheckAvailable: boolean;
  // false = não deu para ler quem já foi contatado (tabela ainda não
  // criada) — a página avisa e não oferece "marcar como enviados".
  duplicateProtection: boolean;
  ready: RecoveryCandidate[];
  counts: {
    inWindow: number;
    tooRecent: number;
    admin: number;
    hasSubscription: number;
    purchaseRecorded: number;
    paidInCakto: number;
    notVerified: number;
    recentlyContacted: number;
    // Avisos da Cakto em que não foi possível achar o e-mail — se for
    // maior que zero, o formato do aviso precisa ser revisto.
    caktoWithoutEmail: number;
  };
};

type Attempt = { email: string; at: number; plan?: string | null; phone?: string | null; source: "funil" | "cakto" };

export async function buildRecoveryList(): Promise<RecoveryList> {
  const supabase = createServiceRoleClient();
  const now = Date.now();
  const oldest = new Date(now - MAX_AGE_MS).toISOString();

  // Usuários (e-mail por id) e administradores.
  const users = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers falhou: ${error.message}`);
    for (const u of data.users) if (u.email) users.set(u.id, u.email.trim().toLowerCase());
    if (data.users.length < 1000) break;
  }
  const emailToUserId = new Map([...users].map(([id, email]) => [email, id]));

  const [admins, checkouts, purchases, subscriptions, caktoAbandons, caktoPaid] = await Promise.all([
    supabase.from("admin_users").select("user_id"),
    supabase
      .from("conversion_events")
      .select("user_id,plan,created_at")
      .eq("event_name", "checkout_started")
      .gte("created_at", oldest),
    supabase.from("conversion_events").select("user_id").eq("event_name", "purchase_completed"),
    supabase.from("subscriptions").select("user_id"),
    supabase
      .from("cakto_events")
      .select("email,received_at,payload")
      .in("event", CAKTO_ABANDON_EVENTS)
      .gte("received_at", oldest),
    supabase.from("cakto_events").select("email").in("event", CAKTO_PAID_EVENTS).not("processed_at", "is", null),
  ]);
  for (const r of [admins, checkouts, purchases, subscriptions, caktoAbandons, caktoPaid]) {
    if (r.error) throw new Error(`consulta falhou: ${r.error.message}`);
  }

  const adminIds = new Set((admins.data ?? []).map((a) => a.user_id as string));
  const adminEmails = new Set([...adminIds].map((id) => users.get(id)).filter(Boolean) as string[]);
  const subscribedIds = new Set((subscriptions.data ?? []).map((s) => s.user_id as string));
  const purchasedIds = new Set((purchases.data ?? []).map((p) => p.user_id as string));
  const caktoPaidEmails = new Set(
    (caktoPaid.data ?? []).map((c) => (c.email as string | null)?.trim().toLowerCase()).filter(Boolean) as string[],
  );

  // Todas as tentativas, por e-mail.
  const attempts: Attempt[] = [];
  for (const e of checkouts.data ?? []) {
    const email = users.get(e.user_id as string);
    if (email) attempts.push({ email, at: new Date(e.created_at as string).getTime(), plan: e.plan as string | null, source: "funil" });
  }
  let caktoWithoutEmail = 0;
  for (const c of caktoAbandons.data ?? []) {
    const contact = readCaktoContact(c.payload, c.email as string | null);
    if (!contact.email) {
      caktoWithoutEmail++;
      continue;
    }
    attempts.push({
      email: contact.email,
      at: new Date(c.received_at as string).getTime(),
      plan: contact.productName?.replace(/^Virazo\s+/i, "") ?? null,
      phone: contact.phone,
      source: "cakto",
    });
  }

  const byEmail = new Map<string, Attempt[]>();
  for (const a of attempts) byEmail.set(a.email, [...(byEmail.get(a.email) ?? []), a]);

  const counts = {
    inWindow: byEmail.size,
    tooRecent: 0,
    admin: 0,
    hasSubscription: 0,
    purchaseRecorded: 0,
    paidInCakto: 0,
    notVerified: 0,
    recentlyContacted: 0,
    caktoWithoutEmail,
  };
  const toVerify: RecoveryCandidate[] = [];
  const recentlyContacted = await loadRecentlyContacted(supabase);

  for (const [email, list] of byEmail) {
    const userId = emailToUserId.get(email);
    const last = Math.max(...list.map((a) => a.at));
    if (adminEmails.has(email) || (userId && adminIds.has(userId))) { counts.admin++; continue; }
    if (userId && subscribedIds.has(userId)) { counts.hasSubscription++; continue; }
    if ((userId && purchasedIds.has(userId)) || caktoPaidEmails.has(email)) { counts.purchaseRecorded++; continue; }
    if (now - last < MIN_AGE_MS) { counts.tooRecent++; continue; }
    if (recentlyContacted?.has(hashEmail(email))) { counts.recentlyContacted++; continue; }

    const plans = [...new Set(list.map((a) => (a.plan ? PLAN_LABEL[a.plan.toLowerCase()] ?? a.plan : null)).filter(Boolean) as string[])];
    toVerify.push({
      email,
      phone: list.find((a) => a.phone)?.phone ?? null,
      plans,
      lastAttemptAt: new Date(last).toISOString(),
      sources: [...new Set(list.map((a) => a.source))],
    });
  }

  // Última barreira: a própria Cakto, consultada agora.
  const caktoCheckAvailable = isCaktoApiConfigured();
  const ready: RecoveryCandidate[] = [];
  if (!caktoCheckAvailable) {
    counts.notVerified += toVerify.length;
  } else {
    for (let i = 0; i < toVerify.length; i += CAKTO_CHECK_CONCURRENCY) {
      const batch = toVerify.slice(i, i + CAKTO_CHECK_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (candidate) => {
          try {
            const orders = await listCustomerOrders(candidate.email, CAKTO_SETTLED_ORDER_STATUSES);
            const settled = orders.some(
              (o) => o.customer?.email?.trim().toLowerCase() === candidate.email && CAKTO_SETTLED_ORDER_STATUSES.includes(o.status ?? ""),
            );
            return settled ? "paid" : "ok";
          } catch (err) {
            console.error("[recuperacao] consulta à Cakto falhou:", err instanceof Error ? err.message : err);
            return "error";
          }
        }),
      );
      results.forEach((result, j) => {
        if (result === "ok") ready.push(batch[j]);
        else if (result === "paid") counts.paidInCakto++;
        else counts.notVerified++;
      });
    }
  }

  ready.sort((a, b) => (a.lastAttemptAt < b.lastAttemptAt ? 1 : -1));
  return {
    generatedAt: new Date(now).toISOString(),
    caktoCheckAvailable,
    duplicateProtection: recentlyContacted !== null,
    ready,
    counts,
  };
}
