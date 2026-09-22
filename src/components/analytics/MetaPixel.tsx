"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { META_PIXEL_ID, trackPixel } from "@/lib/meta/pixel";

// ÚNICA instalação do Meta Pixel do projeto. Montado uma vez em
// src/app/layout.tsx — NÃO duplicar este componente em outro layout/página
// e NÃO colar o snippet do Gerenciador de Eventos manualmente em lugar
// nenhum (nem via GTM, nem via injeção de script no painel da Vercel/Meta):
// duas instalações = PageView contado duas vezes e otimização de campanha
// aprendendo em cima de número inflado.
//
// A divisão de responsabilidade entre o snippet e o useEffect abaixo é o
// que garante exatamente 1 PageView por rota vista:
//
//  - o snippet inline faz `init` + o PRIMEIRO `PageView` (o do carregamento
//    da página). Precisa ser no próprio script: o useEffect pode rodar
//    antes de `window.fbq` existir, já que `afterInteractive` injeta o
//    script depois da hidratação — um PageView disparado antes disso se
//    perderia.
//  - o useEffect dispara PageView SÓ nas navegações seguintes. O App Router
//    não recarrega a página em navegação client-side, então sem isso uma
//    sessão inteira dentro do /dashboard contaria um único PageView.
export default function MetaPixel() {
  const pathname = usePathname();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    if (!META_PIXEL_ID) return;

    // Primeira execução: o PageView desta rota já saiu pelo snippet inline.
    // Só memoriza qual é a rota atual, sem disparar nada.
    if (lastTrackedPath.current === null) {
      lastTrackedPath.current = pathname;
      return;
    }

    // Mesma rota de novo (re-render, ou efeito invocado duas vezes pelo
    // Strict Mode em dev) — não houve navegação, não conta PageView.
    if (lastTrackedPath.current === pathname) return;

    lastTrackedPath.current = pathname;
    trackPixel("PageView");
  }, [pathname]);

  if (!META_PIXEL_ID) return null;

  return (
    <>
      <Script id="meta-pixel-base" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', ${JSON.stringify(META_PIXEL_ID)});
fbq('track', 'PageView');`}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          alt=""
          src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}
