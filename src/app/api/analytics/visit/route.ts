import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { isAdminUserId } from "@/lib/admin/requireAdmin";
import { cleanVisitPayload, isBotUserAgent, isOwnerEmail, UNIQUE_VIOLATION } from "@/lib/analytics/visitRules";

// Registra 1 visita por pessoa por dia na página inicial (tabela page_visits,
// migration 0032). Chamada pelo navegador (components/analytics/VisitTracker).
//
// Não contam: robôs/prévias de link (pelo User-Agent) e as contas do dono —
// quem está logado como administrador ou com um dos e-mails do dono. O
// navegador do dono também se marca ao abrir o painel (VisitOptOut).
//
// Responde sempre 204 (sem revelar o motivo): rastreamento nunca pode
// quebrar nem atrasar a página, e a 2ª visita do dia cai no índice único do
// banco e é simplesmente descartada.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const visit = cleanVisitPayload(body);
  if (!visit) return NextResponse.json({ error: "Visita inválida." }, { status: 400 });

  if (isBotUserAgent(request.headers.get("user-agent"))) return new NextResponse(null, { status: 204 });

  try {
    // Logado como o dono ou como administrador: não conta.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user && (isOwnerEmail(user.email) || (await isAdminUserId(user.id)))) {
      return new NextResponse(null, { status: 204 });
    }

    const { error } = await createServiceRoleClient()
      .from("page_visits")
      .insert({
        visitor_id: visit.visitorId,
        utm_source: visit.utmSource,
        utm_campaign: visit.utmCampaign,
        fbclid: visit.fbclid,
        referrer: visit.referrer,
      });
    if (error && error.code !== UNIQUE_VIOLATION) {
      console.error("[analytics/visit] falha ao gravar visita:", error.message);
    }
  } catch (err) {
    console.error("[analytics/visit] erro inesperado:", err instanceof Error ? err.message : err);
  }

  return new NextResponse(null, { status: 204 });
}
