export type PlanKey = "diario" | "pro" | "ultra";

export type Plan = {
  key: PlanKey;
  name: string;
  description: string;
  dailyVideoLimit: number;
  // Regra INDEPENDENTE do limite diário — protege quantos vídeos deste
  // usuário podem estar 'Processando' AO MESMO TEMPO (concorrência real,
  // carga sobre ElevenLabs/demais providers). O limite diário é "quantos no
  // total hoje"; este aqui é "quantos simultâneos agora". As duas regras
  // convivem: reserve_daily_video_slot (limite diário) continua sendo o
  // gate atômico no banco; checkConcurrencyLimit (abaixo) é um segundo gate,
  // anterior a ele, especificamente contra excesso de paralelismo.
  maxConcurrentGenerations: number;
  monthlyPriceCents: number;
  stripePriceId: string;
};

// price_id LIVE oficiais da conta Stripe real — confirmados pelo dono do
// produto, não inventados. Modelo comercial final: 3 assinaturas mensais
// (sem anual, sem quantity/multiplicador), cada uma com um limite FIXO de
// vídeos por dia — substitui por completo o modelo antigo de créditos
// mensais (Starter/Pro/Avulso).
export const PLANS: Record<PlanKey, Plan> = {
  diario: {
    key: "diario",
    name: "Diário",
    description: "1 vídeo por dia",
    dailyVideoLimit: 1,
    maxConcurrentGenerations: 1,
    monthlyPriceCents: 2700,
    stripePriceId: "price_1UDEac2WTT6ZoTWqJoSi7mLq",
  },
  pro: {
    key: "pro",
    name: "Pro",
    description: "2 vídeos por dia",
    dailyVideoLimit: 2,
    maxConcurrentGenerations: 2,
    monthlyPriceCents: 4700,
    stripePriceId: "price_1UDEbT2WTT6ZoTWqI45a4dj6",
  },
  ultra: {
    key: "ultra",
    name: "Ultra",
    description: "3 vídeos por dia",
    dailyVideoLimit: 3,
    maxConcurrentGenerations: 3,
    monthlyPriceCents: 6700,
    stripePriceId: "price_1UDEc02WTT6ZoTWqQjhHIBIQ",
  },
};

// Sem assinatura ativa, a geração já é bloqueada antes de chegar aqui
// (reserve_daily_video_slot rejeita com "no_subscription"). Mantido só por
// consistência estrutural com o resto do código.
export const DEFAULT_MAX_CONCURRENT_GENERATIONS = 0;

export function findPlanByStripePriceId(priceId: string): Plan | undefined {
  return Object.values(PLANS).find((plan) => plan.stripePriceId === priceId);
}
