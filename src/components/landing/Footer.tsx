import Link from "next/link";
import { Sparkles } from "lucide-react";

const COLUMNS = [
  {
    title: "Produto",
    links: [
      { label: "Como funciona", href: "/#como-funciona" },
      { label: "FAQ", href: "/#faq" },
    ],
  },
  {
    title: "Empresa",
    links: [
      { label: "Sobre", href: "/sobre" },
      { label: "Contato", href: "/contato" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Termos de uso", href: "/termos" },
      { label: "Privacidade", href: "/privacidade" },
    ],
  },
];

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

          <div className="grid grid-cols-3 gap-8 sm:flex sm:gap-16">
            {COLUMNS.map(({ title, links }) => (
              <div key={title}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  {title}
                </h3>
                <ul className="mt-3 flex flex-col gap-2">
                  {links.map(({ label, href }) => (
                    <li key={label}>
                      <Link href={href} className="text-sm text-zinc-400 hover:text-white">
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-zinc-500">
          © {new Date().getFullYear()} Virazo. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
