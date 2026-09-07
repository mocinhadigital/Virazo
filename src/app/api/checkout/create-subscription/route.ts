import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { stripe } from "@/lib/billing/stripe";
import { PLANS, ONE_TIME_PACKAGE, type CheckoutItemKey } from "@/lib/billing/plans";

type Body = {
  item: CheckoutItemKey;
};

export async function POST(request: Request) {
  const body = (await request.json()) as Body;

  const plan = body.item === "starter" || body.item === "pro" ? PLANS[body.item] : undefined;
  const isOneTime = body.item === ONE_TIME_PACKAGE.key;

  if (!plan && !isOneTime) {
    return NextResponse.json({ error: "Item inválido." }, { status: 400 });
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

  // Cada assinatura é sempre 1 unidade — sem multiplicador de quantidade
  // (Starter/Pro não permitem multiplicar créditos comprando "2x").
  const session = await stripe.checkout.sessions.create({
    mode: isOneTime ? "payment" : "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: isOneTime ? ONE_TIME_PACKAGE.stripePriceId : plan!.stripePriceId, quantity: 1 }],
    success_url: `${origin}/dashboard?checkout=success`,
    cancel_url: `${origin}/dashboard?checkout=canceled`,
  });

  return NextResponse.json({ url: session.url });
}
