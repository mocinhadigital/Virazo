import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/billing/stripe";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { findPlanByStripePriceId } from "@/lib/billing/plans";

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

  // Defesa contra reentrega/reprocessamento: reivindica o event.id antes de
  // qualquer outra lógica. Se o Stripe reenviar o MESMO evento, a segunda
  // chamada não encontra vaga nenhuma e o processamento é pulado inteiro.
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
        if (!userId || !session.subscription) break;

        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        const priceId = subscription.items.data[0]?.price.id;
        const plan = priceId ? findPlanByStripePriceId(priceId) : undefined;
        if (!plan) break;

        const { error } = await supabase.rpc("apply_subscription_plan", {
          p_user_id: userId,
          p_plan: plan.key,
          p_stripe_customer_id: subscription.customer as string,
          p_stripe_subscription_id: subscription.id,
          p_status: "active",
          p_current_period_end: currentPeriodEndIso(subscription),
        });
        if (error) console.error("[webhooks/stripe] apply_subscription_plan falhou:", error);
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoiceSubscriptionId(invoice);
        if (!subscriptionId) break;

        // A ativação inicial já foi aplicada em checkout.session.completed —
        // só reaplica em renovações.
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

        const { error } = await supabase.rpc("apply_subscription_plan", {
          p_user_id: userId,
          p_plan: plan.key,
          p_stripe_customer_id: subscription.customer as string,
          p_stripe_subscription_id: subscription.id,
          p_status: "active",
          p_current_period_end: currentPeriodEndIso(subscription),
        });
        if (error) console.error("[webhooks/stripe] apply_subscription_plan (renovação) falhou:", error);
        break;
      }

      case "customer.subscription.updated": {
        // Cobre alteração de plano (upgrade/downgrade direto na Stripe),
        // renovação (current_period_end novo), inadimplência (status vira
        // past_due/unpaid) e qualquer outra mudança de status que não seja
        // a exclusão definitiva (essa continua em customer.subscription.deleted).
        // Sempre faz upsert pelo mesmo stripe_subscription_id — nunca cria
        // registro novo nem apaga o anterior, só atualiza plan/status/
        // current_period_end (apply_subscription_plan, migration 0019).
        const subscription = event.data.object as Stripe.Subscription;
        const priceId = subscription.items.data[0]?.price.id;
        const plan = priceId ? findPlanByStripePriceId(priceId) : undefined;
        if (!plan) break;

        const customer = await stripe.customers.retrieve(subscription.customer as string);
        const userId =
          typeof customer !== "string" && !customer.deleted
            ? (customer.metadata.supabase_user_id as string | undefined)
            : undefined;
        if (!userId) break;

        const { error } = await supabase.rpc("apply_subscription_plan", {
          p_user_id: userId,
          p_plan: plan.key,
          p_stripe_customer_id: subscription.customer as string,
          p_stripe_subscription_id: subscription.id,
          p_status: mapStripeStatus(subscription.status),
          p_current_period_end: currentPeriodEndIso(subscription),
        });
        if (error) console.error("[webhooks/stripe] apply_subscription_plan (subscription.updated) falhou:", error);
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

// public.subscriptions.status só aceita 'active'/'canceled'/'past_due'/
// 'incomplete' (migration 0019/0017) — a Stripe tem mais estados possíveis
// (trialing, unpaid, incomplete_expired, paused). Mapeia pro mais próximo,
// sempre optando por negar acesso (past_due) em caso de status desconhecido
// — mais seguro que liberar geração por engano.
function mapStripeStatus(status: Stripe.Subscription.Status): "active" | "canceled" | "past_due" | "incomplete" {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
      return "canceled";
    case "incomplete":
    case "incomplete_expired":
      return "incomplete";
    default:
      return "past_due";
  }
}
