"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { REALISTIC_PACKAGES, formatBRL, type RealisticPackageKey } from "@/lib/realistic/constants";
import type { RealisticCheckoutUrls } from "@/lib/billing/realisticPackages";
import { useDashboard } from "../DashboardContext";
import { REALISTIC_EXAMPLES } from "./realisticExamples";
import { markCaktoCheckoutStarted } from "../CaktoPaymentVerifier";

// Pop-up "Comprar vídeos realistas": 2 pacotes de pagamento único na Cakto.
// O crédito entra sozinho quando o pagamento é aprovado (webhook / consulta à
// API da Cakto); "Já paguei" força a verificação na hora.
// Selo de cada pacote (o do meio não tem).
const PACKAGE_BADGES: Partial<Record<RealisticPackageKey, { text: string; className: string }>> = {
  "3": { text: "PARA TESTAR", className: "bg-gradient-to-r from-[#4C3BFF] to-[#A855F7]" },
  "20": { text: "MAIS VANTAJOSO", className: "bg-gradient-to-r from-[#EC4899] to-[#F97316]" },
};

// "R$ 19" (inteiro) ou "R$ 14,70" / "R$ 12,35" (sempre 2 casas quando tem centavos).
function formatPerVideo(priceCents: number, credits: number): string {
  const cents = Math.round(priceCents / credits);
  const value = (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `R$ ${value}`;
}

export default function RealisticBuyModal({ checkoutUrls }: { checkoutUrls: RealisticCheckoutUrls | null }) {
  const { isRealisticBuyOpen, closeRealisticBuy } = useDashboard();
  if (!isRealisticBuyOpen) return null;
  return <BuyPanel checkoutUrls={checkoutUrls} onClose={closeRealisticBuy} />;
}

function BuyPanel({ checkoutUrls, onClose }: { checkoutUrls: RealisticCheckoutUrls | null; onClose: () => void }) {
  const { realisticCredits, caktoVerifyEnabled, isVerifyingPayment, verifyPayment } = useDashboard();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<RealisticPackageKey | null>(null);
  // Exemplo cujo arquivo não carregou (some da faixa em vez de mostrar quebrado).
  const [brokenExamples, setBrokenExamples] = useState<string[]>([]);
  const examples = REALISTIC_EXAMPLES.filter((e) => !brokenExamples.includes(e.src));
  // Só os pacotes que têm link de checkout configurado.
  const packages = REALISTIC_PACKAGES.filter((pkg) => !!checkoutUrls?.[pkg.key]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Voltar do checkout pela seta do navegador restaura a página com o botão
  // ainda "carregando" — mesmo cuidado do pop-up de planos.
  useEffect(() => {
    function reset() {
      setOpening(null);
    }
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) reset();
    }
    function onVisible() {
      if (document.visibilityState === "visible") reset();
    }
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  function handleBuy(key: RealisticPackageKey) {
    const url = checkoutUrls?.[key];
    if (!url) return;
    setError(null);
    setOpening(key);
    // Na volta, o painel sabe que deve verificar o pagamento (ver
    // CaktoPaymentVerifier), mesmo sem o ?checkout=cakto na URL.
    markCaktoCheckoutStarted();
    window.location.assign(url);
  }

  async function handleVerify() {
    setError(null);
    setMessage(null);
    const result = await verifyPayment();
    switch (result.status) {
      case "credits_added":
      case "activated":
        onClose();
        return;
      case "not_found":
        setMessage(
          "Ainda não encontramos um pagamento aprovado no e-mail da sua conta. Pix e boleto podem levar alguns minutos — tente de novo em instantes.",
        );
        return;
      case "rate_limited":
        setMessage(`Acabamos de verificar. Tente de novo em ${result.retryAfterSeconds}s.`);
        return;
      case "not_configured":
        setMessage("A verificação automática não está disponível no momento.");
        return;
      case "error":
        setError(result.message);
        return;
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="m-auto w-full max-w-lg rounded-3xl border border-white/10 bg-[#0a0a12] p-5 sm:max-w-3xl sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-white sm:text-2xl">
              <Sparkles className="h-5 w-5 text-amber-300" />
              Comprar vídeos realistas
            </h2>
            <p className="mt-1.5 text-sm text-zinc-400">
              Pagamento único, sem mensalidade. Os créditos não vencem.{" "}
              <strong className="text-zinc-200">1 crédito = vídeo de 30s • 2 créditos = vídeo de 60s.</strong> Você
              tem{" "}
              <strong className="text-white">{realisticCredits}</strong>{" "}
              {realisticCredits === 1 ? "crédito" : "créditos"} agora.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-white/5 hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {examples.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Veja o que o Vídeo Realista faz
            </p>
            <div className="grid grid-cols-3 gap-2">
              {examples.map((example) => (
                <div key={example.src} className="relative aspect-[9/16] overflow-hidden rounded-xl bg-[#1c1c1f]">
                  <video
                    src={example.src}
                    poster={example.poster}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    aria-label={example.title}
                    onError={() => setBrokenExamples((prev) => [...prev, example.src])}
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={`mt-6 grid grid-cols-1 gap-3.5 sm:gap-4 ${packages.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          {packages.map((pkg) => {
            const badge = PACKAGE_BADGES[pkg.key];
            return (
              <div
                key={pkg.key}
                className={`relative flex items-center justify-between gap-3 rounded-2xl border p-4 sm:flex-col sm:items-stretch sm:justify-start sm:p-5 ${
                  pkg.featured
                    ? "border-pink-400/40 bg-gradient-to-b from-[#A855F7]/15 to-white/[0.02]"
                    : "border-white/10 bg-white/[0.02]"
                }`}
              >
                {badge && (
                  <span
                    className={`absolute -top-3 left-4 whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold tracking-wide text-white sm:left-1/2 sm:-translate-x-1/2 ${badge.className}`}
                  >
                    {badge.text}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="whitespace-nowrap text-xl font-extrabold leading-tight text-white sm:text-2xl">
                    {pkg.credits} vídeos <span className="text-base font-bold text-zinc-300">de 30s</span>
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-400 sm:text-sm">sai {formatPerVideo(pkg.priceCents, pkg.credits)} cada</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2 sm:mt-3 sm:items-stretch">
                  <p className="text-xl font-bold text-white sm:text-2xl">{formatBRL(pkg.priceCents)}</p>
                  <button
                    type="button"
                    disabled={!checkoutUrls || opening !== null}
                    onClick={() => handleBuy(pkg.key)}
                    className="inline-flex h-10 w-28 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-full"
                  >
                    {opening === pkg.key && <Loader2 className="h-4 w-4 animate-spin" />}
                    Comprar
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {packages.length > 0 && (
          <p className="mt-4 flex items-center justify-center gap-2 text-xs text-zinc-300">
            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" strokeWidth={3} />
            Créditos sem prazo de validade
          </p>
        )}

        {packages.length === 0 && (
          <p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-2.5 text-center text-xs font-medium text-amber-300">
            A compra de vídeos realistas ainda não está disponível. Tente de novo mais tarde.
          </p>
        )}

        {caktoVerifyEnabled && (
          <button
            type="button"
            disabled={isVerifyingPayment}
            onClick={handleVerify}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 px-6 py-3 text-sm font-medium text-zinc-300 hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isVerifyingPayment && <Loader2 className="h-4 w-4 animate-spin" />}
            {isVerifyingPayment ? "Verificando seu pagamento..." : "Já paguei, verificar meu pagamento"}
          </button>
        )}

        {message && (
          <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-center text-xs font-medium text-zinc-300">
            {message}
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
