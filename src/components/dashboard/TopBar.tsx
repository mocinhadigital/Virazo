"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles, ChevronRight } from "lucide-react";
import { useIsCriarVideoActive } from "./useCriarVideoHash";

const ROUTE_TITLES: Record<string, string> = {
  "/dashboard/configuracoes": "Configurações",
  "/dashboard/series": "Séries",
  "/dashboard/videos": "Meus vídeos",
  "/dashboard/planos": "Planos",
  "/dashboard/guias": "Guias",
  "/dashboard/contato": "Fale Conosco",
};

export default function TopBar() {
  const pathname = usePathname();
  const isCriarVideo = useIsCriarVideoActive();
  const matchedRoute = Object.entries(ROUTE_TITLES).find(([prefix]) => pathname?.startsWith(prefix));
  const isCreateSeries = pathname === "/dashboard";
  const pageTitle = isCriarVideo ? "Criar vídeo" : (matchedRoute?.[1] ?? "Painel");

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#05050a]/80 backdrop-blur-md">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/dashboard" className="flex items-center gap-2 lg:hidden">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#4C3BFF] to-[#A855F7]">
            <Sparkles className="h-4 w-4 text-white" strokeWidth={2.5} />
          </span>
          <span className="text-base font-semibold tracking-tight text-white">
            Virazo
          </span>
        </Link>

        {isCreateSeries ? (
          <nav className="hidden items-center gap-2 text-[14px] lg:flex">
            <Link href="/dashboard/series" className="text-zinc-600 hover:text-white">
              Séries
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-zinc-600" />
            <span className="text-white">Criar nova série</span>
          </nav>
        ) : (
          <h1 className="hidden text-base font-semibold text-white lg:block">
            {pageTitle}
          </h1>
        )}

        <div className="flex items-center gap-3">
          <span className="h-8 w-8 rounded-full bg-gradient-to-br from-[#4C3BFF] to-[#A855F7] ring-2 ring-white/10" />
        </div>
      </div>
    </header>
  );
}
