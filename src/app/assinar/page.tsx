import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { claimCaktoPendingPurchases, getCaktoCheckoutUrls } from "@/lib/billing/cakto";
import { parsePlanKey } from "@/lib/billing/selectedPlan";
import CheckoutRedirect from "@/components/checkout/CheckoutRedirect";

export const metadata: Metadata = {
  title: "Pagamento — Virazo",
  robots: { index: false },
};

// Ponte entre o plano escolhido em /planos e o checkout da Cakto:
// 1. plano inválido → volta para /planos;
// 2. sem login → cadastro/login, lembrando o plano;
// 3. já tem plano ativo → painel (nunca abre um segundo checkout);
// 4. senão → o MESMO link de checkout da Cakto que o pop-up de planos usa.
export default async function AssinarPage({
  searchParams,
}: {
  searchParams: Promise<{ plano?: string | string[] }>;
}) {
  const { plano } = await searchParams;
  const plan = parsePlanKey(plano);
  if (!plan) redirect("/planos");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?mode=signup&plano=${plan}`);

  // Mesma etapa que o dashboard faz ao abrir: compra da Cakto feita com este
  // e-mail antes de a conta existir vira plano ativo antes da checagem
  // abaixo — senão a pessoa seria mandada pagar de novo.
  await claimCaktoPendingPurchases(user);

  const { data: activeSubscription, error: subscriptionError } = await supabase
    .from("subscriptions")
    .select("plan")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (subscriptionError) console.error("[/assinar] falha ao ler assinatura:", subscriptionError.message);
  // Na dúvida (erro de leitura), também não abre checkout novo.
  if (activeSubscription || subscriptionError) redirect("/dashboard");

  // null = Cakto não configurada (ex.: ambiente local) — o painel abre o
  // pop-up de planos, que segue pelo provedor configurado.
  const checkoutUrls = getCaktoCheckoutUrls(user.email);
  if (!checkoutUrls) redirect("/dashboard");

  return <CheckoutRedirect plan={plan} checkoutUrl={checkoutUrls[plan]} />;
}
