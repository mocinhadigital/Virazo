import type { LucideIcon } from "lucide-react";
import { Sparkles, Film, BookOpen, MessageCircle, Settings } from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  soon?: boolean;
};

export const navItems: NavItem[] = [
  { label: "Séries", href: "/dashboard/series", icon: Sparkles },
  { label: "Vídeos", href: "/dashboard/videos", icon: Film },
  { label: "Guias", href: "/dashboard/guias", icon: BookOpen },
  { label: "Fale Conosco", href: "/dashboard/contato", icon: MessageCircle },
  { label: "Configurações", href: "/dashboard/configuracoes", icon: Settings },
];
