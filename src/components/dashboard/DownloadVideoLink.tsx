"use client";

import { useState, type ReactNode } from "react";
import { downloadHref, isIOS, isInAppBrowser } from "@/lib/downloadName";

// Botão de download. Nome de arquivo limpo; no navegador embutido do
// Instagram/Facebook (que bloqueia downloads) mostra como abrir no navegador;
// no iPhone explica onde o arquivo vai parar.
export default function DownloadVideoLink({
  videoUrl,
  title,
  fallbackName = "video",
  className,
  children,
}: {
  videoUrl: string;
  title: string | null | undefined;
  fallbackName?: string;
  className?: string;
  children: ReactNode;
}) {
  const [hint, setHint] = useState<string | null>(null);
  const href = downloadHref(videoUrl, title, fallbackName);

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    const ua = navigator.userAgent;
    if (isInAppBrowser(ua)) {
      e.preventDefault();
      setHint(
        "Este navegador (Instagram/Facebook) bloqueia downloads. Toque nos 3 pontinhos e escolha “Abrir no navegador”, depois baixe de novo.",
      );
    } else if (isIOS(ua)) {
      setHint("No iPhone o vídeo vai para o app Arquivos > Downloads. Para a galeria: abra o arquivo, toque em Compartilhar e em “Salvar vídeo”.");
    }
  }

  return (
    <>
      <a href={href} onClick={handleClick} className={className}>
        {children}
      </a>
      {hint && (
        <p className="mt-2 basis-full rounded-lg bg-amber-400/10 px-3 py-2 text-left text-[11px] leading-snug text-amber-200">
          {hint}{" "}
          <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="underline">
            Abrir o vídeo
          </a>
        </p>
      )}
    </>
  );
}
