import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { stripe } from "@/lib/billing/stripe";

export const runtime = "nodejs";

// Resumo mínimo de uma Checkout Session: só quanto foi pago e em qual
// moeda. Serve ao Purchase do Pixel na volta do checkout.
//
// Por que não mandar o valor na própria URL de retorno: qualquer pessoa
// editaria o número na barra de endereço e envenenaria o relatório de
// campanha — e, pior que o relatório, o otimizador de lances da Meta, que
// aprende com esse valor. O valor é sempre relido da Stripe.
//
// A sessão tem que ser do usuário logado, ou a resposta é 403. Sem essa
// checagem qualquer pessoa autenticada poderia varrer session_id alheios e
// descobrir quanto os outros pagaram.
//
// Rota apenas de leitura: não cria, não altera e não cancela nada na
// Stripe nem no Supabase.
export async function GET(request: Request) {
  try {
    const sessionId = new URL(request.url).searchParams.get("session_id");
    if (!sessionId) {
      return NextResponse.json({ error: "session_id ausente." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // client_reference_id é gravado com o id do Supabase na criação da
    // sessão (create-subscription), então é a prova de propriedade.
    if (session.client_reference_id !== user.id) {
      return NextResponse.json({ error: "Sessão não encontrada." }, { status: 403 });
    }

    return NextResponse.json({
      // 'unpaid' (pagamento assíncrono pendente) e 'no_payment_required'
      // (cupom de 100%) não são receita — o cliente decide não disparar.
      paid: session.payment_status === "paid",
      // amount_total vem em centavos; a Meta espera a unidade monetária.
      value: session.amount_total == null ? null : session.amount_total / 100,
      currency: session.currency ? session.currency.toUpperCase() : null,
    });
  } catch (err) {
    console.error("[/api/checkout/session-summary] falhou:", err);
    return NextResponse.json({ error: "Não foi possível ler a sessão." }, { status: 500 });
  }
}
