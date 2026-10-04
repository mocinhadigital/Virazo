import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { startOfDayInManaus } from "@/lib/billing/dailyLimit";

// Painel "Funil de Conversão" — só para quem está em admin_users (migration
// 0026). Sem link no menu: acesso pelo endereço /dashboard/admin/funil.
// Os números vêm de get_conversion_funnel, que confere no banco se quem
// pede é administrador; para qualquer outra pessoa (ou se a função falhar)
// a página responde "não encontrada", sem revelar que o painel existe.

const PERIODS = [
  { key: "hoje", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "tudo", label: "Todo período" },
] as const;

type PeriodKey = (typeof PERIODS)[number]["key"];

type FunnelData = {
  signups: number;
  paywall: number;
  selected: number;
  checkout: number;
  purchased: number;
  selected_by_plan: { daily: number; pro: number; ultra: number };
};

const DAY_MS = 24 * 60 * 60 * 1000;

// "Hoje" começa à meia-noite de Manaus — mesmo fuso do limite diário.
function periodStart(period: PeriodKey): Date | null {
  switch (period) {
    case "hoje":
      return startOfDayInManaus();
    case "7d":
      return new Date(Date.now() - 7 * DAY_MS);
    case "30d":
      return new Date(Date.now() - 30 * DAY_MS);
    case "tudo":
      return null;
  }
}

function formatPercent(part: number, whole: number): string {
  if (whole === 0) return "—";
  return `${((part / whole) * 100).toFixed(1).replace(".", ",")}%`;
}

export default async function FunilPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string | string[] }>;
}) {
  const { periodo } = await searchParams;
  const period: PeriodKey = PERIODS.find((p) => p.key === periodo)?.key ?? "7d";
  const since = periodStart(period);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_conversion_funnel", {
    p_since: since?.toISOString() ?? null,
  });

  if (error || !data) {
    if (error && !error.message.includes("Não autorizado")) {
      console.error("[admin/funil] get_conversion_funnel falhou:", error.message);
    }
    notFound();
  }

  const funnel = data as FunnelData;

  const steps = [
    { label: "Cadastros", value: funnel.signups },
    { label: "Visualizaram planos", value: funnel.paywall },
    { label: "Selecionaram um plano", value: funnel.selected },
    { label: "Iniciaram checkout", value: funnel.checkout },
    { label: "Compraram", value: funnel.purchased },
  ];

  const plans = [
    { label: "Diário", value: funnel.selected_by_plan.daily },
    { label: "Pro", value: funnel.selected_by_plan.pro },
    { label: "Ultra", value: funnel.selected_by_plan.ultra },
  ];
  const planTotal = plans.reduce((sum, p) => sum + p.value, 0);

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Funil de Conversão</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Pessoas únicas em cada etapa no período escolhido.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={`/dashboard/admin/funil?periodo=${p.key}`}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              p.key === period
                ? "border-[#4C3BFF]/60 bg-white/[0.08] text-white"
                : "border-white/10 bg-white/[0.02] text-zinc-400 hover:bg-white/[0.05] hover:text-white"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {steps.map((step, i) => (
          <div key={step.label}>
            {i > 0 && (
              <p className="py-1.5 text-center text-xs text-zinc-500">
                ↓ {formatPercent(step.value, steps[i - 1].value)} da etapa anterior
              </p>
            )}
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4">
              <span className="text-sm font-medium text-white">{step.label}</span>
              <span className="text-xl font-bold text-white">{step.value}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4">
        <p className="text-xs text-zinc-500">Conversão total (cadastro → compra)</p>
        <p className="mt-1 text-2xl font-bold text-white">
          {formatPercent(funnel.purchased, funnel.signups)}
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4">
        <p className="text-sm font-medium text-white">Plano selecionado</p>
        <div className="mt-3 flex flex-col gap-2.5">
          {plans.map((p) => (
            <div key={p.label} className="flex items-center justify-between text-sm">
              <span className="text-zinc-300">{p.label}</span>
              <span className="text-zinc-400">
                <span className="font-semibold text-white">{p.value}</span> ·{" "}
                {formatPercent(p.value, planTotal)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
