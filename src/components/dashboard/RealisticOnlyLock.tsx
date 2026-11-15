"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { useDashboard } from "./DashboardContext";

// Cartão discreto no lugar de uma área que exige plano, para quem usa só o Vídeo Realista (entrou
// pelo link /realista ou comprou créditos, e não tem plano). Nada de janela por cima: é um
// convite dentro da própria página, com atalho para a área do Vídeo Realista e para os planos.
export function LockedFeatureCard({ title, description }: { title: string; description: string }) {
  const { openPlanModal } = useDashboard();
  return (
    <div className="mx-auto max-w-[720px] rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
      <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-zinc-400">
        <Lock className="h-4 w-4" />
      </span>
      <h2 className="mt-3 text-base font-semibold text-white">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-zinc-400">{description}</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={openPlanModal}
          className="inline-flex items-center justify-center rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-zinc-200 hover:bg-white/5"
        >
          Ver planos
        </button>
        <Link href="/dashboard" className="text-xs font-medium text-zinc-400 underline-offset-2 hover:text-white hover:underline">
          Voltar ao Vídeo Realista
        </Link>
      </div>
    </div>
  );
}

// Mostra o conteúdo normalmente; para quem usa só o Vídeo Realista, mostra o cartão no lugar.
export default function RealisticOnlyLock({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const { realisticOnly } = useDashboard();
  if (realisticOnly) return <LockedFeatureCard title={title} description={description} />;
  return <>{children}</>;
}
