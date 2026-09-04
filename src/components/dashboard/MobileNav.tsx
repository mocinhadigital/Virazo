"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "./navItems";

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] bg-[#05050a]/90 backdrop-blur-md lg:hidden">
      <div className="mx-auto flex max-w-md items-center justify-between px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2.5">
        {navItems.map(({ label, href, icon: Icon }) => {
          const isActive =
            pathname?.startsWith(href) || (label === "Séries" && pathname === "/dashboard") || false;
          return (
            <Link
              key={label}
              href={href}
              className={`flex flex-col items-center gap-1 px-2 py-1 ${
                isActive ? "text-white" : "text-zinc-500"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={2} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
