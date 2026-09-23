import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/billing/stripe";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { findPlanByStripePriceId } from "@/lib/billing/plans";
import { sendPurchaseEvent } from "@/lib/meta/capi";

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
        // LANÇA de propósito: a assinatura foi paga mas não ficou ativa.
        // Só logar e seguir para o 200 (como era antes) fazia a Stripe dar
        // o evento por entregue e encerrar o assunto — o cliente pagava e
        // continuava sem acesso, sem nenhuma nova tentativa em lugar nenhum.
        // O throw cai no catch da rota, que libera o event.id e responde
        // 500; aí a reentrega da Stripe reprocessa o evento de verdade.
        if (error) {
          throw new Error(
            `apply_subscription_plan (checkout.session.completed) falhou: ${error.message}`,
          );
        }

        // Purchase da Meta (Conversions API). Fica AQUI e em nenhum outro
        // case porque checkout.session.completed é o único que representa a
        // compra INICIAL: renovação chega como invoice.paid
        // (billing_reason=subscription_cycle) e troca de plano como
        // customer.subscription.updated — nenhum dos dois passa por este
        // bloco, então renovação nunca gera Purchase duplicado.
        //
        // Dedup em duas camadas: try_claim_stripe_event (no topo da rota) já
        // barra reentrega do MESMO event.id pela Stripe, e session.id como
        // event_id deixa a Meta descartar duplicata do lado dela — é também
        // o que casa este evento com o Purchase do Pixel no navegador, se
        // houver, em vez de contar a venda duas vezes.
        //
        // Vem DEPOIS do apply_subscription_plan de propósito: a ativação já
        // está gravada antes de qualquer chamada à Meta.
        await sendMetaPurchase(event, session, userId);
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
        // Mesma razão do checkout.session.completed: renovação paga que não
        // é aplicada deixa o assinante sem acesso até o fim do ciclo antigo.
        if (error) {
          throw new Error(`apply_subscription_plan (renovação) falhou: ${error.message}`);
        }
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
        // Idem: este case cobre troca de plano e mudança de status. Perder
        // a atualização em silêncio deixa o Supabase divergente da Stripe.
        if (error) {
          throw new Error(`apply_subscription_plan (subscription.updated) falhou: ${error.message}`);
        }
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
    // Devolve a vaga do event.id ANTES de pedir o reenvio. Sem isto o 500
    // abaixo não resolve nada: a Stripe reenviaria o MESMO event.id, que
    // cairia no guard de duplicata lá em cima e seria descartado sem ser
    // processado — pagamento confirmado na Stripe, assinatura inativa no
    // Supabase, e nenhuma tentativa restante.
    await releaseStripeEvent(supabase, event.id);
    return NextResponse.json({ error: "Erro ao processar evento." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// Apaga o event.id reivindicado no topo da rota, devolvendo o evento ao
// estado "nunca processado" — é o que torna a reentrega da Stripe capaz de
// REPROCESSAR em vez de bater no guard de duplicata.
//
// Só é chamada no caminho de falha, imediatamente antes de responder 500.
// No caminho de sucesso a reivindicação continua valendo, que é justamente
// o que impede o mesmo evento de ser aplicado duas vezes.
//
// Se a própria liberação falhar, não há o que fazer além de registrar: o
// comportamento degrada exatamente para o que era antes desta mudança (a
// reentrega será descartada como duplicata), nunca para algo pior. Por isso
// o erro é logado e não relançado — relançar aqui, dentro do catch, só
// trocaria uma falha por outra sem mudar o desfecho.
async function releaseStripeEvent(
  supabase: ReturnType<typeof createServiceRoleClient>,
  eventId: string,
): Promise<void> {
  const { error } = await supabase
    .from("stripe_processed_events")
    .delete()
    .eq("event_id", eventId);

  if (error) {
    console.error(
      `[webhooks/stripe] NÃO foi possível liberar o event.id=${eventId} — a reentrega da Stripe será descartada como duplicata e este evento precisa de conferência manual:`,
      error,
    );
    return;
  }

  console.warn(
    `[webhooks/stripe] event.id=${eventId} liberado após falha — aguardando reentrega da Stripe.`,
  );
}

// Envia o Purchase da compra inicial pra Meta a partir da Checkout Session
// já confirmada pela Stripe.
//
// Analytics NUNCA pode derrubar o webhook: sendPurchaseEvent já promete não
// lançar, mas este try/catch garante que nem um erro inesperado (ex.: leitura
// de campo em objeto malformado) escape pro catch externo — lá o retorno
// seria 500, a Stripe reenviaria o evento e, como o event.id já foi
// reivindicado, o reenvio seria descartado: uma falha de rastreamento viraria
// ruído de entrega. A ativação da assinatura, acima, já está feita e não é
// revertida em nenhum caminho daqui.
async function sendMetaPurchase(
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
  userId: string,
): Promise<void> {
  try {
    // Só o que foi efetivamente pago vira Purchase. Sessão com pagamento
    // assíncrono ainda pendente ('unpaid') ou isenta por cupom de 100%
    // ('no_payment_required') não é receita confirmada.
    if (session.payment_status !== "paid") return;
    if (session.amount_total == null || !session.currency) return;

    // Capturados no navegador em /api/checkout/create-subscription e
    // carregados na metadata da sessão — o IP/user agent desta requisição
    // são os da infra da Stripe, não os do comprador.
    const metadata = session.metadata ?? {};

    await sendPurchaseEvent({
      eventId: session.id,
      eventTime: event.created,
      // amount_total vem em centavos; a Meta espera a unidade monetária.
      value: session.amount_total / 100,
      currency: session.currency,
      eventSourceUrl: metadata.meta_event_source_url,
      email: session.customer_details?.email,
      externalId: userId,
      fbp: metadata.meta_fbp,
      fbc: metadata.meta_fbc,
      clientIpAddress: metadata.meta_client_ip,
      clientUserAgent: metadata.meta_user_agent,
    });
  } catch (err) {
    console.error("[webhooks/stripe] Purchase da Meta falhou (ignorado):", err);
  }
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
