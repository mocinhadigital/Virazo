export type PlanKey = "starter" | "pro";

export type Plan = {
  key: PlanKey;
  name: string;
  description: string;
  badge: string | null;
  creditsPerMonth: number;
  maxConcurrentGenerations: number;
  monthlyPriceCents: number;
  stripePriceId: string;
};

// price_id LIVE oficiais da conta Stripe real — não são de teste, não
// inventados: confirmados pelo dono do produto. Sem mensal/anual (só existe
// mensal) e sem multiplicador de quantidade (cada assinatura é sempre 1
// unidade — não dá pra comprar "2x Starter" numa assinatura só).
export const PLANS: Record<PlanKey, Plan> = {
  starter: {
    key: "starter",
    name: "Starter",
    description: "30 créditos por mês",
    badge: null,
    creditsPerMonth: 30,
    maxConcurrentGenerations: 1,
    monthlyPriceCents: 2900,
    stripePriceId: "price_1UD87s2WTT6ZoTWq2Lmx8Imp",
  },
  pro: {
    key: "pro",
    name: "Pro",
    description: "100 créditos por mês",
    badge: "Mais popular",
    creditsPerMonth: 100,
    maxConcurrentGenerations: 2,
    monthlyPriceCents: 7900,
    stripePriceId: "price_1UD8Ce2WTT6ZoTWqfs5jjBC8",
  },
};

// Pacote Avulso: pagamento único (Stripe Checkout mode "payment"), sem
// assinatura — soma crédito uma vez, não renova nada.
export const ONE_TIME_PACKAGE = {
  key: "avulso" as const,
  name: "Pacote Avulso",
  description: "+10 créditos, pagamento único",
  priceCents: 3900,
  creditsGranted: 10,
  stripePriceId: "price_1UD8GD2WTT6ZoTWqrRoamF8L",
};

export type CheckoutItemKey = PlanKey | typeof ONE_TIME_PACKAGE.key;

// Limite de gerações simultâneas para quem não tem assinatura ativa (inclui
// quem só comprou o Pacote Avulso — ele não cria assinatura, então não
// muda esse limite).
export const DEFAULT_MAX_CONCURRENT_GENERATIONS = 1;

export function pricePerVideoCents(plan: Plan): number {
  return Math.round(plan.monthlyPriceCents / plan.creditsPerMonth);
}

export function findPlanByStripePriceId(priceId: string): Plan | undefined {
  return Object.values(PLANS).find((plan) => plan.stripePriceId === priceId);
}
