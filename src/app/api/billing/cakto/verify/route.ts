import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { syncCaktoPaymentsForUser } from "@/lib/billing/caktoSync";

export const runtime = "nodejs";

// Verificação sob demanda de pagamento na Cakto para o usuário LOGADO:
// dashboard sem plano, volta do checkout e botão "Já paguei" do pop-up de
// planos. O e-mail consultado é sempre o da sessão — nunca algo enviado
// pelo navegador. O limite de 1 consulta a cada 30s fica em
// syncCaktoPaymentsForUser.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  // Plano já ativo (ex.: o aviso da Cakto — webhook — chegou antes de a tela
  // perguntar): responde com ele. Sem isto, a verificação dizia "pagamento não
  // encontrado" (o pedido já estava aplicado) e a tela ficava achando que o
  // cliente não tinha plano.
  const { data: active } = await supabase
    .from("subscriptions")
    .select("plan")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ plan: string }>();
  if (active?.plan) return NextResponse.json({ status: "activated", plan: active.plan });

  try {
    const result = await syncCaktoPaymentsForUser(user);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/billing/cakto/verify] falhou:", err);
    return NextResponse.json(
      { error: "Não foi possível verificar o pagamento agora. Tente de novo em instantes." },
      { status: 500 },
    );
  }
}
