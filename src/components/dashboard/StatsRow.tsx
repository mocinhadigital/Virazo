"use client";

import { Film, Zap, Clock } from "lucide-react";
import { useDashboard } from "./DashboardContext";

export default function StatsRow() {
  const { videos, credits } = useDashboard();

  const hoursSaved = Math.round(videos.length * 0.25 * 10) / 10;

  const stats = [
    { icon: Film, value: `${videos.length}`, label: "vídeos criados" },
    { icon: Zap, value: `${credits}`, label: "créditos restantes" },
    { icon: Clock, value: `${hoursSaved}h`, label: "economizadas" },
  ];

  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-4">
      {stats.map(({ icon: Icon, value, label }) => (
        <div
          key={label}
          className="card-glass flex flex-col gap-2 rounded-2xl p-4 sm:p-5"
        >
          <Icon className="h-4 w-4 text-[#4C3BFF]" strokeWidth={2} />
          <div>
            <span className="block text-lg font-bold text-white sm:text-xl">
              {value}
            </span>
            <span className="block text-[11px] leading-tight text-zinc-500 sm:text-xs">
              {label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
