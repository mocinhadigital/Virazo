import "server-only";
import { PLANS, type PlanKey } from "@/lib/billing/plans";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

// Id do produto na Cakto → plano do Virazo. Os ids ficam em variável de
// ambiente (não fixos no código como os price_id do Stripe) porque ainda
// podem mudar enquanto a Cakto não está em produção.
const CAKTO_PRODUCT_ENV: Record<PlanKey, string> = {
  diario: "CAKTO_PRODUCT_DIARIO",
  pro: "CAKTO_PRODUCT_PRO",
  ultra: "CAKTO_PRODUCT_ULTRA",
};

const CAKTO_CHECKOUT_ENV: Record<PlanKey, string> = {
  diario: "CAKTO_CHECKOUT_DIARIO",
  pro: "CAKTO_CHECKOUT_PRO",
  ultra: "CAKTO_CHECKOUT_ULTRA",
};

export function findPlanKeyByCaktoProductId(productId: string): PlanKey | undefined {
  return (Object.keys(CAKTO_PRODUCT_ENV) as PlanKey[]).find(
    (key) => process.env[CAKTO_PRODUCT_ENV[key]]?.trim() === productId,
  );
}

export type CaktoCheckoutUrls = Record<PlanKey, string>;

// Links de checkout da Cakto pro modal de planos, com o e-mail do usuário
// logado já preenchido. Devolve null — e o modal segue no Stripe como hoje —
// se PAYMENT_PROVIDER não for "cakto" ou se faltar o link de algum plano:
// melhor continuar vendendo pelo Stripe do que exibir um botão quebrado.
export function getCaktoCheckoutUrls(email: string | null | undefined): CaktoCheckoutUrls | null {
  if (process.env.PAYMENT_PROVIDER?.trim().toLowerCase() !== "cakto") return null;

  const urls = {} as CaktoCheckoutUrls;
  for (const key of Object.keys(PLANS) as PlanKey[]) {
    const raw = process.env[CAKTO_CHECKOUT_ENV[key]]?.trim();
    if (!raw) {
      console.error(
        `[billing/cakto] PAYMENT_PROVIDER=cakto mas ${CAKTO_CHECKOUT_ENV[key]} não está definida — usando o Stripe.`,
      );
      return null;
    }

    try {
      const url = new URL(raw);
      if (email) url.searchParams.set("email", email);
      urls[key] = url.toString();
    } catch {
      console.error(`[billing/cakto] ${CAKTO_CHECKOUT_ENV[key]} não é uma URL válida — usando o Stripe.`);
      return null;
    }
  }
  return urls;
}

// Aplica as compras da Cakto feitas com este e-mail antes de a conta
// existir. Roda no servidor sempre que o dashboard carrega (logo após criar
// conta ou fazer login); quando não há pendência é uma única consulta
// indexada.
//
// Só com e-mail CONFIRMADO: sem isso, quem cadastrasse o e-mail de um
// comprador antes dele levaria o plano pago por outra pessoa.
//
// Nunca lança — uma falha aqui não pode impedir o dashboard de abrir; a
// pendência continua lá e é aplicada no próximo carregamento.
export async function claimCaktoPendingPurchases(user: {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
}): Promise<void> {
  if (!user.email || !user.email_confirmed_at) return;
  try {
    const { error } = await createServiceRoleClient().rpc("claim_cakto_pending_purchases", {
      p_user_id: user.id,
      p_email: user.email,
    });
    if (error) console.error("[billing/cakto] claim_cakto_pending_purchases falhou:", error);
  } catch (err) {
    console.error("[billing/cakto] claim_cakto_pending_purchases falhou:", err);
  }
}
