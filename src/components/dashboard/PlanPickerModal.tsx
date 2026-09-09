"use client";

import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { PLANS, type PlanKey } from "@/lib/billing/plans";

// Modal compacto de upgrade — reproduz o fluxo do AutoShortz: overlay
// escuro, título "Escolha seu plano", X pra fechar, 3 linhas simples
// (nome/descrição-preço à esquerda, botão Assinar à direita). Ao clicar em
// Assinar, cria a Checkout Session e redireciona pro Stripe Checkout
// hospedado — o pagamento nunca acontece dentro deste modal.
export default function PlanPickerModal({ onClose }: { onClose: () => void }) {
  const [loadingPlan, setLoadingPlan] = useState<PlanKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleSubscribe(item: PlanKey) {
    setError(null);
    setLoadingPlan(item);
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
      window.location.assign(data.url);
    } catch (err) {
      setLoadingPlan(null);
      setError(err instanceof Error ? err.message : "Não foi possível iniciar o checkout.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0a0a12] p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Escolha seu plano</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-500 hover:bg-white/5 hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-8 flex flex-col gap-5">
          {Object.values(PLANS).map((plan) => (
            <div
              key={plan.key}
              className="flex items-center justify-between gap-5 rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-6"
            >
              <div className="min-w-0">
                <p className="text-lg font-bold text-white">{plan.name}</p>
                <p className="truncate text-sm text-zinc-400">
                  {plan.description} · R$ {(plan.monthlyPriceCents / 100).toFixed(2).replace(".", ",")}/mês
                </p>
              </div>
              <button
                type="button"
                disabled={loadingPlan !== null}
                onClick={() => handleSubscribe(plan.key)}
                className="inline-flex shrink-0 items-center gap-2 self-center rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-7 py-3.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingPlan === plan.key && <Loader2 className="h-4 w-4 animate-spin" />}
                Assinar
              </button>
            </div>
          ))}
        </div>

        {error && (
          <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-center text-xs font-medium text-red-400">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
