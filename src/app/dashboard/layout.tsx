import { redirect } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import TopBar from "@/components/dashboard/TopBar";
import MobileNav from "@/components/dashboard/MobileNav";
import CreateVideoWizard from "@/components/dashboard/CreateVideoWizard";
import RealisticWizard from "@/components/dashboard/realistic/RealisticWizard";
import RealisticBuyModal from "@/components/dashboard/realistic/RealisticBuyModal";
import PlanPickerModalGate from "@/components/dashboard/PlanPickerModalGate";
import PurchaseTracker from "@/components/analytics/PurchaseTracker";
import CaktoPaymentVerifier from "@/components/dashboard/CaktoPaymentVerifier";
import { DashboardProvider } from "@/components/dashboard/DashboardContext";
import { mapVideoRow, type VideoRow } from "@/components/dashboard/videoMapping";
import { createClient } from "@/utils/supabase/server";
import type { PlanKey } from "@/lib/billing/plans";
import { claimCaktoPendingPurchases, getCaktoCheckoutUrls } from "@/lib/billing/cakto";
import { isCaktoApiConfigured } from "@/lib/billing/caktoApi";
import { getRealisticCheckoutUrls } from "@/lib/billing/realisticPackages";
import { areLongVideosEnabled } from "@/lib/video/featureFlags";
import { isAdminUserId } from "@/lib/admin/requireAdmin";
import VisitOptOut from "@/components/analytics/VisitOptOut";
import { isOwnerEmail } from "@/lib/analytics/visitRules";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Antes de ler a assinatura: se este e-mail comprou pela Cakto antes de
  // ter conta, o plano já aparece ativo neste mesmo carregamento.
  await claimCaktoPendingPurchases(user);

  // Vídeo "Gerando" há mais de 10 minutos já chega na tela como "Falhou",
  // com o botão "Tentar de novo" (migration 0025). Falhar aqui não impede
  // o dashboard de abrir.
  const { error: expireError } = await supabase.rpc("expire_stale_videos");
  if (expireError) console.error("Falha ao expirar vídeos travados:", expireError.message);

  const [
    isAdmin,
    { data: profile, error: profileError },
    { data: videoRows, error: videosError },
    { data: activeSubscription, error: subscriptionError },
    bonusResult,
    realisticResult,
  ] = await Promise.all([
    isAdminUserId(user.id),
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle()
      .returns<{ full_name: string | null }>(),
    supabase
      .from("videos")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .returns<VideoRow[]>(),
    supabase
      .from("subscriptions")
      .select("plan")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ plan: PlanKey }>(),
    // Saldo de vídeos de bônus do Pro (migration 0033). Se a coluna ainda não
    // existir, o erro é ignorado e o saldo vale 0 — o painel abre igual.
    supabase.from("profiles").select("bonus_videos").eq("id", user.id).maybeSingle<{ bonus_videos: number }>(),
    // Saldo de créditos do Vídeo Realista (migration 0035). Sem a coluna, vale 0.
    supabase
      .from("profiles")
      .select("realistic_credits")
      .eq("id", user.id)
      .maybeSingle<{ realistic_credits: number }>(),
  ]);

  if (profileError) console.error("Falha ao carregar perfil:", profileError.message);
  if (videosError) console.error("Falha ao carregar vídeos:", videosError.message);
  if (subscriptionError) console.error("Falha ao carregar assinatura:", subscriptionError.message);

  const initialVideos = (videoRows ?? []).map(mapVideoRow);
  const initialPlan = activeSubscription?.plan ?? null;
  // null (o normal hoje) = o modal segue criando a Checkout Session do Stripe.
  const metadata = user.user_metadata as { full_name?: string; name?: string } | undefined;
  const caktoCheckoutUrls = getCaktoCheckoutUrls(
    user.email,
    profile?.full_name ?? metadata?.full_name ?? metadata?.name,
  );
  const realisticCheckoutUrls = getRealisticCheckoutUrls(
    user.email,
    profile?.full_name ?? metadata?.full_name ?? metadata?.name,
  );
  const displayName = profile?.full_name?.trim() || user.email?.split("@")[0] || "Usuário";

  return (
    <DashboardProvider
      initialVideos={initialVideos}
      initialPlan={initialPlan}
      caktoVerifyEnabled={isCaktoApiConfigured()}
      longVideosEnabled={areLongVideosEnabled()}
      isAdmin={isAdmin}
      initialBonusVideos={bonusResult.error ? 0 : (bonusResult.data?.bonus_videos ?? 0)}
      initialRealisticCredits={realisticResult.error ? 0 : (realisticResult.data?.realistic_credits ?? 0)}
    >
      <div className="min-h-screen bg-[#05050a]">
        <Sidebar userName={displayName} isAdmin={isAdmin} />
        <div className="flex min-h-screen flex-col lg:pl-64">
          <TopBar isAdmin={isAdmin} />
          <main className="flex-1 px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-10">
            {children}
          </main>
        </div>
        <MobileNav />
      </div>
      {/* Não renderiza nada: marca o navegador do dono para as visitas dele
          à página inicial não contarem no funil ("Visitaram a página"). */}
      {(isAdmin || isOwnerEmail(user.email)) && <VisitOptOut />}
      <CreateVideoWizard />
      {/* Vídeo Realista ✨ (produto avulso): assistente e pop-up de compra. */}
      <RealisticWizard />
      <RealisticBuyModal checkoutUrls={realisticCheckoutUrls} />
      <PlanPickerModalGate caktoCheckoutUrls={caktoCheckoutUrls} />
      {/* Não renderiza nada. É o destino do redirecionamento da Stripe —
          só age quando a URL traz session_id. */}
      <PurchaseTracker />
      {/* Verificação de pagamento na Cakto: dashboard sem plano e volta do
          checkout. */}
      <CaktoPaymentVerifier />
    </DashboardProvider>
  );
}
