"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2, ShieldCheck, Check } from "lucide-react";
import { PLANS, type PlanKey } from "@/lib/billing/plans";
import { trackPixel } from "@/lib/meta/pixel";
import { trackConversion } from "@/lib/analytics/conversion";
import type { CaktoCheckoutUrls } from "@/lib/billing/cakto";
import { useDashboard } from "./DashboardContext";
import { markCaktoCheckoutStarted } from "./CaktoPaymentVerifier";

// Modal compacto de upgrade — reproduz o fluxo do AutoShortz: overlay
// escuro, título "Escolha seu plano", X pra fechar, 3 linhas simples
// (nome/descrição-preço à esquerda, botão Assinar à direita). Ao clicar em
// Assinar, cria a Checkout Session e redireciona pro Stripe Checkout
// hospedado — o pagamento nunca acontece dentro deste modal.
//
// caktoCheckoutUrls só vem preenchido com PAYMENT_PROVIDER=cakto (ver
// getCaktoCheckoutUrls); aí o botão vai direto pro checkout da Cakto, com o
// e-mail já na URL, e a rota do Stripe nem é chamada.
export default function PlanPickerModal({
  onClose,
  caktoCheckoutUrls,
}: {
  onClose: () => void;
  caktoCheckoutUrls: CaktoCheckoutUrls | null;
}) {
  const [loadingPlan, setLoadingPlan] = useState<PlanKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const { caktoVerifyEnabled, isVerifyingPayment, verifyPayment } = useDashboard();
  const paywallTracked = useRef(false);

  // Funil: 1 paywall_viewed por abertura do pop-up. A ref segura
  // re-renderizações e o efeito duplicado do Strict Mode em dev; o banco
  // ainda descarta repetição do mesmo usuário em menos de 5s.
  useEffect(() => {
    if (paywallTracked.current) return;
    paywallTracked.current = true;
    trackConversion("paywall_viewed");
  }, []);

  // "Já paguei": consulta a Cakto na hora. Se achar o pagamento, o plano é
  // ativado no contexto (que também mostra o aviso de confirmação) e o
  // pop-up fecha.
  async function handleVerifyPayment() {
    setError(null);
    setVerifyMessage(null);
    const result = await verifyPayment();
    switch (result.status) {
      case "activated":
        onClose();
        return;
      case "not_found":
        setVerifyMessage(
          "Ainda não encontramos um pagamento aprovado no e-mail da sua conta. Pix e boleto podem levar alguns minutos — tente de novo em instantes.",
        );
        return;
      case "rate_limited":
        setVerifyMessage(`Acabamos de verificar. Tente de novo em ${result.retryAfterSeconds}s.`);
        return;
      case "not_configured":
        setVerifyMessage("A verificação automática não está disponível no momento.");
        return;
      case "error":
        setError(result.message);
        return;
    }
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Voltar do Stripe pela seta do navegador normalmente restaura a página
  // do bfcache: o DOM e o estado do React voltam EXATAMENTE como estavam,
  // com loadingPlan ainda apontando pro plano clicado. Como a navegação de
  // ida foi um window.location.assign (saída de página de verdade), nada
  // remonta o componente na volta — sem isto o spinner gira pra sempre e o
  // modal inteiro fica inútil até um F5.
  //
  // São dois gatilhos porque o retorno nem sempre passa pelo mesmo caminho:
  // pageshow com persisted=true é a restauração do bfcache propriamente
  // dita; visibilitychange cobre voltar pra aba ou restaurar a janela em
  // navegadores que não usaram o bfcache nessa transição.
  //
  // Resetar à toa não causa dano: o pior caso é o spinner sumir enquanto um
  // pedido legítimo ainda está no ar, e esse pedido segue até o fim e
  // redireciona normalmente.
  useEffect(() => {
    function resetLoading() {
      setLoadingPlan(null);
    }

    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) resetLoading();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") resetLoading();
    }

    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  async function handleSubscribe(item: PlanKey) {
    const plan = PLANS[item];
    setError(null);
    setLoadingPlan(item);
    trackConversion("plan_selected", item);

    if (caktoCheckoutUrls) {
      trackPixel("InitiateCheckout", {
        value: plan.monthlyPriceCents / 100,
        currency: "BRL",
        content_name: plan.name,
      });
      // Na volta, o dashboard sabe que deve verificar o pagamento mesmo se
      // a Cakto não redirecionar com ?checkout=cakto.
      markCaktoCheckoutStarted();
      trackConversion("checkout_started", item);
      window.location.assign(caktoCheckoutUrls[item]);
      return;
    }

    try {
      const response = await fetch("/api/checkout/create-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item }),
      });
      // Lê como texto primeiro — nunca chama response.json() direto numa
      // resposta que pode vir vazia (erro do servidor sem corpo, timeout,
      // etc.), senão o próprio JSON.parse("") é quem quebra com
      // "Unexpected end of JSON input" antes de a mensagem de erro real
      // sequer aparecer.
      const rawBody = await response.text();
      let data: { url?: string; error?: string; switched?: boolean; alreadyActive?: boolean; message?: string } = {};
      if (rawBody) {
        try {
          data = JSON.parse(rawBody);
        } catch {
          // Corpo não era JSON válido — não esconde a falha, só evita o
          // crash; cai no fallback abaixo com o status HTTP real.
        }
      }
      if (!response.ok) {
        throw new Error(data.error ?? `Não foi possível iniciar o checkout (erro do servidor, status ${response.status}).`);
      }
      if (data.alreadyActive) {
        // Já está nesse plano — nenhuma cobrança, nenhuma navegação; só
        // avisa na mesma caixa de mensagem que já existia pra erros.
        setLoadingPlan(null);
        setError(data.message ?? "Você já está nesse plano.");
        return;
      }
      if (data.switched) {
        // Troca de price numa assinatura já existente (sem Checkout Session
        // nova) — mesma URL de sucesso que a Stripe já usa hoje, pra
        // reaproveitar o refresh do plano no dashboard sem duplicar lógica.
        window.location.assign("/dashboard?checkout=success");
        return;
      }
      if (!data.url) {
        throw new Error(data.error ?? "Não foi possível iniciar o checkout (resposta inesperada do servidor).");
      }

      // InitiateCheckout: só DEPOIS de a API ter criado a Checkout Session
      // na Stripe e devolvido uma URL válida, imediatamente antes de sair
      // da página. Disparar antes do fetch contaria como intenção de compra
      // casos que nunca viram checkout nenhum — plano já ativo
      // (`alreadyActive`), troca de price sem Checkout Session
      // (`switched`), erro 500, ou a trava de concorrência devolvendo 409.
      //
      // O valor vem de PLANS (única fonte de preço do projeto) — nada de
      // número repetido aqui.
      trackPixel("InitiateCheckout", {
        value: plan.monthlyPriceCents / 100,
        currency: "BRL",
        content_name: plan.name,
      });
      trackConversion("checkout_started", item);

      window.location.assign(data.url);
    } catch (err) {
      setLoadingPlan(null);
      setError(err instanceof Error ? err.message : "Não foi possível iniciar o checkout.");
    }
  }

  return (
    // m-auto (em vez de items-center no fundo): centraliza quando cabe e,
    // em tela baixa, deixa rolar até o topo — com items-center o título e o
    // X ficariam cortados e inalcançáveis quando o pop-up é mais alto que a
    // tela.
    <div
      className="fixed inset-0 z-[60] flex justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="m-auto w-full max-w-lg rounded-3xl border border-white/10 bg-[#0a0a12] p-5 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white sm:text-2xl">Escolha seu plano</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-500 hover:bg-white/5 hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:mt-8 sm:gap-5">
          {Object.values(PLANS).map((plan) => (
            <div
              key={plan.key}
              className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-4 sm:gap-5 sm:px-6 sm:py-6"
            >
              <div className="min-w-0">
                <p className="text-lg font-bold text-white">{plan.name}</p>
                {/* Quebra de linha em vez de "..." — no celular o preço
                    não pode sumir. */}
                <p className="text-sm text-zinc-400">
                  {plan.description} ·{" "}
                  <span className="whitespace-nowrap">
                    R$ {(plan.monthlyPriceCents / 100).toFixed(2).replace(".", ",")}/mês
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-500">+ R$ 0,99 de taxa de processamento</p>
              </div>
              {/* Trava SÓ o botão que está carregando. Antes um loadingPlan
                  preso desabilitava os três de uma vez, então qualquer estado
                  travado levava o modal inteiro junto — agora os outros
                  planos continuam clicáveis e servem de saída mesmo se um
                  botão ficar preso. */}
              <div className="flex shrink-0 flex-col items-center gap-1.5 self-center">
                <button
                  type="button"
                  disabled={loadingPlan === plan.key}
                  onClick={() => handleSubscribe(plan.key)}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:px-7 sm:py-3.5"
                >
                  {loadingPlan === plan.key && <Loader2 className="h-4 w-4 animate-spin" />}
                  Assinar
                </button>
                <p className="max-w-[7.5rem] text-center text-[10px] leading-tight text-zinc-400">
                  Garantia de 7 dias • Cancele quando quiser
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 sm:mt-5 sm:px-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 shrink-0 text-[#A855F7]" strokeWidth={2} />
            <p className="text-sm font-bold text-white">Garantia de 7 dias</p>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
            Teste o Virazo sem risco. Se não gostar, devolvemos 100% do seu dinheiro. Sem perguntas.
          </p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {["Cancele quando quiser, sem multa", "Pagamento seguro via Pix ou cartão"].map((item) => (
              <li key={item} className="flex items-center gap-2 text-xs text-zinc-300">
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" strokeWidth={3} />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {caktoVerifyEnabled && (
          <button
            type="button"
            disabled={isVerifyingPayment}
            onClick={handleVerifyPayment}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 px-6 py-3 text-sm font-medium text-zinc-300 hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isVerifyingPayment && <Loader2 className="h-4 w-4 animate-spin" />}
            {isVerifyingPayment ? "Verificando seu pagamento..." : "Já paguei, verificar meu pagamento"}
          </button>
        )}

        {verifyMessage && (
          <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-center text-xs font-medium text-zinc-300">
            {verifyMessage}
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-center text-xs font-medium text-red-400">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
