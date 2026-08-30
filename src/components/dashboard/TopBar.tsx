"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles, Zap } from "lucide-react";
import { useDashboard } from "./DashboardContext";
import { useIsCriarVideoActive } from "./useCriarVideoHash";

export default function TopBar() {
  const { credits } = useDashboard();
  const pathname = usePathname();
  const isCriarVideo = useIsCriarVideoActive();
  const pageTitle = isCriarVideo
    ? "Criar vídeo"
    : pathname?.startsWith("/dashboard/configuracoes")
      ? "Configurações"
      : pathname?.startsWith("/dashboard/series")
        ? "Séries"
        : "Painel";

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#05050a]/80 backdrop-blur-md">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/dashboard" className="flex items-center gap-2 lg:hidden">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#FF6B5B] to-[#FFB84D]">
            <Sparkles className="h-4 w-4 text-white" strokeWidth={2.5} />
          </span>
          <span className="text-base font-semibold tracking-tight text-white">
            Virazo
          </span>
        </Link>

        <h1 className="hidden text-base font-semibold text-white lg:block">
          {pageTitle}
        </h1>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-300">
            <Zap className="h-3.5 w-3.5 text-[#FF6B5B]" strokeWidth={2.5} />
            {credits} créditos
          </span>
          <span className="h-8 w-8 rounded-full bg-gradient-to-br from-[#FF6B5B] to-[#FFB84D] ring-2 ring-white/10" />
        </div>
      </div>
    </header>
  );
}
