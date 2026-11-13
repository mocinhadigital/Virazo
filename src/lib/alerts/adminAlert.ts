import "server-only";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

// Aviso por e-mail aos admins (tabela admin_users), no máximo 1 por hora por
// "tipo" (key). Nunca lança: avisar não pode atrapalhar a geração do vídeo.
//
// Precisa de (na Vercel):
//   RESEND_API_KEY       chave do Resend (a mesma do e-mail de recuperação de Pix)
//   RECOVERY_EMAIL_FROM  remetente (domínio verificado no Resend), o mesmo do
//                        e-mail de recuperação de Pix
// Sem isso o aviso vai só para o log do servidor (linha começando com "[ALERTA]").

const RESEND_TIMEOUT_MS = 8000;
const COOLDOWN_MINUTES = 60;

// Reserva local, usada só se o banco (migration 0041) ainda não tem claim_alert.
const lastSentLocal = new Map<string, number>();

async function claim(key: string): Promise<boolean> {
  try {
    const { data, error } = await createServiceRoleClient().rpc("claim_alert", {
      p_key: key,
      p_cooldown_minutes: COOLDOWN_MINUTES,
    });
    if (!error && typeof data === "boolean") return data;
  } catch {
    // cai no controle local
  }
  const now = Date.now();
  const last = lastSentLocal.get(key) ?? 0;
  if (now - last < COOLDOWN_MINUTES * 60_000) return false;
  lastSentLocal.set(key, now);
  return true;
}

async function adminEmails(): Promise<string[]> {
  try {
    const supabase = createServiceRoleClient();
    const { data: admins } = await supabase.from("admin_users").select("user_id");
    const ids = (admins ?? []).map((a: { user_id: string }) => a.user_id);
    if (ids.length === 0) return [];
    const { data: profiles } = await supabase.from("profiles").select("email").in("id", ids);
    return (profiles ?? [])
      .map((p: { email: string | null }) => p.email)
      .filter((e: string | null): e is string => !!e);
  } catch {
    return [];
  }
}

export async function notifyAdmins(key: string, subject: string, text: string): Promise<void> {
  try {
    console.error(`[ALERTA] ${subject} — ${text.replace(/\s+/g, " ").slice(0, 400)}`);
    if (!(await claim(key))) return; // já avisou na última hora

    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.RECOVERY_EMAIL_FROM?.trim();
    const to = await adminEmails();
    if (!apiKey || !from || to.length === 0) {
      console.error("[ALERTA] e-mail não enviado: falta RESEND_API_KEY, RECOVERY_EMAIL_FROM ou algum admin cadastrado.");
      return;
    }
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
    if (!response.ok) console.error(`[ALERTA] Resend recusou o e-mail (HTTP ${response.status}).`);
  } catch (err) {
    console.error("[ALERTA] falha ao enviar o aviso:", err instanceof Error ? err.message : err);
  }
}
