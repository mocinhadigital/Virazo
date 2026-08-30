import Link from "next/link";
import { LayoutDashboard, Film, Settings, Wand2 } from "lucide-react";

export default function MobileNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] bg-[#05050a]/90 backdrop-blur-md lg:hidden">
      <div className="mx-auto flex max-w-md items-center justify-between px-6 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2.5">
        <Link
          href="/dashboard"
          className="flex flex-col items-center gap-1 px-2 py-1 text-white"
        >
          <LayoutDashboard className="h-5 w-5" strokeWidth={2} />
          <span className="text-[10px] font-medium">Painel</span>
        </Link>

        <Link
          href="/dashboard/videos"
          className="flex flex-col items-center gap-1 px-2 py-1 text-zinc-400"
        >
          <Film className="h-5 w-5" strokeWidth={2} />
          <span className="text-[10px] font-medium">Vídeos</span>
        </Link>

        <Link href="/dashboard#criar" className="-mt-6 flex flex-col items-center gap-1">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#FF6B5B] to-[#FFB84D] shadow-lg shadow-[#FF6B5B]/30">
            <Wand2 className="h-5 w-5 text-white" strokeWidth={2.2} />
          </span>
        </Link>

        <Link
          href="/dashboard/configuracoes"
          className="flex flex-col items-center gap-1 px-2 py-1 text-zinc-400"
        >
          <Settings className="h-5 w-5" strokeWidth={2} />
          <span className="text-[10px] font-medium">Config</span>
        </Link>

        <span className="flex flex-col items-center gap-1 px-2 py-1">
          <span className="h-5 w-5 rounded-full bg-gradient-to-br from-[#FF6B5B] to-[#FFB84D] ring-2 ring-white/10" />
          <span className="text-[10px] font-medium text-zinc-600">Perfil</span>
        </span>
      </div>
    </nav>
  );
}
