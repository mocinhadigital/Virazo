export type PlanKey = "starter" | "turbo" | "maximo";
export type BillingInterval = "monthly" | "yearly";

export type Plan = {
  key: PlanKey;
  name: string;
  description: string;
  badge: string | null;
  creditsPerMonth: number;
  maxConcurrentGenerations: number;
  monthlyPriceCents: number;
  originalMonthlyPriceCents: number; // preço riscado (âncora de desconto)
  yearlyPriceCents: number; // cobrado uma vez por ano (não é o valor mensal x12)
  stripePriceId: Record<BillingInterval, string>;
};

// IDs gerados por scripts/setup-stripe-plans.mjs (conta de teste da Stripe).
// Ao migrar pra produção, rode o script de novo com a chave live e troque
// os IDs abaixo pelos novos.
export const PLANS: Record<PlanKey, Plan> = {
  starter: {
    key: "starter",
    name: "Starter",
    description: "3 vídeos por semana",
    badge: null,
    creditsPerMonth: 13,
    maxConcurrentGenerations: 1,
    monthlyPriceCents: 1990,
    originalMonthlyPriceCents: 2790,
    yearlyPriceCents: 17916,
    stripePriceId: {
      monthly: "price_1U9FAF2WbOsfJItMZkGvOrYn",
      yearly: "price_1U9FAG2WbOsfJItMPNjxclJG",
    },
  },
  turbo: {
    key: "turbo",
    name: "Turbo",
    description: "1 vídeo por dia",
    badge: "Mais popular",
    creditsPerMonth: 30,
    maxConcurrentGenerations: 2,
    monthlyPriceCents: 2990,
    originalMonthlyPriceCents: 4490,
    yearlyPriceCents: 26916,
    stripePriceId: {
      monthly: "price_1U9FAG2WbOsfJItMBxtR0JnA",
      yearly: "price_1U9FAH2WbOsfJItMFkWhQgCx",
    },
  },
  maximo: {
    key: "maximo",
    name: "Máximo",
    description: "2 vídeos por dia",
    badge: "Melhor para crescer",
    creditsPerMonth: 60,
    maxConcurrentGenerations: 3,
    monthlyPriceCents: 4990,
    originalMonthlyPriceCents: 6990,
    yearlyPriceCents: 44916,
    stripePriceId: {
      monthly: "price_1U9FAH2WbOsfJItMDnHMraHn",
      yearly: "price_1U9FAI2WbOsfJItMwVuiksHm",
    },
  },
};

// Limite de gerações simultâneas para quem não tem assinatura ativa.
export const DEFAULT_MAX_CONCURRENT_GENERATIONS = 1;

export function pricePerVideoCents(plan: Plan): number {
  return Math.round(plan.monthlyPriceCents / plan.creditsPerMonth);
}

export function findPlanByStripePriceId(priceId: string): Plan | undefined {
  return Object.values(PLANS).find(
    (plan) => plan.stripePriceId.monthly === priceId || plan.stripePriceId.yearly === priceId,
  );
}

export function billingIntervalFromPriceId(plan: Plan, priceId: string): BillingInterval {
  return plan.stripePriceId.yearly === priceId ? "yearly" : "monthly";
}
