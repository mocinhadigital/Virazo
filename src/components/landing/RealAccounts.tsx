import SectionHeading from "./SectionHeading";

export default function RealAccounts() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Prova real"
          title="Contas reais e virais"
          description="Milhões de visualizações automatizadas."
        />

        <div className="card-glass mt-10 overflow-hidden rounded-2xl">
          <div className="flex items-center gap-3 border-b border-white/[0.06] p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/avatars/desired-history.webp"
              alt="Desired.H"
              className="h-10 w-10 rounded-full object-cover"
              loading="lazy"
            />
            <div>
              <p className="text-sm font-semibold text-white">Desired.H</p>
              <p className="text-xs text-zinc-500">@desired.history</p>
            </div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/screenshots/prova-1.webp"
            alt="Print de vídeos com alta visualização da conta @desired.history"
            className="w-full"
            loading="lazy"
          />
        </div>
      </div>
    </section>
  );
}
