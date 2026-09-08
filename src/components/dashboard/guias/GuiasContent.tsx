"use client";

import { useState } from "react";
import { Play, Lock } from "lucide-react";
import { useDashboard } from "../DashboardContext";

type Guide = {
  slug: string;
  title: string;
  description: string;
  duration: string | null;
  locked: boolean;
  comingSoon: boolean;
};

const GUIDES: Guide[] = [
  {
    slug: "primeiro-video",
    title: "Criando seu primeiro vídeo no Virazo",
    description:
      "Do cadastro ao primeiro vídeo gerado: criar sua série, escolher nicho, voz e estilo, e entender o ritmo de novos vídeos todos os dias.",
    duration: "7 min",
    locked: false,
    comingSoon: false,
  },
  {
    slug: "pagina-monetiza-eua",
    title: "Como criar uma página que monetiza nos EUA (Facebook)",
    description:
      "Do zero à página pronta pra monetizar em dólar: criação, configuração e o caminho pra primeira receita no Facebook.",
    duration: null,
    locked: true,
    comingSoon: false,
  },
  {
    slug: "quanto-tempo-resultado",
    title: "Quanto tempo até dar resultado (e por que a maioria desiste antes)",
    description: "",
    duration: null,
    locked: true,
    comingSoon: true,
  },
];

const featured = GUIDES[0];

export default function GuiasContent() {
  const [playingFeatured, setPlayingFeatured] = useState(false);
  const { openPlanModal } = useDashboard();

  return (
    <>
      <section id="guia-destaque" className="mt-8 scroll-mt-6">
        <div className="overflow-hidden rounded-[28px] bg-black shadow-[0_24px_64px_-24px_rgba(0,0,0,0.8)]">
          <div className="relative aspect-video w-full">
            {playingFeatured ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-zinc-950 px-6 text-center">
                <p className="text-sm font-medium text-white">
                  Vídeo em produção
                </p>
                <p className="text-xs text-zinc-500">
                  O tutorial oficial do Virazo entra aqui em breve.
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setPlayingFeatured(true)}
                className="group absolute inset-0 h-full w-full cursor-pointer text-left"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-[#4C3BFF]/25 via-black to-[#A855F7]/15" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
                <div className="absolute inset-x-7 bottom-6">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#8B7CFF]">
                    Comece por aqui
                  </p>
                  <h2 className="mt-1.5 text-[22px] font-semibold tracking-[-0.015em] text-white md:text-[24px]">
                    {featured.title}
                  </h2>
                  <p className="mt-1 max-w-[58ch] text-[14px] leading-relaxed text-white/75">
                    {featured.description}
                  </p>
                  <div className="mt-3.5 flex items-center gap-2.5">
                    <span className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-[14px] font-semibold text-black transition-transform duration-200 group-hover:scale-[1.03]">
                      <Play className="h-3.5 w-3.5 fill-black" strokeWidth={0} />
                      Assistir
                    </span>
                    {featured.duration && (
                      <span className="rounded-full border border-white/15 bg-black/50 px-3 py-1.5 text-[12px] font-medium text-white/85 backdrop-blur-md">
                        {featured.duration}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="mt-12 flex items-baseline justify-between">
        <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-white">
          Todos os guias
        </h2>
        <span className="text-[13px] text-zinc-600">novos guias toda semana</span>
      </div>

      <div className="mt-4 grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GUIDES.map((guide) => (
          <GuideCard
            key={guide.slug}
            guide={guide}
            onOpen={() =>
              document.getElementById("guia-destaque")?.scrollIntoView({ behavior: "smooth" })
            }
            onLocked={openPlanModal}
          />
        ))}
      </div>

    </>
  );
}

function GuideCard({
  guide,
  onOpen,
  onLocked,
}: {
  guide: Guide;
  onOpen: () => void;
  onLocked: () => void;
}) {
  return (
    <button
      type="button"
      onClick={guide.locked ? onLocked : onOpen}
      className="group text-left transition-transform duration-300 cursor-pointer hover:-translate-y-0.5"
    >
      <div
        className={`relative aspect-video overflow-hidden rounded-[20px] bg-zinc-900 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.7)] ${
          !guide.locked ? "ring-2 ring-[#4C3BFF]/70" : ""
        }`}
      >
        <div
          className={`absolute inset-0 bg-gradient-to-br from-[#4C3BFF]/20 via-zinc-900 to-[#A855F7]/10 ${
            guide.locked ? "saturate-50" : ""
          }`}
        />

        {!guide.locked && guide.duration && (
          <span className="absolute right-3 top-3 rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-[12px] font-medium text-white/85 backdrop-blur-md">
            {guide.duration}
          </span>
        )}

        {!guide.locked && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <Play className="h-8 w-8 text-white" strokeWidth={1.5} />
          </span>
        )}

        {guide.locked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-black/45 px-4 text-center backdrop-blur-md transition-colors duration-200 group-hover:bg-black/55">
            <span className="flex size-12 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/90 shadow-[0_0_32px_rgba(76,59,255,0.45)] transition-transform duration-200 group-hover:scale-105">
              <Lock className="h-5 w-5" strokeWidth={2} />
            </span>
            <span className="rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-white/85">
              Exclusivo para assinantes
            </span>
            {guide.comingSoon && (
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/50">
                em breve
              </span>
            )}
          </div>
        )}
      </div>

      <h3 className="mt-3 line-clamp-2 min-h-[2.6em] px-0.5 text-[15px] font-medium leading-snug tracking-[-0.01em] text-white">
        {guide.title}
      </h3>
      <p className="mt-1 line-clamp-2 min-h-[2.6em] px-0.5 text-[13px] leading-relaxed text-zinc-600">
        {guide.description}
      </p>
    </button>
  );
}
