import Link from "next/link";
import { Sparkles } from "lucide-react";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#05050a]/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1100px] items-center justify-between px-5 md:px-6">
        <Link href="/#topo" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-purple-600">
            <Sparkles className="h-4 w-4 text-white" strokeWidth={2.5} />
          </span>
          <span className="text-lg font-semibold tracking-tight text-white">
            Virazo
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <Link
            href="/#como-funciona"
            className="text-sm font-medium text-zinc-400 transition-colors hover:text-white"
          >
            Como funciona
          </Link>
          <Link
            href="/#faq"
            className="text-sm font-medium text-zinc-400 transition-colors hover:text-white"
          >
            FAQ
          </Link>
          <Link
            href="/contato"
            className="text-sm font-medium text-zinc-400 transition-colors hover:text-white"
          >
            Contato
          </Link>
          <Link
            href="/afiliados"
            className="text-sm font-medium text-zinc-400 transition-colors hover:text-white"
          >
            Afiliados
          </Link>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className="hidden items-center px-3 py-2 text-sm font-medium text-zinc-200 transition-colors hover:text-white sm:flex"
          >
            Entrar
          </Link>
          <Link
            href="/login?mode=signup"
            className="rounded-full bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-purple-600/20 transition-transform active:scale-95 sm:hover:scale-[1.03]"
          >
            Começar agora
          </Link>
        </div>
      </div>
    </header>
  );
}
