import { Sparkles } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-white/[0.06] py-12">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <a href="#topo" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#FF6B5B] to-[#FFB84D]">
              <Sparkles className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
            </span>
            <span className="text-sm font-semibold text-white">Virazo</span>
          </a>

          <div className="grid grid-cols-2 gap-8 sm:flex sm:gap-16">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Produto
              </h3>
              <ul className="mt-3 flex flex-col gap-2">
                <li>
                  <a href="#como-funciona" className="text-sm text-zinc-400 hover:text-white">
                    Como funciona
                  </a>
                </li>
                <li>
                  <a href="#faq" className="text-sm text-zinc-400 hover:text-white">
                    FAQ
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <p className="text-xs text-zinc-500">
          © {new Date().getFullYear()} Virazo. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
