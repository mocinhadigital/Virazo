import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { UTM_PARAMS } from "@/lib/analytics/conversion";

// Recebe os eventos do funil enviados pelo navegador (lib/analytics/
// conversion.ts) e grava via track_conversion_event (migration 0026), com a
// sessão do próprio usuário — sem service_role. A função do banco repete
// estas checagens; aqui elas só evitam uma ida ao banco à toa.
//
// signup_completed e purchase_completed NÃO passam por aqui: são gravados
// por gatilhos no banco.

const ALLOWED_EVENTS = new Set(["paywall_viewed", "plan_selected", "checkout_started"]);
const ALLOWED_PLANS = new Set(["daily", "pro", "ultra"]);
const METADATA_KEYS = ["pathname", ...UTM_PARAMS];
const MAX_METADATA_VALUE_LENGTH = 200;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const { event, plan, metadata } = body as { event?: unknown; plan?: unknown; metadata?: unknown };

  if (typeof event !== "string" || !ALLOWED_EVENTS.has(event)) {
    return NextResponse.json({ error: "Evento não permitido." }, { status: 400 });
  }
  if (plan != null && (typeof plan !== "string" || !ALLOWED_PLANS.has(plan))) {
    return NextResponse.json({ error: "Plano inválido." }, { status: 400 });
  }
  if (event !== "paywall_viewed" && plan == null) {
    return NextResponse.json({ error: "Plano obrigatório." }, { status: 400 });
  }

  // Só as chaves conhecidas (página e UTMs), como texto curto — nada além
  // disso chega ao banco.
  const cleanMetadata: Record<string, string> = {};
  if (metadata && typeof metadata === "object") {
    for (const key of METADATA_KEYS) {
      const value = (metadata as Record<string, unknown>)[key];
      if (typeof value === "string" && value) cleanMetadata[key] = value.slice(0, MAX_METADATA_VALUE_LENGTH);
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { error } = await supabase.rpc("track_conversion_event", {
    p_event_name: event,
    p_plan: plan ?? null,
    p_metadata: cleanMetadata,
  });
  if (error) {
    console.error("[analytics/track] track_conversion_event falhou:", error.message);
    return NextResponse.json({ error: "Não foi possível registrar o evento." }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
