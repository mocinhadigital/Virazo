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
