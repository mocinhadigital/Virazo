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

  const { data, error } = await createServiceRoleClient()
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    console.error("[admin] falha ao conferir admin_users:", error.message);
    return null;
  }
  return data ? user.id : null;
}
