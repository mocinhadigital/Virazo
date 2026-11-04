"use client";

import { useRef, useState } from "react";
import { Play } from "lucide-react";

// Player da VSL. preload="metadata": a página baixa só o índice do vídeo
// (~250 KB, que fica no começo do arquivo por causa do "faststart") e mostra a
// capa; o vídeo em si (~8 MB) só baixa quando a pessoa aperta o play, e toca
// enquanto baixa. Como o índice já está pronto, o play responde bem mais rápido.
export default function VslPlayer({ src, poster }: { src: string; poster: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  function handleStart() {
    setStarted(true);
    void videoRef.current?.play().catch(() => {
      // Navegador recusou tocar sozinho: os controles nativos continuam lá.
    });
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl shadow-black/60">
      <video
        ref={videoRef}
        className="h-full w-full"
        controls={started}
        preload="metadata"
        playsInline
        poster={poster}
        onPlay={() => setStarted(true)}
      >
        <source src={src} type="video/mp4" />
      </video>

      {!started && (
        <button
          type="button"
          onClick={handleStart}
          aria-label="Assistir ao vídeo"
          className="group absolute inset-0 flex items-center justify-center bg-black/25 transition-colors hover:bg-black/15"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-purple-600 shadow-xl shadow-purple-600/40 transition-transform group-hover:scale-105 group-active:scale-95 sm:h-20 sm:w-20">
            <Play className="h-7 w-7 translate-x-0.5 fill-white text-white sm:h-8 sm:w-8" />
          </span>
        </button>
      )}
    </div>
  );
}
