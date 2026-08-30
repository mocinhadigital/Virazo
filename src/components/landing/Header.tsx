import Link from "next/link";
import { Sparkles } from "lucide-react";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#05050a]/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="#topo" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#FF6B5B] to-[#FFB84D]">
            <Sparkles className="h-4 w-4 text-white" strokeWidth={2.5} />
          </span>
          <span className="text-lg font-semibold tracking-tight text-white">
            Virazo
          </span>
        </a>

        <nav className="hidden items-center gap-6 md:flex">
          <a
            href="#como-funciona"
            className="text-sm font-medium text-zinc-400 transition-colors hover:text-white"
          >
            Como funciona
          </a>
          <a
            href="#estilos-visuais"
            className="text-sm font-medium text-zinc-400 transition-colors hover:text-white"
          >
            Estilos
          </a>
          <a
            href="#faq"
            className="text-sm font-medium text-zinc-400 transition-colors hover:text-white"
          >
            FAQ
          </a>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className="hidden items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/5 sm:flex"
          >
            <GoogleIcon className="h-4 w-4" />
            Entrar com Google
          </Link>
          <Link
            href="/login?mode=signup"
            className="rounded-full bg-gradient-to-r from-[#FF6B5B] to-[#FFB84D] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-[#FF6B5B]/20 transition-transform active:scale-95 sm:hover:scale-[1.03]"
          >
            Começar agora
          </Link>
        </div>
      </div>
    </header>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.2s2.7-6.2 6-6.2c1.9 0 3.1.8 3.9 1.5l2.7-2.6C16.9 3.1 14.7 2 12 2 6.9 2 2.8 6.1 2.8 11.2S6.9 20.4 12 20.4c6.9 0 8.9-4.8 8.9-7.3 0-.5-.1-.9-.1-1.3H12z"
      />
    </svg>
  );
}
