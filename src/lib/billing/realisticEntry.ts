import "server-only";
import type { User } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

// "Entrou pelo link do Vídeo Realista" (virazo.app/realista): fica gravado nos dados da conta
// (user_metadata.entry_source), valendo em qualquer aparelho e sem migration. É o que faz o
// painel NÃO abrir o pop-up obrigatório de planos para quem veio comprar só o Vídeo Realista.
export const REALISTIC_ENTRY_SOURCE = "realista";

export function isRealisticEntry(user: Pick<User, "user_metadata">): boolean {
  return (user.user_metadata as { entry_source?: string } | undefined)?.entry_source === REALISTIC_ENTRY_SOURCE;
}

// Marca a conta (uma vez só; nunca sobrescreve uma origem que já exista). Nunca lança: se
// falhar, a pessoa só vê o painel como qualquer conta sem plano.
export async function markRealisticEntry(user: Pick<User, "id" | "user_metadata">): Promise<void> {
  try {
    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
    if (metadata.entry_source) return;
    const { error } = await createServiceRoleClient().auth.admin.updateUserById(user.id, {
      user_metadata: { ...metadata, entry_source: REALISTIC_ENTRY_SOURCE },
    });
    if (error) console.error("[realista] não foi possível marcar a origem da conta:", error.message);
  } catch (err) {
    console.error("[realista] falha ao marcar a origem da conta:", err instanceof Error ? err.message : err);
  }
}
