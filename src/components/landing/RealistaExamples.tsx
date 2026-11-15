"use client";

import { useState } from "react";
import { REALISTIC_EXAMPLES } from "@/components/dashboard/realistic/realisticExamples";

// Os 3 vídeos de exemplo do Vídeo Realista (os mesmos do pop-up de compra do painel).
// Um exemplo cujo arquivo não carregou some da faixa em vez de mostrar um quadro quebrado.
export default function RealistaExamples() {
  const [broken, setBroken] = useState<string[]>([]);
  const examples = REALISTIC_EXAMPLES.filter((e) => !broken.includes(e.src));
  if (examples.length === 0) return null;

  return (
    <div className="mx-auto grid max-w-[720px] grid-cols-3 gap-3 sm:gap-5">
      {examples.map((example) => (
        <figure key={example.src} className="m-0">
          <div className="relative aspect-[9/16] overflow-hidden rounded-2xl bg-[#1c1c1f] ring-1 ring-white/10">
            <video
              src={example.src}
              poster={example.poster}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              aria-label={example.title}
              onError={() => setBroken((prev) => [...prev, example.src])}
              className="h-full w-full object-cover"
            />
          </div>
          <figcaption className="mt-2 text-center text-xs text-zinc-400">{example.title}</figcaption>
        </figure>
      ))}
    </div>
  );
}
