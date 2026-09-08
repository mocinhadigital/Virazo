import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { stripe } from "@/lib/billing/stripe";
import { PLANS, type PlanKey } from "@/lib/billing/plans";

type Body = {
  item: PlanKey;
};

// Stripe (ou a leitura do corpo da requisição) pode lançar por vários
// motivos — chave inválida, price_id de outro modo, rede, JSON malformado
// no corpo. Sem isso, uma exceção não tratada aqui sobe crua pro Next.js/
// Vercel, que responde sem corpo JSON válido — e é isso que produz
// "Unexpected end of JSON input" no frontend ao tentar `response.json()`.
// Por isso a rota inteira roda dentro de try/catch: TODO caminho sempre
// devolve um JSON válido, sucesso ou erro.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const plan = PLANS[body.item];

    if (!plan) {
      return NextResponse.json({ error: "Plano inválido." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    // Reaproveita o customer da Stripe se o usuário já assinou antes.
    const { data: existing } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .not("stripe_customer_id", "is", null)
      .limit(1)
      .maybeSingle();

    let customerId = existing?.stripe_customer_id ?? undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
    }

    const origin = request.headers.get("origin") ?? new URL(request.url).origin;

    // Cada assinatura é sempre 1 unidade — sem multiplicador de quantidade.
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      success_url: `${origin}/dashboard?checkout=success`,
      cancel_url: `${origin}/dashboard?checkout=canceled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[/api/checkout/create-subscription] falhou:", err);
    const message = err instanceof Error ? err.message : "Não foi possível iniciar o checkout.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
