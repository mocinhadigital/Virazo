"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { navItems, isNavActive } from "./navItems";
import { useDashboard } from "./DashboardContext";

export default function MobileNav() {
  const pathname = usePathname();
  const { realisticOnly } = useDashboard();

  // Durante a criação da série (passo a passo) a barra some: ela cobria o fim da caixa de texto da
  // história e o contador. O passo a passo tem seus próprios botões Voltar/Continuar.
  if (pathname === "/dashboard/series/nova") return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] bg-[#05050a]/90 backdrop-blur-md lg:hidden">
      <div className="mx-auto flex max-w-md items-center justify-between px-1 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2.5">
        {navItems.map(({ label, mobileLabel, href, icon: Icon }) => {
          const isActive = isNavActive(href, pathname);
          return (
            <Link
              key={label}
              href={href}
              className={`flex flex-col items-center gap-1 px-2 py-1 ${
                isActive ? "text-white" : "text-zinc-500"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={2} />
              <span className="flex items-center gap-0.5 text-[10px] font-medium">
                {mobileLabel ?? label}
                {realisticOnly && href === "/dashboard/series" && <Lock className="h-2.5 w-2.5" aria-label="Disponível nos planos" />}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
