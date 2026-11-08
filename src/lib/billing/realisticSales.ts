import "server-only";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { REALISTIC_PACKAGES, type RealisticPackageKey } from "@/lib/realistic/constants";
import { getRealisticProductIds } from "./realisticPackages";

export type RealisticSales = {
  count: number;
  totalCents: number;
  byPackage: Record<RealisticPackageKey, number>;
};

type EventRow = {
  order_id: string | null;
  email: string | null;
  product_id: string | null;
  received_at: string;
  payload: { data?: { amount?: unknown; paidAt?: unknown } } | null;
};

// Vendas dos pacotes de Vídeo Realista no período, lidas do log de eventos da
// Cakto (só leitura): pedidos pagos e aplicados, sem os reembolsados/estornados,
// sem avisos de teste (@example.com) e sem contas de administrador. Só deve ser
// chamada depois de confirmar que quem pede é administrador.
export async function getRealisticSales(since: Date): Promise<RealisticSales> {
  const products = getRealisticProductIds();
  const result: RealisticSales = { count: 0, totalCents: 0, byPackage: { "10": 0, "20": 0 } };
  if (products.length === 0) return result;

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("cakto_events")
    .select("order_id,email,product_id,received_at,payload")
    .like("idempotency_key", "activate:%")
    .eq("status", "processed")
    .not("processed_at", "is", null)
    .not("order_id", "is", null)
    .in(
      "product_id",
      products.map((p) => p.id),
    )
    .returns<EventRow[]>();
  if (error) throw new Error(error.message);

  const rows = (data ?? []).filter((r) => r.email && !r.email.toLowerCase().endsWith("@example.com"));

  const orderIds = [...new Set(rows.map((r) => r.order_id as string))];
  const refunded = new Set<string>();
  if (orderIds.length > 0) {
    const { data: refunds, error: refundError } = await supabase
      .from("cakto_events")
      .select("order_id")
      .in("event", ["refund", "chargeback"])
      .eq("status", "processed")
      .in("order_id", orderIds)
      .returns<{ order_id: string | null }[]>();
    if (refundError) throw new Error(refundError.message);
    for (const r of refunds ?? []) if (r.order_id) refunded.add(r.order_id);
  }

  // Contas de administrador são de teste: ficam fora, como no resto do painel.
  const { data: admins } = await supabase.from("admin_users").select("user_id").returns<{ user_id: string }[]>();
  const adminEmails = new Set<string>();
  if (admins && admins.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("email")
      .in(
        "id",
        admins.map((a) => a.user_id),
      )
      .returns<{ email: string | null }[]>();
    for (const p of profiles ?? []) if (p.email) adminEmails.add(p.email.toLowerCase());
  }

  const seen = new Set<string>();
  for (const row of rows) {
    const orderId = row.order_id as string;
    if (seen.has(orderId) || refunded.has(orderId)) continue;
    if (adminEmails.has((row.email as string).toLowerCase())) continue;
    const paidAtRaw = row.payload?.data?.paidAt;
    const paidAt = typeof paidAtRaw === "string" && !Number.isNaN(Date.parse(paidAtRaw)) ? new Date(paidAtRaw) : new Date(row.received_at);
    if (paidAt.getTime() < since.getTime()) continue;

    const key = products.find((p) => p.id === row.product_id)?.key;
    if (!key) continue;
    seen.add(orderId);
    const amount = Number(row.payload?.data?.amount);
    const listCents = REALISTIC_PACKAGES.find((p) => p.key === key)?.priceCents ?? 0;
    result.count += 1;
    result.byPackage[key] += 1;
    result.totalCents += Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : listCents;
  }
  return result;
}
