import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminUserId } from "@/lib/admin/requireAdmin";
import { buildRecoveryList } from "@/lib/billing/recoveryList";
import CopyEmailsButton from "@/components/dashboard/admin/CopyEmailsButton";
import { markRecoveryContacted } from "./actions";

export const metadata: Metadata = {
  title: "Recuperação de checkout — Virazo",
  robots: { index: false },
};

// Sempre gerada na hora — uma lista velha pode incluir quem já pagou.
export const dynamic = "force-dynamic";
// A checagem na Cakto faz uma consulta por pessoa.
export const maxDuration = 60;

// Lista de recuperação (ver lib/billing/recoveryList.ts). Só para quem está
// em admin_users; para qualquer outra pessoa, "não encontrada". Não envia
// nada — só mostra a lista para contato manual.

const TZ = "America/Sao_Paulo";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default async function RecuperacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ marcados?: string; erro?: string }>;
}) {
  if (!(await getAdminUserId())) notFound();
  const { marcados, erro } = await searchParams;
  const markedCount = Number(marcados);

  let list: Awaited<ReturnType<typeof buildRecoveryList>>;
  try {
    list = await buildRecoveryList();
  } catch (err) {
    console.error("[admin/recuperacao] falhou:", err instanceof Error ? err.message : err);
    return (
      <div className="mx-auto max-w-[720px]">
        <h1 className="text-2xl font-bold text-white">Recuperação de checkout</h1>
        <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          Não foi possível montar a lista agora. Tente de novo em instantes.
        </p>
      </div>
    );
  }

  const { counts, ready } = list;
  const emailsText = ready.map((c) => c.email).join(", ");
  const excluded = [
    { label: "Já têm assinatura (ativa ou antiga)", value: counts.hasSubscription },
    { label: "Compra já registrada", value: counts.purchaseRecorded },
    { label: "Pagamento encontrado na Cakto agora", value: counts.paidInCakto },
    { label: "Tentativa há menos de 2 horas (Pix pode estar compensando)", value: counts.tooRecent },
    { label: "Já contatados nos últimos 7 dias", value: counts.recentlyContacted },
    { label: "Conta de administradora", value: counts.admin },
    { label: "Não verificados na Cakto (ficam fora, por segurança)", value: counts.notVerified },
  ];

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Recuperação de checkout</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Quem começou a assinar nos últimos 7 dias e não concluiu. Gerada em {formatDateTime(list.generatedAt)} —{" "}
          <Link href="/dashboard/admin/recuperacao" className="font-medium text-zinc-300 underline hover:text-white">
            gerar de novo
          </Link>{" "}
          logo antes de enviar.
        </p>
      </div>

      {Number.isFinite(markedCount) && markedCount > 0 && (
        <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {markedCount} pessoa(s) marcadas como contatadas. Elas ficam fora da lista pelos próximos 7 dias.
        </p>
      )}

      {erro === "marcar" && (
        <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          Não foi possível marcar como enviados. Nada foi registrado — tente de novo.
        </p>
      )}

      {!list.duplicateProtection && (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          A proteção contra mensagens repetidas ainda não está ativa (falta rodar a migration 0027 no Supabase). Quem
          já foi contatado pode aparecer de novo na lista.
        </p>
      )}

      {!list.caktoCheckAvailable && (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          A consulta à Cakto não está disponível neste ambiente, então ninguém pôde ser confirmado como &quot;não pagou&quot;.
          Por segurança, a lista para copiar fica vazia.
        </p>
      )}

      {counts.caktoWithoutEmail > 0 && (
        <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          {counts.caktoWithoutEmail} aviso(s) da Cakto chegaram sem e-mail reconhecível e ficaram fora da lista. Avise o
          suporte técnico para revisar o formato desses avisos.
        </p>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4">
        <p className="text-sm font-medium text-white">
          {counts.inWindow} pessoa(s) começaram e não concluíram no período · {ready.length} prontas para contato
        </p>
        <ul className="mt-3 flex flex-col gap-1.5">
          {excluded.map((row) => (
            <li key={row.label} className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">Fora da lista: {row.label}</span>
              <span className="font-semibold text-white">{row.value}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-white">E-mails para contato ({ready.length})</p>
          <CopyEmailsButton text={emailsText} />
        </div>
        <textarea
          readOnly
          value={emailsText}
          rows={3}
          className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3.5 py-3 text-xs text-zinc-300 focus:outline-none"
        />
        <p className="mt-2 text-xs text-zinc-500">
          Envie com Cópia Oculta (CCO). Sugestão de frase no fim da mensagem: &quot;Se você já concluiu sua assinatura,
          desconsidere esta mensagem. Para não receber mais, responda SAIR.&quot;
        </p>
        {list.duplicateProtection && ready.length > 0 && (
          <form action={markRecoveryContacted} className="mt-4 border-t border-white/[0.06] pt-4">
            <input type="hidden" name="emails" value={JSON.stringify(ready.map((c) => c.email))} />
            <p className="text-xs text-zinc-400">
              Depois de ENVIAR a mensagem, clique abaixo. Estas {ready.length} pessoa(s) saem da lista por 7 dias. (Este
              botão não envia nada.)
            </p>
            <button
              type="submit"
              className="mt-3 inline-flex items-center rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-white/5"
            >
              Marquei como enviados ({ready.length})
            </button>
          </form>
        )}
      </div>

      {ready.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.03] text-xs text-zinc-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">E-mail</th>
                <th className="px-4 py-2.5 font-medium">Celular</th>
                <th className="px-4 py-2.5 font-medium">Plano(s)</th>
                <th className="px-4 py-2.5 font-medium">Última tentativa</th>
                <th className="px-4 py-2.5 font-medium">Origem</th>
              </tr>
            </thead>
            <tbody>
              {ready.map((c) => (
                <tr key={c.email} className="border-t border-white/[0.06] text-zinc-300">
                  <td className="px-4 py-2.5">{c.email}</td>
                  <td className="px-4 py-2.5">{c.phone ?? "—"}</td>
                  <td className="px-4 py-2.5">{c.plans.join(", ") || "—"}</td>
                  <td className="px-4 py-2.5">{formatDateTime(c.lastAttemptAt)}</td>
                  <td className="px-4 py-2.5">{c.sources.map((s) => (s === "funil" ? "Virazo" : "Cakto")).join(" + ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
