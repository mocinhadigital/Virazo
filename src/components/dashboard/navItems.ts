import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, Wand2, Film, Sparkles, CreditCard, Settings } from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  soon?: boolean;
};

export const navItems: NavItem[] = [
  { label: "Painel", href: "/dashboard", icon: LayoutDashboard },
  { label: "Criar vídeo", href: "/dashboard#criar", icon: Wand2 },
  { label: "Séries", href: "/dashboard/series", icon: Sparkles },
  { label: "Meus vídeos", href: "#", icon: Film, soon: true },
  { label: "Planos", href: "/dashboard/planos", icon: CreditCard },
  { label: "Configurações", href: "#", icon: Settings, soon: true },
];
