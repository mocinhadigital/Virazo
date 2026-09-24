"use client";

import { useEffect, useRef } from "react";
import { trackPixel } from "@/lib/meta/pixel";

// Purchase do Pixel na volta do checkout da Stripe.
//
// Só dispara quando a URL traz `session_id` — parâmetro que a Stripe
// preenche sozinha no redirecionamento de sucesso. Isso é o que separa uma
// COMPRA de tudo o mais que chega em /dashboard?checkout=success: a troca
// de plano feita em PlanPickerModal usa essa mesma URL, mas sem
// session_id, porque não passa por Checkout Session nenhuma e não gera
// cobrança nova.
//
// Este evento tem par no servidor: o webhook manda o mesmo Purchase pela
// Conversions API. Os dois usam o session.id como id do evento, então a
// Meta reconhece que é a MESMA venda e conta uma vez só (janela de ~48h).
// É redundância proposital — o Pixel morre com bloqueador de anúncios, a
// CAPI não; a CAPI depende do token no servidor, o Pixel não.
//
// Uma compra dispara no máximo um Purchase, e isso é garantido em quatro
// camadas independentes:
//  1. o ref abaixo, contra o efeito rodar duas vezes no Strict Mode;
//  2. localStorage por session_id, que sobrevive a recarregar a página,
//     fechar a aba e voltar depois;
//  3. a limpeza do session_id da URL, que remove o gatilho;
//  4. o eventID na Meta, que cobre até o caso de tudo acima falhar (ex.:
//     navegação anônima, onde o localStorage some a cada aba).
const STORAGE_PREFIX = "virazo:purchase-tracked:";

// Tira o session_id da barra de endereço sem recarregar nada e sem mexer
// nos outros parâmetros (o checkout=success continua lá). Além de remover
// o gatilho de um novo disparo, evita que um id de sessão vaze em link
// copiado, histórico ou cabeçalho Referer para terceiros.
function removeSessionIdFromUrl() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("session_id")) return;
    url.searchParams.delete("session_id");
    window.history.replaceState({}, "", url.toString());
  } catch {
    // history/URL indisponíveis — sem problema, as outras camadas seguram.
  }
}

export default function PurchaseTracker() {
  const alreadyRan = useRef(false);

  useEffect(() => {
    if (alreadyRan.current) return;
    alreadyRan.current = true;

    const sessionId = new URLSearchParams(window.location.search).get("session_id");
    if (!sessionId) return;

    const storageKey = `${STORAGE_PREFIX}${sessionId}`;

    let alreadyTracked = false;
    try {
      alreadyTracked = window.localStorage.getItem(storageKey) !== null;
    } catch {
      // localStorage bloqueado (modo privado, configuração do navegador).
      // Segue em frente: o eventID ainda impede a contagem dupla na Meta.
    }

    if (alreadyTracked) {
      removeSessionIdFromUrl();
      return;
    }

    void (async () => {
      try {
        const response = await fetch(
          `/api/checkout/session-summary?session_id=${encodeURIComponent(sessionId)}`,
        );
        if (!response.ok) return;

        const data = (await response.json()) as {
          paid?: boolean;
          value?: number | null;
          currency?: string | null;
        };

        if (!data.paid || typeof data.value !== "number" || !data.currency) return;

        // Marca ANTES de disparar: se o fbq falhar no meio, o pior desfecho
        // é um Purchase perdido. Marcar depois arriscaria o contrário — o
        // evento sai, a marcação não é gravada, e um F5 dispara de novo.
        try {
          window.localStorage.setItem(storageKey, new Date().toISOString());
        } catch {
          // idem acima.
        }

        trackPixel(
          "Purchase",
          { value: data.value, currency: data.currency },
          // Mesmo id usado pela Conversions API no webhook — é isto que
          // faz a Meta tratar os dois envios como uma venda só.
          { eventID: sessionId },
        );

        removeSessionIdFromUrl();
      } catch (err) {
        // Analytics nunca pode quebrar a tela pra quem acabou de pagar.
        console.error("[purchase-tracker] falha ao registrar Purchase:", err);
      }
    })();
  }, []);

  return null;
}
