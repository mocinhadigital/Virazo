// Plano escolhido na página /planos ANTES do cadastro. Vai junto no
// endereço (/assinar?plano=pro) e num cookie de 1 hora — o cookie é o que
// sobrevive ao login com Google (que volta por /auth/callback sem os
// parâmetros da página de origem) e à confirmação de e-mail aberta no mesmo
// navegador. Sem "server-only": usado no navegador (login, /planos) e no
// servidor (/assinar, /auth/callback).

import type { PlanKey } from "./plans";

export const SELECTED_PLAN_COOKIE = "virazo_plano";
const SELECTED_PLAN_MAX_AGE_SECONDS = 60 * 60;

// Só aceita as 3 chaves reais — qualquer outro valor (endereço editado à
// mão, cookie adulterado) vira null.
export function parsePlanKey(value: unknown): PlanKey | null {
  return value === "diario" || value === "pro" || value === "ultra" ? value : null;
}

export function checkoutPath(plan: PlanKey): string {
  return `/assinar?plano=${plan}`;
}

export function rememberSelectedPlan(plan: PlanKey): void {
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${SELECTED_PLAN_COOKIE}=${plan}; Max-Age=${SELECTED_PLAN_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
  } catch {
    // Cookie bloqueado: resta o ?plano= do endereço.
  }
}

export function readSelectedPlanCookie(): PlanKey | null {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${SELECTED_PLAN_COOKIE}=([^;]*)`));
    return parsePlanKey(match?.[1]);
  } catch {
    return null;
  }
}

// Chamado ao seguir para o checkout: depois disso, um login comum volta a
// cair no painel, como sempre.
export function forgetSelectedPlan(): void {
  try {
    document.cookie = `${SELECTED_PLAN_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch {
    // sem problema: o cookie expira sozinho em 1 hora.
  }
}
