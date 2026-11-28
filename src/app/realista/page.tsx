import type { Metadata } from "next";
import { Check, ShieldCheck, Sparkles } from "lucide-react";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import RealistaExamples from "@/components/landing/RealistaExamples";
import RealisticChoiceLink from "@/components/checkout/RealisticChoiceLink";
import FeaturedPlanFrame from "@/components/checkout/FeaturedPlanFrame";
import { REALISTIC_PACKAGES, formatBRL, formatPricePerCredit } from "@/lib/realistic/constants";

export const metadata: Metadata = {
  title: "Vídeo Realista — Virazo",
  description:
    "Vídeos com pessoas e cenas de verdade se movendo. Compre créditos avulsos, sem mensalidade e sem prazo de validade.",
};

// Página pública de venda do Vídeo Realista (sem precisar de plano). Preços e créditos vêm de
// REALISTIC_PACKAGES — a mesma fonte do pop-up de compra do painel; os vídeos de exemplo são os
// mesmos do pop-up. Nada de depoimentos ou números que não existam. "Escolher" leva a
// /realista/comprar, que pede cadastro/login e então abre o checkout da Cakto do pacote.

const STEPS = [
  "Escolha o pacote de créditos",
  "Crie sua conta (ou entre)",
  "Pague com segurança pela Cakto",
  "Os créditos entram sozinhos e você cria seu vídeo",
];

const PACKAGE_BULLETS = ["1 crédito = vídeo de 30s", "2 créditos = vídeo de 60s", "Créditos sem prazo de validade"];

export default function RealistaPage() {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-[#05050a]">
      <Header />
      <main className="relative flex-1 overflow-hidden pt-16 pb-20 sm:pt-20">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[460px] bg-[radial-gradient(60%_50%_at_50%_0%,rgba(168,85,247,0.2)_0%,rgba(5,5,10,0)_70%)]" />

        <div className="relative mx-auto max-w-[1100px] px-5 md:px-6">
          {/* Topo */}
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-300/15 px-3 py-1 text-[12px] font-bold uppercase tracking-wide text-amber-200">
              <Sparkles className="h-3.5 w-3.5" />
              Vídeo Realista
            </span>
            <h1 className="mt-4 text-[clamp(30px,4.5vw,46px)] font-bold leading-[1.1] tracking-[-0.02em] text-white/92">
              Vídeos com pessoas e cenas de verdade se movendo
            </h1>
            <p className="mt-4 text-[16px] leading-relaxed text-white/55">
              Você escreve a ideia, o Virazo cria o roteiro, as imagens, a narração e dá movimento às cenas. Compre só os
              créditos que precisar: <strong className="text-white/80">sem mensalidade e sem plano</strong>.
            </p>
            <a
              href="#pacotes"
              className="mt-7 inline-flex h-12 items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-8 text-[15px] font-semibold text-white shadow-xl shadow-purple-600/20"
            >
              Ver os pacotes
            </a>
          </div>

          {/* Exemplos */}
          <section className="mt-14" aria-labelledby="exemplos">
            <h2 id="exemplos" className="text-center text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Veja o que o Vídeo Realista faz
            </h2>
            <div className="mt-5">
              <RealistaExamples />
            </div>
          </section>

          {/* Como funciona */}
          <section className="mt-16" aria-labelledby="como-funciona">
            <h2 id="como-funciona" className="text-center text-2xl font-bold text-white">
              Como funciona
            </h2>
            <ol className="mx-auto mt-6 grid max-w-3xl gap-3 sm:grid-cols-2">
              {STEPS.map((step, i) => (
                <li
                  key={step}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-sm text-zinc-200"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 text-[12px] font-semibold text-white/70">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
            <p className="mx-auto mt-4 max-w-3xl text-center text-sm text-zinc-400">
              <strong className="text-zinc-200">1 crédito = vídeo de 30 segundos</strong> •{" "}
              <strong className="text-zinc-200">2 créditos = vídeo de 60 segundos</strong> • pagamento único • os créditos
              não vencem.
            </p>
          </section>

          {/* Pacotes */}
          <section id="pacotes" className="mt-16 scroll-mt-24" aria-labelledby="pacotes-titulo">
            <h2 id="pacotes-titulo" className="text-center text-2xl font-bold text-white">
              Escolha seu pacote
            </h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3 md:gap-5">
              {REALISTIC_PACKAGES.map((pkg) => {
                const card = (
                  <div
                    className={
                      pkg.featured
                        ? "flex h-full flex-col rounded-[20px] bg-[#0b0b14] p-6 sm:p-8"
                        : "flex h-full flex-col rounded-[20px] border border-white/10 bg-white/[0.03] p-6 sm:p-7"
                    }
                  >
                    <p className="text-4xl font-extrabold text-white">{pkg.credits}</p>
                    <p className="text-sm font-medium text-zinc-300">créditos de vídeo realista</p>
                    <p className="mt-5 text-3xl font-bold tracking-tight text-white">{formatBRL(pkg.priceCents)}</p>
                    <p className="text-xs text-zinc-500">
                      {formatPricePerCredit(pkg.priceCents, pkg.credits)} por crédito • pagamento único
                    </p>
                    <ul className="mt-4 flex flex-col gap-1.5">
                      {PACKAGE_BULLETS.map((item) => (
                        <li key={item} className="flex items-center gap-2 text-sm text-zinc-300">
                          <Check className="h-4 w-4 shrink-0 text-emerald-400" strokeWidth={3} />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <RealisticChoiceLink
                      packageKey={pkg.key}
                      className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-6 text-[15px] font-semibold text-white shadow-xl shadow-purple-600/20 transition-transform active:scale-95 sm:hover:scale-[1.02]"
                    >
                      Quero este pacote
                    </RealisticChoiceLink>
                  </div>
                );

                // O recomendado sobe para o topo no celular e fica um pouco maior no computador.
                return pkg.featured ? (
                  <FeaturedPlanFrame
                    key={pkg.key}
                    badge="MAIS VANTAJOSO"
                    className="order-first mt-3 md:order-none md:mt-0 md:scale-105"
                  >
                    {card}
                  </FeaturedPlanFrame>
                ) : pkg.key === "3" ? (
                  // Pacote de entrada: selo "PARA TESTAR" (o mesmo do pop-up de compra do painel).
                  <div key={pkg.key} className="relative mt-3 md:mt-0">
                    <span className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-3 py-1 text-[11px] font-bold tracking-wide text-white">
                      PARA TESTAR
                    </span>
                    {card}
                  </div>
                ) : (
                  <div key={pkg.key} className="contents">
                    {card}
                  </div>
                );
              })}
            </div>

            <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 shrink-0 text-[#A855F7]" strokeWidth={2} />
                <p className="text-sm font-bold text-white">Compra simples e segura</p>
              </div>
              <ul className="mt-3 flex flex-col gap-1.5">
                {[
                  "Você não precisa de plano para comprar créditos",
                  "Pagamento seguro pela Cakto",
                  "Os créditos são liberados na sua conta assim que o pagamento é aprovado",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-zinc-300">
                    <Check className="h-4 w-4 shrink-0 text-emerald-400" strokeWidth={3} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
