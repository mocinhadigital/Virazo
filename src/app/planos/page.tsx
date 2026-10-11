import type { Metadata } from "next";
import { Check, ShieldCheck } from "lucide-react";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import PlanChoiceLink from "@/components/checkout/PlanChoiceLink";
import { PLANS } from "@/lib/billing/plans";

export const metadata: Metadata = {
  title: "Planos — Virazo",
};

// Página de planos ANTES do cadastro. Nomes, descrições e preços vêm de
// PLANS (a mesma fonte do pop-up de planos do painel) — nada digitado de
// novo aqui. Os 3 planos têm o mesmo destaque. "Escolher" leva a /assinar,
// que pede cadastro/login e então abre o checkout da Cakto do plano.

const STEPS = ["Escolha seu plano", "Crie sua conta", "Pague com segurança pela Cakto"];

function formatPrice(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export default function PlanosPage() {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-[#05050a]">
      <Header />
      <main className="relative flex-1 overflow-hidden pt-16 pb-20 sm:pt-20">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_50%_at_50%_0%,rgba(99,102,241,0.18)_0%,rgba(5,5,10,0)_70%)]" />

        <div className="relative mx-auto max-w-[1100px] px-5 md:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-[clamp(30px,4.5vw,44px)] font-bold leading-[1.1] tracking-[-0.02em] text-white/92">
              Escolha seu plano
            </h1>
            <p className="mt-4 text-[16px] leading-relaxed text-white/55">
              Depois é só criar sua conta e finalizar o pagamento com segurança pela Cakto.
            </p>
          </div>

          <ol className="mx-auto mt-8 flex max-w-2xl flex-col items-center justify-center gap-2 text-[13px] text-white/45 sm:flex-row sm:gap-6">
            {STEPS.map((step, i) => (
              <li key={step} className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 text-[12px] font-semibold text-white/70">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>

          <div className="mt-10 grid gap-4 md:grid-cols-3 md:gap-5">
            {Object.values(PLANS).map((plan) => (
              <div
                key={plan.key}
                className="flex flex-col rounded-[20px] border border-white/10 bg-white/[0.03] p-6 sm:p-7"
              >
                <h2 className="text-xl font-bold text-white">{plan.name}</h2>
                <p className="mt-1 text-sm text-zinc-400">{plan.description}</p>

                <p className="mt-6 text-white">
                  <span className="text-sm text-zinc-400">R$ </span>
                  <span className="text-4xl font-bold tracking-tight">{formatPrice(plan.monthlyPriceCents)}</span>
                  <span className="text-sm text-zinc-400">/mês</span>
                </p>

                <PlanChoiceLink
                  plan={plan.key}
                  className="mt-7 inline-flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-6 text-[15px] font-semibold text-white shadow-xl shadow-purple-600/20 transition-transform active:scale-95 sm:hover:scale-[1.02]"
                >
                  Escolher {plan.name}
                </PlanChoiceLink>
                <p className="mt-2.5 text-center text-[11px] text-zinc-400">
                  Garantia de 7 dias • Cancele quando quiser
                </p>
              </div>
            ))}
          </div>

          <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 shrink-0 text-[#A855F7]" strokeWidth={2} />
              <p className="text-sm font-bold text-white">Garantia de 7 dias</p>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
              Teste o Virazo sem risco. Se não gostar, devolvemos 100% do seu dinheiro. Sem perguntas.
            </p>
            <ul className="mt-3 flex flex-col gap-1.5">
              {["Cancele quando quiser, sem multa", "Pagamento seguro via Pix ou cartão"].map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-zinc-300">
                  <Check className="h-4 w-4 shrink-0 text-emerald-400" strokeWidth={3} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
