import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { stripe } from "@/lib/billing/stripe";
import { PLANS, type PlanKey, type BillingInterval } from "@/lib/billing/plans";

type Body = {
  plan: PlanKey;
  interval: BillingInterval;
  quantity?: number;
};

export async function POST(request: Request) {
  const body = (await request.json()) as Body;
  const plan = PLANS[body.plan];
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
  const quantity = Math.max(1, Math.floor(body.quantity ?? 1));

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: plan.stripePriceId[body.interval], quantity }],
    success_url: `${origin}/dashboard?checkout=success`,
    cancel_url: `${origin}/dashboard?checkout=canceled`,
  });

  return NextResponse.json({ url: session.url });
}
