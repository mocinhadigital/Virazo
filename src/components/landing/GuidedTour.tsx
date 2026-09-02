import { Play } from "lucide-react";
import SectionHeading from "./SectionHeading";

export default function GuidedTour() {
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Tour guiado"
          title="Veja por dentro antes de assinar"
          description="Do cadastro ao primeiro vídeo em poucos minutos — gravado em tela, sem cortes."
        />

        <div className="card-glass group relative mt-10 overflow-hidden rounded-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/guides/guia-1.jpg"
            alt="Tour guiado pelo painel do Virazo"
            className="aspect-video w-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors group-hover:bg-black/40">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30 backdrop-blur-sm">
              <Play className="h-6 w-6 translate-x-0.5 fill-white text-white" />
            </span>
          </div>
        </div>

        <p className="mx-auto mt-4 max-w-lg text-center text-xs text-zinc-500">
          Este é o Guia 1 — ele te espera assim que você entrar no painel.
        </p>
      </div>
    </section>
  );
}
