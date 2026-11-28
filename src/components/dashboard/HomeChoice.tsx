"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CalendarClock, Film } from "lucide-react";
import { useDashboard } from "./DashboardContext";
import RealisticTopCard from "./realistic/RealisticTopCard";
import { LockedFeatureCard } from "./RealisticOnlyLock";

// Tela inicial: dois botões grandes e bem explicados. O cliente nunca fica sem saber por onde
// começar: "um vídeo só" ou "uma série". Sem nenhum vídeo ainda, mostra "Comece aqui" apontando
// para os botões (em vez de uma tela vazia).
export default function HomeChoice({ seriesCount }: { seriesCount: number }) {
  const { plan, isAdmin, realisticOnly, videos, openWizard, openPlanModal } = useDashboard();
  const hasPlan = !!plan || isAdmin;

  // Quem não tem plano (e não usa só o Vídeo Realista) continua vendo o pop-up de planos ao
  // chegar aqui, como sempre foi.
  useEffect(() => {
    if (!hasPlan && !realisticOnly) openPlanModal();
  }, [hasPlan, realisticOnly, openPlanModal]);

  // Quem usa só o Vídeo Realista: o cartão do Vídeo Realista e o convite discreto para os planos.
  if (!hasPlan) {
    return (
      <div className="mx-auto max-w-[720px]">
        <RealisticTopCard />
        {realisticOnly && (
          <LockedFeatureCard
            title="Vídeos e séries"
            description="Criar vídeos do dia a dia e séries está disponível nos planos do Virazo."
          />
        )}
      </div>
    );
  }

  const isNew = videos.length === 0 && seriesCount === 0;

  return (
    <div className="mx-auto max-w-[720px]">
      <h1 className="text-[26px] font-bold leading-tight tracking-tight text-white sm:text-[30px]">
        {isNew ? "Comece aqui 👇" : "O que você quer fazer hoje?"}
      </h1>
      <p className="mt-2 text-[16px] leading-relaxed text-zinc-400">
        {isNew
          ? "Escolha uma das opções abaixo. É só tocar — a gente guia você passo a passo."
          : "Escolha uma das opções abaixo."}
      </p>

      <div className="mt-6 flex flex-col gap-4">
        <button
          type="button"
          onClick={() => openWizard()}
          className="group flex items-center gap-4 rounded-3xl border border-white/10 bg-gradient-to-br from-[#4C3BFF] to-[#A855F7] p-5 text-left shadow-xl shadow-[#4C3BFF]/20 active:scale-[0.99] sm:p-6"
        >
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <Film className="h-7 w-7 text-white" strokeWidth={2} />
          </span>
          <span className="min-w-0">
            <span className="block text-[20px] font-bold leading-snug text-white">Criar um vídeo agora</span>
            <span className="mt-1 block text-[15px] leading-snug text-white/85">
              Um vídeo só, pronto em cerca de 1 minuto.
            </span>
          </span>
        </button>

        <Link
          href="/dashboard/series/nova"
          className="flex items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-left hover:bg-white/[0.07] active:scale-[0.99] sm:p-6"
        >
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#EC4899]/30 to-[#F97316]/30">
            <CalendarClock className="h-7 w-7 text-amber-200" strokeWidth={2} />
          </span>
          <span className="min-w-0">
            <span className="block text-[20px] font-bold leading-snug text-white">Criar uma série</span>
            <span className="mt-1 block text-[15px] leading-snug text-zinc-300">
              Vídeos novos quando você pedir, ou todo dia no automático, se preferir.
            </span>
          </span>
        </Link>
      </div>

      {!isNew && (
        <p className="mt-5 text-[14px] text-zinc-500">
          Seus vídeos prontos estão em{" "}
          <Link href="/dashboard/videos" className="font-semibold text-zinc-300 underline-offset-2 hover:underline">
            Vídeos
          </Link>
          {seriesCount > 0 && (
            <>
              {" "}e suas séries em{" "}
              <Link href="/dashboard/series" className="font-semibold text-zinc-300 underline-offset-2 hover:underline">
                Séries
              </Link>
            </>
          )}
          .
        </p>
      )}

      <div className="mt-8">
        <RealisticTopCard />
      </div>
    </div>
  );
}
