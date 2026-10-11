"use server";

import { redirect } from "next/navigation";
import { getAdminUserId } from "@/lib/admin/requireAdmin";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { recordContacted } from "@/lib/billing/recoveryContacts";

// "Marquei como enviados": registra (só o hash do e-mail) quem foi
// contatado, para sair da lista pelos próximos 7 dias. Não envia nada.
// Server Actions podem ser chamadas por qualquer um que saiba o endereço —
// por isso a checagem de administradora é refeita aqui, não só na página.

const MAX_EMAILS = 500;
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export async function markRecoveryContacted(formData: FormData): Promise<void> {
  const adminUserId = await getAdminUserId();
  if (!adminUserId) redirect("/dashboard");

  const raw = formData.get("emails");
  let emails: string[] = [];
  try {
    const parsed: unknown = JSON.parse(typeof raw === "string" ? raw : "[]");
    if (Array.isArray(parsed)) {
      emails = parsed
        .filter((e): e is string => typeof e === "string")
        .map((e) => e.trim().toLowerCase())
        .filter((e) => EMAIL_RE.test(e))
        .slice(0, MAX_EMAILS);
    }
  } catch {
    // corpo inválido: nada a registrar
  }

  let saved = 0;
  try {
    saved = await recordContacted(createServiceRoleClient(), emails, adminUserId);
  } catch (err) {
    console.error("[admin/recuperacao] falha ao marcar enviados:", err instanceof Error ? err.message : err);
    redirect("/dashboard/admin/recuperacao?erro=marcar");
  }
  redirect(`/dashboard/admin/recuperacao?marcados=${saved}`);
}
