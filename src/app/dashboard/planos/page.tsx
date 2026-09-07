"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { PLANS, ONE_TIME_PACKAGE, pricePerVideoCents, type CheckoutItemKey } from "@/lib/billing/plans";

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function PlanosPage() {
  const [selectedItem, setSelectedItem] = useState<CheckoutItemKey>("pro");
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  async function handleSubscribe() {
    setCheckoutError(null);
    setIsRedirecting(true);
    try {
      const response = await fetch("/api/checkout/create-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item: selectedItem }),
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
        <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">Planos</h1>
        <p className="mt-1 text-sm text-zinc-400">Escolha quantos vídeos por mês você precisa criar.</p>
      </div>

      {/* Cards de planos (assinatura) */}
      <div className="flex flex-col gap-4">
        {Object.values(PLANS).map((p) => {
          const isSelected = p.key === selectedItem;

          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setSelectedItem(p.key)}
              className={`relative rounded-3xl border p-5 text-left transition-colors sm:p-6 ${
                isSelected
                  ? "border-[#4C3BFF]/70 bg-white/[0.06]"
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
                    <span className="text-2xl font-bold text-white">{formatBRL(p.monthlyPriceCents)}</span>
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

        {/* Pacote Avulso — pagamento único, sem assinatura */}
        <button
          type="button"
          onClick={() => setSelectedItem(ONE_TIME_PACKAGE.key)}
          className={`relative rounded-3xl border p-5 text-left transition-colors sm:p-6 ${
            selectedItem === ONE_TIME_PACKAGE.key
              ? "border-[#4C3BFF]/70 bg-white/[0.06]"
              : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white sm:text-lg">{ONE_TIME_PACKAGE.name}</h3>
                {selectedItem === ONE_TIME_PACKAGE.key && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#4C3BFF]">
                    <Check className="h-3 w-3 text-white" strokeWidth={3} />
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-zinc-400">{ONE_TIME_PACKAGE.description}</p>

              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white">{formatBRL(ONE_TIME_PACKAGE.priceCents)}</span>
                <span className="text-xs text-zinc-500">pagamento único</span>
              </div>
            </div>
          </div>
        </button>
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
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#4C3BFF] to-[#A855F7] text-[15px] font-medium text-white shadow-xl shadow-[#4C3BFF]/25 transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isRedirecting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Redirecionando...
          </>
        ) : selectedItem === ONE_TIME_PACKAGE.key ? (
          "Comprar agora"
        ) : (
          "Assinar agora"
        )}
      </button>
    </div>
  );
}
