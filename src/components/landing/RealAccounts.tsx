export default function RealAccounts() {
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Contas reais e virais
        </h2>
        <p className="mt-3 text-base text-zinc-400 sm:text-lg">
          Milhões de visualizações automatizadas.
        </p>

        <div className="card-glass mt-12 overflow-hidden rounded-2xl text-left sm:mt-14">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/screenshots/prova-1.webp"
            alt="Print de vídeos com alta visualização da conta @desired.history"
            className="w-full"
            loading="lazy"
          />
          <div className="flex items-center gap-3 border-t border-white/[0.06] p-4">
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
        </div>
      </div>
    </section>
  );
}
