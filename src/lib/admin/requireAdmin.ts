import "server-only";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

// Id do usuário logado SE ele estiver em admin_users; null para qualquer
// outra pessoa (inclusive sem login). admin_users não tem policy nenhuma —
// só o service_role lê, aqui no servidor, depois de saber quem está logado
// pela sessão.
export async function getAdminUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return (await isAdminUserId(user.id)) ? user.id : null;
}

// Mesma checagem para quem já sabe o id (o layout do dashboard acabou de
// ler o usuário). Só decide se o link do painel aparece no menu — qualquer
// falha vale "não é admin" e nunca derruba a página. A proteção das páginas
// admin em si continua sendo feita nelas (getAdminUserId / função do banco).
export async function isAdminUserId(userId: string): Promise<boolean> {
  try {
    const { data, error } = await createServiceRoleClient()
      .from("admin_users")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.error("[admin] falha ao conferir admin_users:", error.message);
      return false;
    }
    return !!data;
  } catch (err) {
    console.error("[admin] falha ao conferir admin_users:", err instanceof Error ? err.message : err);
    return false;
  }
}
