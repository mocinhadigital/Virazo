"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

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
// Respeita "reduzir movimento" do sistema: nesse caso fica só a imagem de capa.
export default function LazyVideo({
  src,
  poster,
  className,
  label,
  eager = false,
}: {
  src: string;
  poster: string;
  className?: string;
  label: string;
  eager?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [load, setLoad] = useState(eager);
  const reduceMotion = useSyncExternalStore(
    subscribeReduceMotion,
    () => window.matchMedia(REDUCE_MOTION_QUERY).matches,
    () => false,
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || reduceMotion) return;
    // O atributo "muted" do React nem sempre chega ao elemento; sem isso o
    // navegador bloqueia o autoplay.
    el.muted = true;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setLoad(true);
          void el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { rootMargin: "250px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reduceMotion]);

  // Assim que o arquivo passa a existir no elemento, começa a tocar.
  useEffect(() => {
    if (load && !reduceMotion) void ref.current?.play().catch(() => {});
  }, [load, reduceMotion]);

  return (
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
  );
}
