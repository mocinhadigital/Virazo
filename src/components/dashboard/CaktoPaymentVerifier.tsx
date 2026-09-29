"use client";

import { useEffect, useRef } from "react";
import { CheckCircle2, Loader2, X } from "lucide-react";
import { useDashboard } from "./DashboardContext";

// Verificação automática de pagamento na Cakto. Não renderiza nada além de
// um aviso flutuante — montado uma vez no layout do dashboard.
//
// Dispara em dois momentos:
//  (a) o dashboard abre e o usuário não tem plano ativo → 1 verificação;
//  (b) o usuário volta do checkout da Cakto → verifica e repete a cada
//      ~30s por alguns minutos, porque Pix/boleto podem levar um tempo
//      para virar "pago". "Voltou do checkout" = URL com ?checkout=cakto
//      (página de obrigado configurada na Cakto) OU a marca que o pop-up de
//      planos grava ao mandar para a Cakto (cobre a seta "voltar").
//
// O limite real de 1 consulta a cada 30s por usuário é aplicado no
// servidor; aqui só se evita pedir à toa.

const CHECKOUT_FLAG = "virazo:cakto-checkout-started";
const RETURN_POLL_ATTEMPTS = 10;
const RETURN_POLL_INTERVAL_MS = 31_000;
const NOTICE_DURATION_MS = 8_000;

export function markCaktoCheckoutStarted() {
  try {
    window.sessionStorage.setItem(CHECKOUT_FLAG, String(Date.now()));
  } catch {
    // sessionStorage indisponível — resta o ?checkout=cakto da volta.
  }
}

function isReturningFromCheckout(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get("checkout") === "cakto") return true;
    return window.sessionStorage.getItem(CHECKOUT_FLAG) !== null;
  } catch {
    return false;
  }
}

function clearCheckoutMarkers() {
  try {
    window.sessionStorage.removeItem(CHECKOUT_FLAG);
    const url = new URL(window.location.href);
    if (url.searchParams.get("checkout") === "cakto") {
      url.searchParams.delete("checkout");
      window.history.replaceState({}, "", url.toString());
    }
  } catch {
    // sem problema: no pior caso a próxima abertura verifica mais uma vez.
  }
}

export default function CaktoPaymentVerifier() {
  const {
    caktoVerifyEnabled,
    plan,
    verifyPayment,
    isVerifyingPayment,
    isPlanModalOpen,
    paymentNotice,
    dismissPaymentNotice,
  } = useDashboard();
  // Só o plano do PRIMEIRO carregamento decide o gatilho (a).
  const initialPlan = useRef(plan);

  useEffect(() => {
    if (!caktoVerifyEnabled) return;

    let cancelled = false;
    let polling = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      });

    async function pollAfterCheckout() {
      if (polling) return;
      polling = true;
      try {
        for (let attempt = 0; attempt < RETURN_POLL_ATTEMPTS && !cancelled; attempt++) {
          const result = await verifyPayment();
          if (cancelled) return;
          if (result.status === "activated" || result.status === "not_configured") break;
          await sleep(
            result.status === "rate_limited" ? result.retryAfterSeconds * 1000 + 500 : RETURN_POLL_INTERVAL_MS,
          );
        }
        // Só limpa ao terminar de verdade — não num unmount no meio.
        if (!cancelled) clearCheckoutMarkers();
      } finally {
        polling = false;
      }
    }

    if (isReturningFromCheckout()) {
      void pollAfterCheckout();
    } else if (!initialPlan.current) {
      void verifyPayment();
    }

    // Volta pela seta do navegador (bfcache) ou para a aba.
    function handleReturn() {
      if (isReturningFromCheckout()) void pollAfterCheckout();
    }
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) handleReturn();
    }
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") handleReturn();
    }
    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [caktoVerifyEnabled, verifyPayment]);

  useEffect(() => {
    if (!paymentNotice) return;
    const timeout = setTimeout(dismissPaymentNotice, NOTICE_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [paymentNotice, dismissPaymentNotice]);

  // Dentro do pop-up de planos o próprio botão já mostra o estado.
  if (isVerifyingPayment && !isPlanModalOpen) {
    return (
      <div
        role="status"
        className="fixed bottom-24 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-[#0a0a12] px-5 py-3 text-sm text-zinc-200 shadow-lg lg:bottom-6"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Verificando seu pagamento...
      </div>
    );
  }

  if (paymentNotice) {
    return (
      <div
        role="status"
        className="fixed bottom-24 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-full border border-emerald-500/30 bg-[#0a0a12] px-5 py-3 text-sm text-emerald-300 shadow-lg lg:bottom-6"
      >
        <CheckCircle2 className="h-4 w-4" />
        {paymentNotice}
        <button
          type="button"
          onClick={dismissPaymentNotice}
          className="ml-1 text-zinc-500 hover:text-white"
          aria-label="Fechar aviso"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return null;
}
