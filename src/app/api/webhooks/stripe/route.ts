import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/billing/stripe";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { findPlanByStripePriceId, ONE_TIME_PACKAGE } from "@/lib/billing/plans";

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

  // Defesa nº1 contra reentrega/reprocessamento: reivindica o event.id antes
  // de qualquer outra lógica. Se o Stripe reenviar o MESMO evento (retry
  // automático, replay manual no dashboard, etc.), a segunda chamada não
  // encontra vaga nenhuma e o processamento é pulado inteiro — nenhum
  // crédito é tocado duas vezes por causa de reentrega.
  const { data: claimed, error: claimError } = await supabase.rpc("try_claim_stripe_event", {
    p_event_id: event.id,
    p_event_type: event.type,
  });

  if (claimError) {
    console.error("[webhooks/stripe] falha ao reivindicar event.id:", claimError);
    return NextResponse.json({ error: "Erro ao processar evento." }, { status: 500 });
  }

  if (!claimed) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        if (!userId) break;

        if (session.mode === "payment") {
          // Pacote Avulso: pagamento único, soma crédito uma vez. Defesa
          // nº2, específica desta compra: grant_one_time_credits só credita
          // se esta stripe_checkout_session_id ainda não tiver sido usada —
          // uma nova compra legítima (nova session) sempre pode creditar de
          // novo, mas a MESMA session nunca credita duas vezes.
          const { data: granted, error } = await supabase.rpc("grant_one_time_credits", {
            p_user_id: userId,
            p_stripe_checkout_session_id: session.id,
            p_credits_to_add: ONE_TIME_PACKAGE.creditsGranted,
          });
          if (error) console.error("[webhooks/stripe] grant_one_time_credits falhou:", error);
          else if (!granted) console.log("[webhooks/stripe] session já creditada antes, ignorando:", session.id);
          break;
        }

        if (!session.subscription) break;

        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        const priceId = subscription.items.data[0]?.price.id;
        const plan = priceId ? findPlanByStripePriceId(priceId) : undefined;
        if (!plan) break;

        const { error } = await supabase.rpc("apply_subscription_credit_reset", {
          p_user_id: userId,
          p_plan: plan.key,
          p_stripe_customer_id: subscription.customer as string,
          p_stripe_subscription_id: subscription.id,
          p_status: "active",
          p_current_period_end: currentPeriodEndIso(subscription),
          p_credits_fixed: plan.creditsPerMonth,
        });
        if (error) console.error("[webhooks/stripe] apply_subscription_credit_reset falhou:", error);
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoiceSubscriptionId(invoice);
        if (!subscriptionId) break;

        // A primeira fatura já foi creditada em checkout.session.completed —
        // só reseta de novo em renovações.
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
        if (!plan) break;

        const { error } = await supabase.rpc("apply_subscription_credit_reset", {
          p_user_id: userId,
          p_plan: plan.key,
          p_stripe_customer_id: subscription.customer as string,
          p_stripe_subscription_id: subscription.id,
          p_status: "active",
          p_current_period_end: currentPeriodEndIso(subscription),
          p_credits_fixed: plan.creditsPerMonth,
        });
        if (error) console.error("[webhooks/stripe] apply_subscription_credit_reset (renovação) falhou:", error);
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
