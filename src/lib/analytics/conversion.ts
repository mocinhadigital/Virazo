// Rastreamento do funil de conversão (tabela conversion_events, migration
// 0026). Usado no navegador. Aqui só saem os 3 eventos não críticos —
// signup_completed e purchase_completed são gravados por gatilhos no banco,
// nunca pelo navegador.
//
// Mesma regra do Meta Pixel (lib/meta/pixel.ts): rastreamento nunca pode
// quebrar um fluxo de produto. Toda falha aqui é silenciosa.

import type { PlanKey } from "@/lib/billing/plans";

export type ClientConversionEvent = "paywall_viewed" | "plan_selected" | "checkout_started";

// No código o plano Diário é "diario"; no funil, "daily".
const FUNNEL_PLAN: Record<PlanKey, "daily" | "pro" | "ultra"> = {
  diario: "daily",
  pro: "pro",
  ultra: "ultra",
};

const UTM_STORAGE_KEY = "virazo:utm";
export const UTM_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
const MAX_UTM_LENGTH = 200;

// Guarda as UTMs da URL atual, se houver alguma. A pessoa chega na landing
// com ?utm_..., navega até o cadastro e o dashboard sem elas na URL — por
// isso ficam no localStorage. Vale a visita mais recente com UTM.
export function captureUtmFromUrl(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    for (const key of UTM_PARAMS) {
      const value = params.get(key)?.trim();
      if (value) utm[key] = value.slice(0, MAX_UTM_LENGTH);
    }
    if (Object.keys(utm).length === 0) return;
    window.localStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(utm));
  } catch {
    // localStorage bloqueado (modo privado, configuração do navegador).
  }
}

function readStoredUtm(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(UTM_STORAGE_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object") return {};
    const utm: Record<string, string> = {};
    for (const key of UTM_PARAMS) {
      const value = (parsed as Record<string, unknown>)[key];
      if (typeof value === "string" && value) utm[key] = value.slice(0, MAX_UTM_LENGTH);
    }
    return utm;
  } catch {
    return {};
  }
}

// sendBeacon: a requisição sobrevive à troca de página — é o que garante o
// checkout_started mesmo com o redirecionamento para a Cakto logo em
// seguida, sem atrasá-lo. Vai como texto puro (o tipo que todo navegador
// aceita no sendBeacon); a rota faz o JSON.parse.
export function trackConversion(event: ClientConversionEvent, plan?: PlanKey): void {
  if (typeof window === "undefined") return;

  try {
    const body = JSON.stringify({
      event,
      plan: plan ? FUNNEL_PLAN[plan] : null,
      metadata: { pathname: window.location.pathname, ...readStoredUtm() },
    });

    const queued = typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/analytics/track", body);
    if (!queued) {
      void fetch("/api/analytics/track", { method: "POST", body, keepalive: true }).catch(() => {});
    }
  } catch {
    // Nunca derruba quem chamou.
  }
}
