import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { isAdminUserId } from "@/lib/admin/requireAdmin";
import { MAX_SCRIPT_REQUESTS_PER_DAY } from "./limits";

// Quem pode pedir roteiro: assinatura ativa (qualquer plano) ou admin. Pedir
// roteiro não gasta o limite de vídeos, mas gasta IA — não é de graça para quem
// nunca assinou.
export async function canRequestScripts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("subscriptions")
    .select("plan")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (data) return true;
  return isAdminUserId(userId);
}

// Conta 1 pedido de roteiro (escrever, refazer ou dividir a história) e diz se
// ainda cabe no teto do dia (migration 0043). Admin não tem teto.
export async function claimScriptRequest(
  userId: string,
  kind: "video" | "split" | "series",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const service = createServiceRoleClient();
  if (await isAdminUserId(userId)) return { ok: true };

  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count, error } = await service
    .from("script_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  if (error) {
    // Sem a tabela (migration ainda não rodada) ou banco instável: deixa passar em
    // vez de travar o cliente; o custo de um pedido é pequeno.
    console.warn("[script] não foi possível conferir o limite de pedidos:", error.message);
    return { ok: true };
  }
  if ((count ?? 0) >= MAX_SCRIPT_REQUESTS_PER_DAY) {
    return {
      ok: false,
      error: `Você já pediu ${MAX_SCRIPT_REQUESTS_PER_DAY} roteiros nas últimas 24 horas. Edite o roteiro que você já tem ou volte amanhã.`,
    };
  }
  const { error: insertError } = await service.from("script_requests").insert({ user_id: userId, kind });
  if (insertError) console.warn("[script] não foi possível registrar o pedido:", insertError.message);
  return { ok: true };
}
