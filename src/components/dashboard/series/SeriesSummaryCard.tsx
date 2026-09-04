import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import { createClient } from "@/utils/supabase/server";

// Card de resumo em /dashboard. Server Component, leitura direta e simples
// (respeitando RLS via cliente autenticado) — não depende do DashboardContext
// pra não mexer no estado global que já funciona.
export default async function SeriesSummaryCard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: series } = await supabase
    .from("series")
    .select("status, next_generation_at, total_videos_gerados")
    .eq("user_id", user.id)
    .returns<{ status: string; next_generation_at: string | null; total_videos_gerados: number }[]>();

  const all = series ?? [];
  const ativas = all.filter((s) => s.status === "ativa");
  const totalVideos = all.reduce((sum, s) => sum + s.total_videos_gerados, 0);
  const proximaGeracao = ativas
    .map((s) => s.next_generation_at)
    .filter((d): d is string => !!d)
    .sort()[0];

  if (all.length === 0) {
    return (
      <Link
        href="/dashboard/series"
        className="card-glass flex items-center justify-between gap-4 rounded-2xl p-4 transition-colors hover:bg-white/[0.05] sm:p-5"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#4C3BFF] to-[#A855F7]">
            <Sparkles className="h-5 w-5 text-white" strokeWidth={2} />
          </span>
          <div>
            <p className="text-sm font-semibold text-white">Automatize a criação de conteúdo</p>
            <p className="text-xs text-zinc-500">
              Crie uma Série e deixe a IA gerar vídeos novos no seu ritmo.
            </p>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-zinc-500" />
      </Link>
    );
  }

  return (
    <Link
      href="/dashboard/series"
      className="card-glass flex items-center justify-between gap-4 rounded-2xl p-4 transition-colors hover:bg-white/[0.05] sm:p-5"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#4C3BFF] to-[#A855F7]">
          <Sparkles className="h-5 w-5 text-white" strokeWidth={2} />
        </span>
        <div>
          <p className="text-sm font-semibold text-white">
            {ativas.length} {ativas.length === 1 ? "série ativa" : "séries ativas"} · {totalVideos}{" "}
            {totalVideos === 1 ? "vídeo gerado" : "vídeos gerados"}
          </p>
          <p className="text-xs text-zinc-500">
            {proximaGeracao
              ? `Próxima geração automática: ${new Date(proximaGeracao).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : "Nenhuma geração automática agendada no momento."}
          </p>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-zinc-500" />
    </Link>
  );
}
