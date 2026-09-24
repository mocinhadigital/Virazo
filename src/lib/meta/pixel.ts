// Wrapper tipado do Meta Pixel. TODO disparo do lado do navegador passa por
// aqui — nenhum componente fala com `window.fbq` diretamente, pra não
// espalhar cast de `window` e checagem de existência pelo código.
//
// O pixel pode simplesmente não existir em runtime: bloqueador de anúncios
// (comum no público pt-BR), NEXT_PUBLIC_META_PIXEL_ID ausente em dev/preview,
// ou o script ainda não ter terminado de carregar. Em todos esses casos as
// funções abaixo viram no-op silencioso — analytics nunca pode quebrar um
// fluxo de produto (cadastro, checkout).

export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

export type PixelParams = Record<string, string | number | boolean | undefined>;

type FbqOptions = { eventID?: string };

type Fbq = (
  command: "init" | "track" | "trackCustom",
  eventNameOrPixelId: string,
  params?: PixelParams,
  options?: FbqOptions,
) => void;

declare global {
  interface Window {
    fbq?: Fbq;
  }
}

// `options.eventID` existe pra deduplicação navegador <-> Conversions API:
// quando o mesmo evento é enviado dos dois lados com o MESMO id, a Meta
// descarta a segunda ocorrência (janela de ~48h). Hoje só o Purchase usa
// isso: PurchaseTracker (navegador) e o webhook da Stripe (servidor)
// mandam o mesmo evento com o session.id da Stripe como id — quem passar
// eventID precisa garantir que o outro lado use exatamente o mesmo valor,
// senão a venda é contada duas vezes.
export function trackPixel(
  eventName: string,
  params?: PixelParams,
  options?: FbqOptions,
) {
  if (typeof window === "undefined") return;

  const fbq = window.fbq;
  if (typeof fbq !== "function") return;

  try {
    if (options) {
      fbq("track", eventName, params, options);
    } else {
      fbq("track", eventName, params);
    }
  } catch (err) {
    console.error("[meta-pixel] falha ao disparar evento:", eventName, err);
  }
}
