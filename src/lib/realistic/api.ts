import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import type { RealisticVideoRow } from "./row";

// Usuário da sessão + cliente de serviço. Toda rota de /api/realistic confere
// o dono do vídeo explicitamente (user_id) antes de tocar em qualquer linha,
// já que o cliente de serviço ignora a segurança por linha do banco.
export async function authenticate() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) } as const;
  }
  return { user, supabase, service: createServiceRoleClient() } as const;
}

export async function loadOwnedVideo(
  service: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  id: string,
): Promise<RealisticVideoRow | null> {
  const { data } = await service
    .from("realistic_videos")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle<RealisticVideoRow>();
  return data ?? null;
}

export async function getRealisticCredits(
  service: ReturnType<typeof createServiceRoleClient>,
  userId: string,
): Promise<number> {
  const { data } = await service
    .from("profiles")
    .select("realistic_credits")
    .eq("id", userId)
    .maybeSingle<{ realistic_credits: number }>();
  return data?.realistic_credits ?? 0;
}

export const NOT_FOUND = () => NextResponse.json({ error: "Vídeo realista não encontrado." }, { status: 404 });
