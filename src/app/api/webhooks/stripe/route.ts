import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/billing/stripe";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { findPlanByStripePriceId, billingIntervalFromPriceId } from "@/lib/billing/plans";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("[webhooks/stripe] assinatura inválida:", err);
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        if (!userId || !session.subscription) break;

        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        const priceId = subscription.items.data[0]?.price.id;
        const plan = priceId ? findPlanByStripePriceId(priceId) : undefined;
        if (!plan || !priceId) break;

        const quantity = subscription.items.data[0]?.quantity ?? 1;

        const { error } = await supabase.rpc("apply_subscription_payment", {
          p_user_id: userId,
          p_plan: plan.key,
          p_billing_interval: billingIntervalFromPriceId(plan, priceId),
          p_stripe_customer_id: subscription.customer as string,
          p_stripe_subscription_id: subscription.id,
          p_status: "active",
          p_current_period_end: currentPeriodEndIso(subscription),
          p_credits_to_add: plan.creditsPerMonth * quantity,
          p_quantity: quantity,
        });
        if (error) console.error("[webhooks/stripe] apply_subscription_payment falhou:", error);
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoiceSubscriptionId(invoice);
        if (!subscriptionId) break;

        // A primeira fatura já foi creditada em checkout.session.completed —
        // só credita de novo em renovações.
        if (invoice.billing_reason === "subscription_create") break;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const customer = await stripe.customers.retrieve(subscription.customer as string);
        const userId =
          typeof customer !== "string" && !customer.deleted
            ? (customer.metadata.supabase_user_id as string | undefined)
            : undefined;
        if (!userId) break;

        const priceId = subscription.items.data[0]?.price.id;
        const plan = priceId ? findPlanByStripePriceId(priceId) : undefined;
        if (!plan || !priceId) break;

        const quantity = subscription.items.data[0]?.quantity ?? 1;

        const { error } = await supabase.rpc("apply_subscription_payment", {
          p_user_id: userId,
          p_plan: plan.key,
          p_billing_interval: billingIntervalFromPriceId(plan, priceId),
          p_stripe_customer_id: subscription.customer as string,
          p_stripe_subscription_id: subscription.id,
          p_status: "active",
          p_current_period_end: currentPeriodEndIso(subscription),
          p_credits_to_add: plan.creditsPerMonth * quantity,
          p_quantity: quantity,
        });
        if (error) console.error("[webhooks/stripe] apply_subscription_payment (renovação) falhou:", error);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const { error } = await supabase.rpc("cancel_subscription", {
          p_stripe_subscription_id: subscription.id,
        });
        if (error) console.error("[webhooks/stripe] cancel_subscription falhou:", error);
        break;
      }
    }
  } catch (err) {
    console.error("[webhooks/stripe] falhou ao processar evento:", err);
    return NextResponse.json({ error: "Erro ao processar evento." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

function currentPeriodEndIso(subscription: Stripe.Subscription): string {
  const periodEnd = subscription.items.data[0]?.current_period_end;
  return new Date((periodEnd ?? 0) * 1000).toISOString();
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const sub = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription;
  if (!sub) return null;
  return typeof sub === "string" ? sub : sub.id;
}
