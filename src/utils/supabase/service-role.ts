import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente com privilégio total (ignora RLS) — usar SOMENTE em código que
// roda sem sessão de usuário, como o webhook da Stripe. Nunca importar
// isso em nada que rode no navegador ou que responda a uma requisição de
// um usuário comum.
export function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
