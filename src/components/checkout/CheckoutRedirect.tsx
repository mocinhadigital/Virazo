"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { PLANS, type PlanKey } from "@/lib/billing/plans";
import { trackPixel } from "@/lib/meta/pixel";
import { trackConversion } from "@/lib/analytics/conversion";
import { forgetSelectedPlan } from "@/lib/billing/selectedPlan";
import { markCaktoCheckoutStarted } from "@/components/dashboard/CaktoPaymentVerifier";

// Última parada antes do checkout da Cakto no fluxo /planos → cadastro →
// /assinar. Faz exatamente o que o pop-up de planos faz no clique em
// "Assinar" (PlanPickerModal): InitiateCheckout no Pixel, eventos do funil,
// marca de "foi para o checkout" (para o dashboard verificar o pagamento na
// volta) e o redirecionamento — o link vem pronto do servidor, montado pela
// mesma getCaktoCheckoutUrls.
//
// Eventos uma vez só por ida ao checkout: a ref segura o efeito duplicado do
// Strict Mode; o sessionStorage segura um F5 nesta página (60s); o banco
// ainda descarta repetição em 5s.

const RECENT_REDIRECT_MS = 60_000;
// O Pixel é instalado depois da hidratação (MetaPixel, afterInteractive).
// Esta página costuma abrir num carregamento completo (volta do login com
// Google), então espera um pouco o fbq existir antes de disparar.
const PIXEL_WAIT_MS = 2_000;
const PIXEL_POLL_MS = 100;
// Folga para o Pixel enviar o evento antes de a página ser trocada.
const SEND_GRACE_MS = 300;

export default function CheckoutRedirect({ plan, checkoutUrl }: { plan: PlanKey; checkoutUrl: string }) {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const storageKey = `virazo:checkout-redirect:${plan}`;
    let alreadyTracked = false;
    try {
      alreadyTracked = Date.now() - Number(window.sessionStorage.getItem(storageKey) ?? 0) < RECENT_REDIRECT_MS;
      window.sessionStorage.setItem(storageKey, String(Date.now()));
    } catch {
      // sessionStorage bloqueado: segue; o banco ainda descarta repetições.
    }

    forgetSelectedPlan();
    markCaktoCheckoutStarted();

    void (async () => {
      if (!alreadyTracked) {
        const deadline = Date.now() + PIXEL_WAIT_MS;
        while (typeof window.fbq !== "function" && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, PIXEL_POLL_MS));
        }

        const planInfo = PLANS[plan];
        // Quem chega aqui viu e escolheu o plano em /planos (anônimo, sem
        // como registrar lá) — registrados agora, já com a conta.
        trackConversion("paywall_viewed");
        trackConversion("plan_selected", plan);
        trackPixel("InitiateCheckout", {
          value: planInfo.monthlyPriceCents / 100,
          currency: "BRL",
          content_name: planInfo.name,
        });
        trackConversion("checkout_started", plan);
        await new Promise((resolve) => setTimeout(resolve, SEND_GRACE_MS));
      }

      // replace: a seta "voltar" na Cakto não cai de novo aqui (o que
      // reabriria o checkout em loop).
      window.location.replace(checkoutUrl);
    })();
  }, [plan, checkoutUrl]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#05050a] px-6 text-center">
      <Loader2 className="h-6 w-6 animate-spin text-[#A855F7]" />
      <p className="text-sm text-zinc-300">Levando você ao pagamento seguro do plano {PLANS[plan].name}…</p>
      <a href={checkoutUrl} className="text-xs font-medium text-zinc-500 underline hover:text-white">
        Se nada acontecer, toque aqui
      </a>
    </div>
  );
}
