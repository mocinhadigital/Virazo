import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { startOfDayInManaus } from "@/lib/billing/dailyLimit";

// Painel "Funil de Conversão" — só para quem está em admin_users (migration
// 0026). Sem link no menu: acesso pelo endereço /dashboard/admin/funil.
// Os números vêm de get_conversion_funnel, que confere no banco se quem
// pede é administrador; para quem não é, a página responde "não encontrada",
// sem revelar que o painel existe. Qualquer outra falha aparece como erro.
//
// Desde a migration 0028 o funil é por COORTE (só quem se cadastrou no
// período), as contas de teste ficam fora dos números e aparecem à parte, e
// as vendas nunca são excluídas ("Compras no período"). Os campos novos são
// opcionais aqui para a página não quebrar se a 0028 ainda não foi rodada.

// O rastreamento começou em 04/10/2026 (migration 0026): antes disso não há
// eventos, então nenhum período começa antes dessa data.
const TRACKING_START = startOfDayInManaus(new Date("2026-10-04T12:00:00Z"));

const PERIODS = [
  { key: "inicio", label: "Desde 04/10" },
  { key: "hoje", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
] as const;

type PeriodKey = (typeof PERIODS)[number]["key"];

type ReconRow = {
  order_id: string;
  paid_at: string;
  product: string | null;
  amount: string | null;
  customer_id: string | null;
  email: string;
  is_test: boolean;
  has_account: boolean;
  has_active_subscription: boolean;
  has_purchase_event: boolean;
};

type FunnelData = {
  signups: number;
  paywall: number;
  selected: number;
  checkout: number;
  purchased: number;
  selected_by_plan: { daily: number; pro: number; ultra: number };
  purchased_total?: number;
  purchased_test?: number;
  purchased_other?: number;
  other_activity?: { paywall: number; selected: number; checkout: number };
  test_accounts?: { accounts: number; paywall: number; selected: number; checkout: number };
  cakto?: {
    pix_generated: number;
    abandoned: number;
    unpaid: number;
    paid_orders: number;
    paid_orders_test: number;
    reconciliation?: ReconRow[];
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;
const TZ = "America/Manaus";

// Períodos em DIAS FECHADOS no fuso de Manaus (o mesmo do limite diário):
// "7 dias" = hoje e os 6 dias anteriores, a partir da meia-noite.
function periodStart(period: PeriodKey): Date {
  const now = Date.now();
  let start: Date;
  switch (period) {
    case "hoje":
      start = startOfDayInManaus();
      break;
    case "7d":
      start = startOfDayInManaus(new Date(now - 6 * DAY_MS));
      break;
    case "30d":
      start = startOfDayInManaus(new Date(now - 29 * DAY_MS));
      break;
    case "inicio":
      start = TRACKING_START;
      break;
  }
  return start.getTime() < TRACKING_START.getTime() ? TRACKING_START : start;
}

function formatDay(date: Date): string {
  return date.toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" });
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
  const period: PeriodKey = PERIODS.find((p) => p.key === periodo)?.key ?? "inicio";
  const since = periodStart(period);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_conversion_funnel", {
    p_since: since.toISOString(),
  });

  if (error?.message.includes("Não autorizado")) notFound();
  if (error || !data) {
    console.error("[admin/funil] get_conversion_funnel falhou:", error?.message);
    return (
      <div className="mx-auto max-w-[720px]">
        <h1 className="text-2xl font-bold text-white">Funil de Conversão</h1>
        <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          Não foi possível carregar os números do funil agora. Tente de novo em instantes.
        </p>
      </div>
    );
  }

  const funnel = data as FunnelData;
  const hasCohort = funnel.purchased_total !== undefined;

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

  const cakto = funnel.cakto;
  const other = funnel.other_activity;
  const test = funnel.test_accounts;
  const card = "rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4";

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Funil de Conversão</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {hasCohort
            ? "Pessoas que se cadastraram no período e o que fizeram depois. Contas de teste ficam de fora."
            : "Pessoas únicas em cada etapa no período escolhido."}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Período: de {formatDay(since)} até hoje (dias completos, horário de Manaus). O rastreamento começou em 04/10.
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

      <div className={card}>
        <p className="text-xs text-zinc-500">Conversão total (cadastro → compra)</p>
        <p className="mt-1 text-2xl font-bold text-white">
          {formatPercent(funnel.purchased, funnel.signups)}
        </p>
      </div>

      {cakto && (
        <div className={card}>
          <p className="text-sm font-medium text-white">Dentro do checkout da Cakto</p>
          <p className="mt-1 text-xs text-zinc-500">
            Avisos recebidos da Cakto, por pessoa. Só aparece quem gerou o Pix ou abandonou o checkout
            depois que esses avisos foram ativados na Cakto.
          </p>
          <div className="mt-3 flex flex-col gap-2.5 text-sm">
            <Row label="Pix gerado" value={cakto.pix_generated} />
            <Row label="Abandonaram o checkout" value={cakto.abandoned} />
            <Row label="Tentaram e ainda não pagaram" value={cakto.unpaid} />
            <Row
              label="Pedidos pagos na Cakto (vendas reais)"
              value={cakto.paid_orders}
              note={cakto.paid_orders_test > 0 ? `+ ${cakto.paid_orders_test} de teste, à parte` : undefined}
            />
          </div>
        </div>
      )}

      {hasCohort && (
        <div className={card}>
          <p className="text-sm font-medium text-white">Vendas reais no período</p>
          <p className="mt-1 text-2xl font-bold text-white">{funnel.purchased_total}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {funnel.purchased} de quem se cadastrou no período · {funnel.purchased_other ?? 0} de quem
            já tinha conta. Compras de teste, à parte: {funnel.purchased_test ?? 0}.
          </p>
        </div>
      )}

      <div className={card}>
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

      {cakto?.reconciliation && cakto.reconciliation.length > 0 && (
        <div className={card}>
          <p className="text-sm font-medium text-white">Conciliação com a Cakto</p>
          <p className="mt-1 text-xs text-zinc-500">
            Pedidos pagos que o Virazo conhece, de todos os períodos (data do pagamento na Cakto). Compare
            com o relatório da Cakto: um pedido que está lá e não está aqui é venda que o Virazo não recebeu.
          </p>
          <div className="mt-3 flex flex-col gap-3 text-sm">
            {cakto.reconciliation.map((r) => (
              <div key={r.order_id} className="rounded-xl border border-white/10 px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-white">
                    {formatDay(new Date(r.paid_at))} · {r.product ?? "—"} · R$ {r.amount ?? "—"}
                  </span>
                  <span className={r.is_test ? "text-amber-400" : "text-emerald-400"}>
                    {r.is_test ? "teste" : "venda real"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {r.email} · pedido {r.order_id.slice(0, 8)} · cliente #{r.customer_id ?? "—"}
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  {r.has_account ? "tem conta" : "SEM CONTA"} ·{" "}
                  {r.has_active_subscription ? "plano ativo" : "SEM PLANO ATIVO"} ·{" "}
                  {r.has_purchase_event ? "no funil" : "fora do funil (anterior a 04/10 ou sem evento)"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {other && (
        <div className={card}>
          <p className="text-sm font-medium text-white">Quem já tinha conta antes do período</p>
          <p className="mt-1 text-xs text-zinc-500">
            Não entra no funil acima. Também inclui contas criadas antes de 04/10.
          </p>
          <div className="mt-3 flex flex-col gap-2.5 text-sm">
            <Row label="Viram planos" value={other.paywall} />
            <Row label="Selecionaram um plano" value={other.selected} />
            <Row label="Iniciaram checkout" value={other.checkout} />
          </div>
        </div>
      )}

      {test && test.accounts > 0 && (
        <div className={card}>
          <p className="text-sm font-medium text-white">Contas de teste (fora dos números acima)</p>
          <p className="mt-1 text-xs text-zinc-500">
            {test.accounts} conta{test.accounts === 1 ? "" : "s"} de administrador. Nenhum dado foi apagado.
          </p>
          <div className="mt-3 flex flex-col gap-2.5 text-sm">
            <Row label="Viram planos" value={test.paywall} />
            <Row label="Selecionaram um plano" value={test.selected} />
            <Row label="Iniciaram checkout" value={test.checkout} />
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-300">{label}</span>
      <span className="text-zinc-400">
        <span className="font-semibold text-white">{value}</span>
        {note ? ` · ${note}` : ""}
      </span>
    </div>
  );
}
