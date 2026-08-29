"use client";

import { styleOptions } from "./styleOptions";
import { useDashboard } from "./DashboardContext";

export default function StylePicker() {
  const { openWizard } = useDashboard();

  return (
    <section>
      <h2 className="text-sm font-semibold text-white sm:text-base">
        Comece por um estilo
      </h2>
      <div className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {styleOptions.map(({ icon: Icon, title, gradient }) => (
          <button
            key={title}
            type="button"
            onClick={() => openWizard({ style: title })}
            className="card-glass flex shrink-0 flex-col items-center gap-2 rounded-2xl px-4 py-3.5 transition-colors hover:bg-white/[0.05]"
          >
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${gradient}`}
            >
              <Icon className="h-4 w-4 text-white" strokeWidth={2} />
            </span>
            <span className="text-xs font-medium text-zinc-300">{title}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
