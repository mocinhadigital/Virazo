"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, Minus, Plus } from "lucide-react";
import { PLANS, pricePerVideoCents, type PlanKey, type BillingInterval } from "@/lib/billing/plans";

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function PlanosPage() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>("turbo");
  const [quantity, setQuantity] = useState(1);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const plan = PLANS[selectedPlan];

  const effectiveMonthlyCents = useMemo(() => {
    return interval === "yearly" ? Math.round(plan.yearlyPriceCents / 12) : plan.monthlyPriceCents;
  }, [plan, interval]);

  const totalPerMonthCents = effectiveMonthlyCents * quantity;

  async function handleSubscribe() {
    setCheckoutError(null);
    setIsRedirecting(true);
    try {
      const response = await fetch("/api/checkout/create-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan, interval, quantity }),
      });
      const data = await response.json();
      if (!response.ok || !data.url) {
        throw new Error(data.error ?? "Não foi possível iniciar o checkout.");
      }
      window.location.href = data.url;
    } catch (err) {
      setIsRedirecting(false);
      setCheckoutError(err instanceof Error ? err.message : "Não foi possível iniciar o checkout.");
    }
  }

  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
          Planos
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Escolha quantos vídeos por semana você precisa criar.
        </p>
      </div>

      {/* Toggle mensal/anual */}
      <div className="flex items-center justify-center gap-2">
        <div className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
          <button
            type="button"
            onClick={() => setInterval("monthly")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              interval === "monthly" ? "bg-white text-zinc-900" : "text-zinc-400 hover:text-white"
            }`}
          >
            Mensal
          </button>
          <button
            type="button"
            onClick={() => setInterval("yearly")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              interval === "yearly" ? "bg-white text-zinc-900" : "text-zinc-400 hover:text-white"
            }`}
          >
            Anual
          </button>
        </div>
        {interval === "yearly" && (
          <span className="rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-3 py-1 text-xs font-semibold text-white">
            Economize 25%
          </span>
        )}
      </div>

      {/* Cards de planos */}
      <div className="flex flex-col gap-4">
        {Object.values(PLANS).map((p) => {
          const isSelected = p.key === selectedPlan;
          const isTurbo = p.key === "turbo";
          const monthlyEquivalent =
            interval === "yearly" ? Math.round(p.yearlyPriceCents / 12) : p.monthlyPriceCents;

          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setSelectedPlan(p.key)}
              className={`relative rounded-3xl border p-5 text-left transition-colors sm:p-6 ${
                isSelected
                  ? "border-[#4C3BFF]/70 bg-white/[0.06]"
                  : isTurbo
                    ? "border-[#4C3BFF]/30 bg-white/[0.03]"
                    : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"
              }`}
            >
              {p.badge && (
                <span className="absolute -top-3 left-5 rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-3 py-1 text-xs font-semibold text-white shadow-lg shadow-[#4C3BFF]/25">
                  {p.badge}
                </span>
              )}

              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white sm:text-lg">{p.name}</h3>
                    {isSelected && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#4C3BFF]">
                        <Check className="h-3 w-3 text-white" strokeWidth={3} />
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-zinc-400">{p.description}</p>

                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-sm text-zinc-500 line-through">
                      {formatBRL(p.originalMonthlyPriceCents)}
                    </span>
                    <span className="text-2xl font-bold text-white">
                      {formatBRL(monthlyEquivalent)}
                    </span>
                    <span className="text-xs text-zinc-500">/mês</span>
                  </div>
                </div>

                <span className="shrink-0 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-zinc-300">
                  {formatBRL(pricePerVideoCents(p))} POR VÍDEO
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Quantas séries */}
      <div className="card-glass rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Quantas séries?</p>
            <p className="mt-0.5 text-xs text-zinc-500">Cada série roda no ritmo escolhido.</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-zinc-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Diminuir"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="w-6 text-center text-sm font-semibold text-white">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-zinc-300 transition-colors hover:bg-white/10"
              aria-label="Aumentar"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Total */}
      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4">
        <span className="text-sm text-zinc-400">Total por mês</span>
        <span className="text-xl font-bold text-white">{formatBRL(totalPerMonthCents)}</span>
      </div>

      {checkoutError && (
        <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-center text-xs font-medium text-red-400">
          {checkoutError}
        </p>
      )}

      <button
        type="button"
        onClick={handleSubscribe}
        disabled={isRedirecting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-[#4C3BFF]/25 transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isRedirecting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Redirecionando...
          </>
        ) : (
          "Assinar agora"
        )}
      </button>
    </div>
  );
}
