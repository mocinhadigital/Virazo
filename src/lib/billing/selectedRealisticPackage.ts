// Pacote de Vídeo Realista escolhido em /realista ANTES do cadastro. Mesmo esquema do plano
// escolhido em /planos (lib/billing/selectedPlan.ts): vai no endereço
// (/realista/comprar?pacote=10) e num cookie de 1 hora, que sobrevive ao login com Google
// (volta por /auth/callback sem os parâmetros da página de origem) e à confirmação de e-mail
// aberta no mesmo navegador. Sem "server-only": usado no navegador (login, /realista) e no
// servidor (/realista/comprar, /auth/callback).

import type { RealisticPackageKey } from "@/lib/realistic/constants";

export const SELECTED_REALISTIC_COOKIE = "virazo_realista";
const MAX_AGE_SECONDS = 60 * 60;

// Só aceita os pacotes reais — qualquer outro valor (endereço editado à mão, cookie
// adulterado) vira null.
export function parseRealisticPackageKey(value: unknown): RealisticPackageKey | null {
  return value === "3" || value === "10" || value === "20" ? value : null;
}

export function realisticCheckoutPath(key: RealisticPackageKey): string {
  return `/realista/comprar?pacote=${key}`;
}

export function rememberSelectedRealisticPackage(key: RealisticPackageKey): void {
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${SELECTED_REALISTIC_COOKIE}=${key}; Max-Age=${MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
  } catch {
    // Cookie bloqueado: resta o ?realista= do endereço.
  }
}

export function readSelectedRealisticCookie(): RealisticPackageKey | null {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${SELECTED_REALISTIC_COOKIE}=([^;]*)`));
    return parseRealisticPackageKey(match?.[1]);
  } catch {
    return null;
  }
}

// Chamado ao seguir para o checkout: depois disso, um login comum volta a cair no painel.
export function forgetSelectedRealisticPackage(): void {
  try {
    document.cookie = `${SELECTED_REALISTIC_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch {
    // sem problema: o cookie expira sozinho em 1 hora.
  }
}
