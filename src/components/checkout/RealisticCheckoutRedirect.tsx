"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { REALISTIC_PACKAGES, type RealisticPackageKey } from "@/lib/realistic/constants";
import { trackPixel } from "@/lib/meta/pixel";
import { forgetSelectedRealisticPackage } from "@/lib/billing/selectedRealisticPackage";
import { markCaktoCheckoutStarted } from "@/components/dashboard/CaktoPaymentVerifier";

// Última parada antes do checkout da Cakto no fluxo /realista → cadastro → /realista/comprar.
// Faz o que o pop-up de compra do painel faz no clique em "Comprar": InitiateCheckout no Pixel,
// marca de "foi para o checkout" (o painel verifica o pagamento na volta) e o redirecionamento.
// O evento sai uma vez só por ida ao checkout (ref + sessionStorage por 60s).
const RECENT_REDIRECT_MS = 60_000;
const PIXEL_WAIT_MS = 2_000;
const PIXEL_POLL_MS = 100;
const SEND_GRACE_MS = 300;

export default function RealisticCheckoutRedirect({
  packageKey,
  checkoutUrl,
}: {
  packageKey: RealisticPackageKey;
  checkoutUrl: string;
}) {
  const started = useRef(false);
  const pkg = REALISTIC_PACKAGES.find((p) => p.key === packageKey);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const storageKey = `virazo:realistic-checkout-redirect:${packageKey}`;
    let alreadyTracked = false;
    try {
      alreadyTracked = Date.now() - Number(window.sessionStorage.getItem(storageKey) ?? 0) < RECENT_REDIRECT_MS;
      window.sessionStorage.setItem(storageKey, String(Date.now()));
    } catch {
      // sessionStorage bloqueado: segue.
    }

    forgetSelectedRealisticPackage();
    markCaktoCheckoutStarted();

    void (async () => {
      if (!alreadyTracked && pkg) {
        const deadline = Date.now() + PIXEL_WAIT_MS;
        while (typeof window.fbq !== "function" && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, PIXEL_POLL_MS));
        }
        trackPixel("InitiateCheckout", {
          value: pkg.priceCents / 100,
          currency: "BRL",
          content_name: pkg.label,
        });
        await new Promise((resolve) => setTimeout(resolve, SEND_GRACE_MS));
      }
      // replace: a seta "voltar" na Cakto não cai de novo aqui (o que reabriria o checkout em loop).
      window.location.replace(checkoutUrl);
    })();
  }, [packageKey, checkoutUrl, pkg]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#05050a] px-6 text-center">
      <Loader2 className="h-6 w-6 animate-spin text-[#A855F7]" />
      <p className="text-sm text-zinc-300">
        Levando você ao pagamento seguro do pacote de {pkg?.credits ?? ""} créditos…
      </p>
      <a href={checkoutUrl} className="text-xs font-medium text-zinc-500 underline hover:text-white">
        Se nada acontecer, toque aqui
      </a>
    </div>
  );
}
