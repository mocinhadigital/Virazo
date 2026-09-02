import SectionHeading from "./SectionHeading";

const TESTIMONIALS = [
  {
    name: "Lucas M.",
    avatar: "/assets/avatars/lucas-m.webp",
    quote: "Eu travava na edição. Agora a série sai todo dia e eu só tenho que postar.",
  },
  {
    name: "Ana Paula R.",
    avatar: "/assets/avatars/ana-paula-r.webp",
    quote: "Configurei o canal num domingo e não precisei encostar mais. Só acompanho.",
  },
  {
    name: "Felipe S.",
    avatar: "/assets/avatars/felipe-s.webp",
    quote: "A voz e o estilo ficam consistentes de um jeito que eu não conseguia manter sozinho.",
  },
  {
    name: "Juliana C.",
    initial: "J",
    quote: "Mantenho três nichos ao mesmo tempo. Sozinha eu não dava conta de um.",
  },
  {
    name: "Rafael T.",
    initial: "R",
    quote: "O que mais me segurava era a constância. Isso deixou de ser problema.",
  },
  {
    name: "Camila O.",
    avatar: "/assets/avatars/camila-o.webp",
    quote: "Testei vários fluxos antes. Esse foi o primeiro que roda sem mim de verdade.",
  },
];

export default function Testimonials() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Depoimentos"
          title="Quem usa, recomenda"
          description="Feedback de criadores que automatizaram a produção de vídeo com o Virazo."
        />

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {TESTIMONIALS.map(({ name, avatar, initial, quote }) => (
            <div key={name} className="card-glass rounded-2xl p-5">
              <div className="flex items-center gap-3">
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatar}
                    alt={name}
                    className="h-10 w-10 rounded-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#FF6B5B] to-[#FFB84D] text-sm font-semibold text-white">
                    {initial}
                  </span>
                )}
                <span className="text-sm font-semibold text-white">{name}</span>
              </div>
              <p className="mt-3.5 text-sm leading-relaxed text-zinc-400">&ldquo;{quote}&rdquo;</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
