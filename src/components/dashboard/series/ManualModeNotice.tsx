"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCircle2, Hand, Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

export type ManualNoticeSeries = { id: string; title: string };

// Aviso de uma vez só para quem tinha série automática e agora ela gera só quando o cliente pedir.
// Quem tem a marca (user_metadata.manual_notice_series, com os ids das séries que mudaram) vê este
// cartão no alto do painel até tocar em "Entendi". Cada série ainda parada ganha um botão para
// ligar o automático de novo.
export default function ManualModeNotice({ series }: { series: ManualNoticeSeries[] }) {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [onIds, setOnIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Durante a criação de uma série o cartão só atrapalharia.
  if (hidden || series.length === 0 || pathname === "/dashboard/series/nova") return null;

  const shown = series.slice(0, 3);
  const many = series.length > 1;

  async function turnOn(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/series/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ativa" }),
      });
      if (!res.ok) throw new Error("falhou");
      setOnIds((prev) => [...prev, id]);
    } catch {
      setError("Não conseguimos ligar agora. Tente de novo em “Séries”.");
    } finally {
      setBusyId(null);
    }
  }

  function dismiss() {
    setHidden(true);
    // Guarda na conta que já viu. Se falhar, o aviso só aparece de novo no próximo acesso.
    void createClient()
      .auth.updateUser({ data: { manual_notice_series: null } })
      .catch(() => undefined);
  }

  return (
    <section
      role="status"
      className="mb-5 rounded-2xl border border-amber-300/30 bg-amber-300/[0.07] p-4 text-[14px] leading-relaxed text-amber-50 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <Hand className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-white">
            {many ? "Suas séries agora geram só quando você pedir" : "Sua série agora gera só quando você pedir"}
          </p>
          <p className="mt-1 text-white/75">
            Mudamos o jeito das séries: elas não criam mais vídeos sozinhas. Quando quiser um vídeo, toque em “Gerar um
            vídeo agora”. {many
              ? "Se preferir que elas voltem a criar um vídeo por dia sozinhas, ligue o automático:"
              : "Se preferir que ela volte a criar um vídeo por dia sozinha, ligue o automático:"}
          </p>

          <ul className="mt-3 flex flex-col gap-2">
            {shown.map((s) => {
              const isOn = onIds.includes(s.id);
              return (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                >
                  <span className="min-w-0 truncate font-medium text-white">{s.title}</span>
                  {isOn ? (
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" /> Automático ligado
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => turnOn(s.id)}
                      className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
                    >
                      {busyId === s.id && <Loader2 className="h-4 w-4 animate-spin" />}
                      Ligar automático
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {series.length > shown.length && (
            <p className="mt-2 text-[13px] text-white/70">
              Você tem mais {series.length - shown.length} {series.length - shown.length === 1 ? "série" : "séries"}.{" "}
              <Link href="/dashboard/series" className="font-semibold text-amber-200 underline">
                Ver todas
              </Link>
            </p>
          )}
          {error && <p className="mt-2 text-[13px] text-red-300">{error}</p>}

          <button
            type="button"
            onClick={dismiss}
            className="mt-3 inline-flex h-10 items-center justify-center rounded-full border border-white/20 px-5 text-[13px] font-semibold text-white hover:bg-white/5"
          >
            Entendi
          </button>
        </div>
      </div>
    </section>
  );
}
