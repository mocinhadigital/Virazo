import {
  Flame,
  BookOpen,
  Newspaper,
  ShoppingBag,
  Laugh,
  HeartPulse,
  Ghost,
  Swords,
  Brain,
  type LucideIcon,
} from "lucide-react";

export type StyleOption = {
  icon: LucideIcon;
  title: string;
  gradient: string;
};

export const styleOptions: StyleOption[] = [
  { icon: Flame, title: "Motivacional", gradient: "from-orange-500 to-rose-500" },
  { icon: BookOpen, title: "Storytelling", gradient: "from-slate-500 to-blue-700" },
  { icon: Newspaper, title: "Curiosidades", gradient: "from-sky-400 to-blue-500" },
  { icon: ShoppingBag, title: "Produto", gradient: "from-emerald-400 to-teal-500" },
  { icon: Laugh, title: "Humor", gradient: "from-yellow-400 to-lime-500" },
  { icon: HeartPulse, title: "Bem-estar", gradient: "from-rose-400 to-orange-400" },
  // Tons novos: terror/true crime/mistério, história épica (medieval, mitologia) e filosofia.
  { icon: Ghost, title: "Suspense", gradient: "from-purple-600 to-slate-800" },
  { icon: Swords, title: "Épico", gradient: "from-amber-500 to-red-700" },
  { icon: Brain, title: "Reflexivo", gradient: "from-indigo-400 to-cyan-500" },
];
