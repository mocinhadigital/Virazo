export default function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto max-w-xl text-center">
      <span className="text-xs font-semibold uppercase tracking-wider text-[#FF6B5B]">
        {eyebrow}
      </span>
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
        {title}
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-zinc-400 sm:text-base">
        {description}
      </p>
    </div>
  );
}
