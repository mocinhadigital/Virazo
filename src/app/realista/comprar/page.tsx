import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { claimCaktoPendingPurchases } from "@/lib/billing/cakto";
import { getRealisticCheckoutUrls } from "@/lib/billing/realisticPackages";
import { markRealisticEntry } from "@/lib/billing/realisticEntry";
import { parseRealisticPackageKey } from "@/lib/billing/selectedRealisticPackage";
import RealisticCheckoutRedirect from "@/components/checkout/RealisticCheckoutRedirect";

export const metadata: Metadata = {
  title: "Pagamento — Virazo",
  robots: { index: false },
};

// Ponte entre o pacote escolhido em /realista e o checkout da Cakto:
// 1. pacote inválido → volta para /realista;
// 2. sem login → cadastro/login, lembrando o pacote;
// 3. com login → marca a conta como "veio do Vídeo Realista" (sem plano, o painel não abre o
//    pop-up de planos), aplica compras da Cakto feitas antes de a conta existir e segue para o
//    MESMO link de checkout do pacote que o pop-up do painel usa (e-mail já preenchido).
// Quem já tem plano também pode comprar créditos: nada aqui bloqueia assinante.
export default async function RealistaComprarPage({
  searchParams,
}: {
  searchParams: Promise<{ pacote?: string | string[] }>;
}) {
  const { pacote } = await searchParams;
  const packageKey = parseRealisticPackageKey(Array.isArray(pacote) ? pacote[0] : pacote);
  if (!packageKey) redirect("/realista");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?mode=signup&realista=${packageKey}`);

  const { data: activeSubscription } = await supabase
    .from("subscriptions")
    .select("plan")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  // Só quem NÃO tem plano é marcado como "veio do Realista" (assinante segue no painel normal).
  if (!activeSubscription) await markRealisticEntry(user);

  // Compra feita com este e-mail antes de a conta existir vira crédito/plano antes de seguir.
  await claimCaktoPendingPurchases(user);

  const metadata = user.user_metadata as { full_name?: string; name?: string } | undefined;
  const checkoutUrls = getRealisticCheckoutUrls(user.email, metadata?.full_name ?? metadata?.name);
  const checkoutUrl = checkoutUrls?.[packageKey];
  // Pacote sem link configurado (ou Cakto fora): o painel abre o pop-up de compra normal.
  if (!checkoutUrl) redirect("/dashboard");

  return <RealisticCheckoutRedirect packageKey={packageKey} checkoutUrl={checkoutUrl} />;
}
