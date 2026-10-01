"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";

// Progresso real da geração, lido de videos.progress_stage (gravado pelo
// servidor a cada etapa — ver src/lib/video/generateAssets.ts) e atualizado
// pela consulta periódica do DashboardContext enquanto houver vídeo
// "Gerando".

const STEPS = [
  { key: "roteiro", label: "Roteiro" },
  { key: "voz", label: "Voz" },
  { key: "imagens", label: "Imagens" },
  { key: "montagem", label: "Montagem" },
] as const;

// "salvando" (upload final) aparece dentro da etapa Montagem.
const STAGE_TO_STEP: Record<string, number> = {
  roteiro: 0,
  voz: 1,
  imagens: 2,
  montagem: 3,
  salvando: 3,
};

// Cenas por duração — mesmos números de SCENES_PER_DURATION
// (src/lib/ai/script.ts).
const SCENES_PER_DURATION: Record<string, number> = { "15s": 3, "30s": 5, "60s": 8, "90s": 12 };

// Estimativa de segundos por etapa. Aproximação para orientar o usuário,
// não promessa: a voz e a montagem crescem com o número de cenas.
const SECONDS = {
  roteiro: 15,
  vozPerScene: 6,
  imagens: 5,
  montagemPerScene: 5,
  salvando: 6,
};

function estimateRemainingSeconds(
  stage: string | null,
  current: number | null,
  total: number | null,
  scenes: number,
  elapsedSeconds: number,
): number {
  const n = total ?? scenes;
  const done = Math.max(0, (current ?? 1) - 1);
  const fullVoz = scenes * SECONDS.vozPerScene;
  const fullMontagem = scenes * SECONDS.montagemPerScene;

  switch (stage) {
    case "roteiro":
      return SECONDS.roteiro + fullVoz + SECONDS.imagens + fullMontagem + SECONDS.salvando;
    case "voz":
      return (n - done) * SECONDS.vozPerScene + SECONDS.imagens + fullMontagem + SECONDS.salvando;
    case "imagens":
      return SECONDS.imagens + fullMontagem + SECONDS.salvando;
    case "montagem":
      return (n - done) * SECONDS.montagemPerScene + SECONDS.salvando;
    case "salvando":
      return SECONDS.salvando;
    default: {
      // Sem etapa registrada ainda: estimativa total menos o tempo passado.
      const totalEstimate = SECONDS.roteiro + fullVoz + SECONDS.imagens + fullMontagem + SECONDS.salvando;
      return totalEstimate - elapsedSeconds;
    }
  }
}

function formatRemaining(seconds: number): string {
  if (seconds <= 20) return "quase pronto";
  if (seconds < 60) return "menos de 1 min restante";
  const minutes = Math.ceil(seconds / 60);
  return `cerca de ${minutes} min restante${minutes > 1 ? "s" : ""}`;
}

export default function VideoProgress({
  stage,
  current,
  total,
  startedAtIso,
  duration,
  compact = false,
}: {
  stage: string | null;
  current: number | null;
  total: number | null;
  startedAtIso: string;
  duration: string;
  compact?: boolean;
}) {
  // Relógio local só para o tempo restante andar entre uma consulta e outra.
  // Começa nulo (e não em Date.now()) para o HTML do servidor e o primeiro
  // render do navegador baterem.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  const scenes = SCENES_PER_DURATION[duration] ?? 5;
  const elapsedSeconds = now === null ? 0 : Math.max(0, (now - new Date(startedAtIso).getTime()) / 1000);
  const remaining = estimateRemainingSeconds(stage, current, total, scenes, elapsedSeconds);
  const activeStep = stage ? (STAGE_TO_STEP[stage] ?? 0) : 0;
  const counter = current && total && (stage === "voz" || stage === "montagem") ? ` ${current}/${total}` : "";
  const activeLabel = stage === "salvando" ? "Salvando" : STEPS[activeStep].label;

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        {activeLabel}
        {counter} · etapa {activeStep + 1} de {STEPS.length} · {formatRemaining(remaining)}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span>
            Etapa {activeStep + 1} de {STEPS.length}
          </span>
          <span>{formatRemaining(remaining)}</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] transition-all duration-500"
            style={{ width: `${((activeStep + 0.5) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {STEPS.map((step, i) => {
          const state = i < activeStep ? "done" : i === activeStep ? "active" : "pending";
          return (
            <div key={step.key} className="flex items-center gap-3">
              {state === "done" && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />}
              {state === "active" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#4C3BFF]" />}
              {state === "pending" && <Circle className="h-4 w-4 shrink-0 text-zinc-700" />}
              <span className={`text-sm ${state === "pending" ? "text-zinc-600" : "text-zinc-200"}`}>
                {state === "active" ? `${activeLabel}${counter}` : step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
