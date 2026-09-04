"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles, Zap } from "lucide-react";
import { navItems } from "./navItems";
import SignOutButton from "./SignOutButton";

export default function Sidebar({ userName }: { userName: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-white/[0.06] lg:bg-[#05050a]">
      <div className="flex h-16 items-center gap-2 border-b border-white/[0.06] px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#FF6B5B] to-[#FFB84D]">
          <Sparkles className="h-4 w-4 text-white" strokeWidth={2.5} />
        </span>
        <span className="text-lg font-semibold tracking-tight text-white">
          Virazo
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        {navItems.map(({ label, href, icon: Icon, soon }) => {
          const isActive =
            pathname?.startsWith(href) || (label === "Séries" && pathname === "/dashboard") || false;
          return (
            <Link
              key={label}
              href={href}
              aria-disabled={soon}
              className={`group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-white/[0.06] text-white"
                  : soon
                    ? "pointer-events-none text-zinc-600"
                    : "text-zinc-400 hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              <span className="flex items-center gap-3">
                <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                {label}
              </span>
              {soon && (
                <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
                  em breve
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-4 border-t border-white/[0.06] p-4">
        <Link
          href="/dashboard/planos"
          className="flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 text-sm font-medium text-white transition-colors hover:border-white/20"
        >
          <Zap className="h-4 w-4" strokeWidth={2} />
          Fazer upgrade
        </Link>

        <div className="flex items-center gap-3 px-1">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-xs font-semibold text-zinc-300">
            {userName.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-400">
            {userName}
          </span>
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}
