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

  // DIAGNÓSTICO TEMPORÁRIO — remover depois de localizar a causa do 404 nos
  // painéis admin. Não loga token/cookie/e-mail, só o id da sessão (UUID,
  // não é segredo) e o host do projeto Supabase (já é público via
  // NEXT_PUBLIC_SUPABASE_URL).
  const projectHost = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
    } catch {
      return "(NEXT_PUBLIC_SUPABASE_URL ausente/inválida)";
    }
  })();
  console.log("[diag admin] projectHost =", projectHost, "| session user.id =", user?.id ?? "(sem sessão)");

  if (!user) return null;

  const { data, error } = await createServiceRoleClient()
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  console.log("[diag admin] consulta admin_users -> error =", error?.message ?? null, "| encontrou linha =", !!data);

  if (error) {
    console.error("[admin] falha ao conferir admin_users:", error.message);
    return null;
  }
  return data ? user.id : null;
}
