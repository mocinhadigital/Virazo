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
    <section className="py-10">
      <div className="mx-auto max-w-[1100px] px-6">
        <div className="grid gap-4 md:grid-cols-3 md:gap-5">
          {TESTIMONIALS.map(({ name, avatar, initial, quote }) => (
            <figure key={name} className="h-full rounded-[20px] bg-[#141416] p-6">
              <div className="flex items-center gap-3">
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatar}
                    alt={name}
                    className="size-9 rounded-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="flex size-9 items-center justify-center rounded-full bg-white/[0.08] text-[13px] font-semibold text-white/55">
                    {initial}
                  </span>
                )}
                <figcaption className="text-[14px] font-medium text-white/90">{name}</figcaption>
              </div>
              <blockquote className="mt-4 text-[15px] leading-relaxed text-white/55">
                {quote}
              </blockquote>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
