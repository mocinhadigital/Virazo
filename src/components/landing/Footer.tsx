import { Sparkles } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-white/[0.06] py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 text-center sm:flex-row sm:justify-between sm:px-6 sm:text-left lg:px-8">
        <a href="#topo" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#FF6B5B] to-[#FFB84D]">
            <Sparkles className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
          </span>
          <span className="text-sm font-semibold text-white">Virazo</span>
        </a>

        <p className="text-xs text-zinc-500">
          © {new Date().getFullYear()} Virazo. Vídeos criados por IA, sem
          você precisar aparecer.
        </p>
      </div>
    </footer>
  );
}
