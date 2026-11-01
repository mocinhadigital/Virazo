"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { getActiveSoundId, releaseSound, subscribeSound, toggleSound } from "@/lib/landing/videoSound";

const REDUCE_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReduceMotion(onChange: () => void) {
  const media = window.matchMedia(REDUCE_MOTION_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

// Vídeo de exemplo da página de vendas: toca sozinho, sem som, em loop, e só
// baixa o arquivo quando está perto de aparecer na tela (o `poster` — uma
// imagem leve — ocupa o lugar até lá). Fora da tela ele pausa, para não gastar
// bateria nem processador no celular. `eager` (hero) baixa na hora.
//
// Um botão no canto liga/desliga o som deste vídeo. Só um vídeo da página tem
// som por vez (ver lib/landing/videoSound.ts) e, ao sair da tela, o vídeo com
// som volta a ficar mudo.
//
// Respeita "reduzir movimento" do sistema: nesse caso fica só a imagem de capa.
export default function LazyVideo({
  src,
  poster,
  className,
  wrapperClassName = "",
  label,
  eager = false,
}: {
  src: string;
  poster: string;
  className?: string;
  wrapperClassName?: string;
  label: string;
  eager?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLVideoElement>(null);
  const [load, setLoad] = useState(eager);
  const reduceMotion = useSyncExternalStore(
    subscribeReduceMotion,
    () => window.matchMedia(REDUCE_MOTION_QUERY).matches,
    () => false,
  );
  const soundOn = useSyncExternalStore(
    subscribeSound,
    () => getActiveSoundId() === id,
    () => false,
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || reduceMotion) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setLoad(true);
          void el.play().catch(() => {});
        } else {
          el.pause();
          releaseSound(id);
        }
      },
      { rootMargin: "250px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reduceMotion, id]);

  // Assim que o arquivo passa a existir no elemento, começa a tocar.
  useEffect(() => {
    if (load && !reduceMotion) void ref.current?.play().catch(() => {});
  }, [load, reduceMotion]);

  // Som: só este vídeo desmuta quando é o escolhido; o autoplay sem som
  // continua igual (o navegador só aceita autoplay com o vídeo mudo).
  useEffect(() => {
    const el = ref.current;
    if (el) el.muted = !soundOn;
  }, [soundOn]);

  function onToggleSound() {
    const el = ref.current;
    if (!el) return;
    const willBeOn = toggleSound(id);
    // Dentro do toque (gesto do usuário), para o navegador permitir o som.
    el.muted = !willBeOn;
    if (willBeOn) {
      el.volume = 1;
      void el.play().catch(() => {});
    }
  }

  return (
    <div className={`relative ${wrapperClassName}`}>
      <video
        ref={ref}
        src={load && !reduceMotion ? src : undefined}
        poster={poster}
        className={className}
        aria-label={label}
        muted
        loop
        playsInline
        autoPlay
        preload={eager ? "auto" : "none"}
        disablePictureInPicture
        disableRemotePlayback
      />
      {!reduceMotion && (
        <button
          type="button"
          onClick={onToggleSound}
          aria-label={soundOn ? "Desligar o som do vídeo" : "Ligar o som do vídeo"}
          aria-pressed={soundOn}
          className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {soundOn ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
        </button>
      )}
    </div>
  );
}
