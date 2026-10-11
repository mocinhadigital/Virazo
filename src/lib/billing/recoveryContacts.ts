import "server-only";
import { createHash } from "node:crypto";
import type { createServiceRoleClient } from "@/utils/supabase/service-role";

// Quem já foi contatado pela recuperação de checkout (tabela
// recovery_contacts, migration 0027). Só o hash do e-mail é guardado.

type Supabase = ReturnType<typeof createServiceRoleClient>;

export const RECONTACT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export function hashEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

// Hashes contatados dentro do intervalo de espera. null = não foi possível
// consultar (ex.: tabela ainda não criada) — quem chama decide o que fazer.
export async function loadRecentlyContacted(supabase: Supabase): Promise<Set<string> | null> {
  const since = new Date(Date.now() - RECONTACT_COOLDOWN_MS).toISOString();
  const { data, error } = await supabase.from("recovery_contacts").select("email_hash").gte("contacted_at", since);
  if (error) {
    console.error("[recuperacao] recovery_contacts indisponível:", error.message);
    return null;
  }
  return new Set((data ?? []).map((r) => r.email_hash as string));
}

export async function recordContacted(supabase: Supabase, emails: string[], adminUserId: string): Promise<number> {
  const rows = [...new Set(emails.map(hashEmail))].map((email_hash) => ({ email_hash, contacted_by: adminUserId }));
  if (rows.length === 0) return 0;
  const { error } = await supabase.from("recovery_contacts").insert(rows);
  if (error) throw new Error(`falha ao registrar contatos: ${error.message}`);
  return rows.length;
}
