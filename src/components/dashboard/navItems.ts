import type { LucideIcon } from "lucide-react";
import { Home, Sparkles, Film, BookOpen, MessageCircle, Settings } from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  soon?: boolean;
  // Nome curto para o menu de baixo do celular (cabe 6 itens).
  mobileLabel?: string;
};

// Início primeiro: o cliente sempre tem um jeito de voltar ao ponto de partida.
export const navItems: NavItem[] = [
  { label: "Início", href: "/dashboard", icon: Home },
  { label: "Séries", href: "/dashboard/series", icon: Sparkles },
  { label: "Vídeos", href: "/dashboard/videos", icon: Film },
  { label: "Guias", href: "/dashboard/guias", icon: BookOpen },
  { label: "Fale Conosco", href: "/dashboard/contato", icon: MessageCircle, mobileLabel: "Suporte" },
  { label: "Configurações", href: "/dashboard/configuracoes", icon: Settings, mobileLabel: "Conta" },
];

// "Início" só fica marcado na tela inicial; os demais, em qualquer tela dentro deles.
export function isNavActive(href: string, pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
}
