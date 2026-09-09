import { NextResponse } from "next/server";
import type Stripe from "stripe";
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
// Status da Stripe que contam como "já tem assinatura Virazo" pra fins de
// bloquear uma segunda — inclui past_due (inadimplente ainda tem a
// subscription viva na Stripe, só não paga; deixar ele "assinar de novo"
// criaria uma segunda cobrança em vez de resolver a pendência).
const ACTIVE_STRIPE_STATUSES = new Set<Stripe.Subscription.Status>(["active", "trialing", "past_due"]);

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

    // Trava no banco contra 2 requisições da MESMA conta rodando ao mesmo
    // tempo (duplo clique, 2 abas, retry de rede) — sem isso, ambas podem
    // passar pela checagem abaixo antes de qualquer uma delas ter
    // terminado de criar/trocar a assinatura na Stripe. Expira sozinha em
    // 30s se a função cair no meio (migration 0020).
    const { data: lockAcquired, error: lockError } = await supabase.rpc(
      "claim_subscription_change_lock",
      { p_user_id: user.id },
    );
    if (lockError) {
      console.error("[/api/checkout/create-subscription] falha ao adquirir trava:", lockError);
      return NextResponse.json({ error: "Não foi possível iniciar o checkout." }, { status: 500 });
    }
    if (!lockAcquired) {
      return NextResponse.json(
        { error: "Já existe uma troca de plano em andamento para esta conta. Aguarde alguns segundos e tente novamente." },
        { status: 409 },
      );
    }

    try {
      // Reaproveita o customer da Stripe se o usuário já assinou antes.
      const { data: existing } = await supabase
        .from("subscriptions")
        .select("stripe_customer_id")
        .eq("user_id", user.id)
        .not("stripe_customer_id", "is", null)
        .order("created_at", { ascending: false })
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

      // Fonte de verdade pra "o usuário já tem assinatura ativa?" é a
      // própria Stripe agora, não o cache do Supabase — evita repetir o bug
      // real já visto em produção (2 linhas 'active' simultâneas no banco
      // por causa de 2 subscriptions criadas na Stripe).
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 10,
      });
      const currentSubscription = subscriptions.data.find((s) => ACTIVE_STRIPE_STATUSES.has(s.status));

      const dedupeWindow = Math.floor(Date.now() / 5000);
      const origin = request.headers.get("origin") ?? new URL(request.url).origin;

      if (!currentSubscription) {
        // Sem assinatura Virazo ativa — fluxo normal, sem mudança: cria 1
        // assinatura nova. Cada assinatura é sempre 1 unidade — sem
        // multiplicador de quantidade.
        const session = await stripe.checkout.sessions.create(
          {
            mode: "subscription",
            customer: customerId,
            client_reference_id: user.id,
            line_items: [{ price: plan.stripePriceId, quantity: 1 }],
            success_url: `${origin}/dashboard?checkout=success`,
            cancel_url: `${origin}/dashboard?checkout=canceled`,
          },
          { idempotencyKey: `checkout-new-${user.id}-${plan.key}-${dedupeWindow}` },
        );

        return NextResponse.json({ url: session.url });
      }

      const currentItem = currentSubscription.items.data[0];
      const currentPriceId = currentItem?.price.id;

      if (currentPriceId === plan.stripePriceId) {
        // Já está exatamente nesse plano — não cobra, não mexe em nada.
        return NextResponse.json({
          alreadyActive: true,
          message: `Você já está no plano ${plan.name}.`,
        });
      }

      // Já tem assinatura Virazo ativa com OUTRO plano: troca o price da
      // MESMA subscription em vez de criar uma segunda. O webhook
      // (customer.subscription.updated, já existente) é quem atualiza o
      // Supabase a partir do estado confirmado pela Stripe.
      await stripe.subscriptions.update(
        currentSubscription.id,
        {
          items: [{ id: currentItem.id, price: plan.stripePriceId }],
          proration_behavior: "create_prorations",
        },
        {
          idempotencyKey: `checkout-switch-${user.id}-${currentSubscription.id}-${plan.key}-${dedupeWindow}`,
        },
      );

      return NextResponse.json({ switched: true });
    } finally {
      const { error: releaseError } = await supabase.rpc("release_subscription_change_lock", {
        p_user_id: user.id,
      });
      if (releaseError) {
        console.error("[/api/checkout/create-subscription] falha ao liberar trava:", releaseError);
      }
    }
  } catch (err) {
    console.error("[/api/checkout/create-subscription] falhou:", err);
    const message = err instanceof Error ? err.message : "Não foi possível iniciar o checkout.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
