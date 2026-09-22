import "server-only";
import { createHash } from "node:crypto";

// Meta Conversions API — envio server-side de eventos de conversão.
//
// Por que server-side pro Purchase: é o único lugar onde o pagamento está
// confirmado pela Stripe e verificado criptograficamente (assinatura HMAC
// do webhook). Um Purchase disparado no navegador na volta do checkout
// dependeria de uma URL de sucesso, que é forjável, e seria perdido por
// bloqueador de anúncios numa fatia grande do público.
//
// O META_CAPI_ACCESS_TOKEN é uma chave de servidor: nunca prefixar com
// NEXT_PUBLIC_, nunca importar este módulo de um Client Component (o
// "server-only" acima transforma isso em erro de build), e nunca logar.

const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION ?? "v26.0";
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const ACCESS_TOKEN = process.env.META_CAPI_ACCESS_TOKEN;
// Opcional e só pra validação no Gerenciador de Eventos (aba "Testar
// eventos"). Enquanto estiver preenchido, os eventos aparecem como evento
// de teste — deve ficar VAZIO/ausente em produção.
const TEST_EVENT_CODE = process.env.META_TEST_EVENT_CODE;

// O webhook da Stripe tem que responder rápido; se a Meta travar, não dá
// pra segurar a resposta esperando. 5s é folgado pra uma chamada que
// normalmente responde em menos de 500ms.
const REQUEST_TIMEOUT_MS = 5000;

export type PurchaseEventInput = {
  /** Id determinístico da transação (session.id da Stripe) — base da dedup. */
  eventId: string;
  /** Unix em SEGUNDOS (não milissegundos). */
  eventTime: number;
  value: number;
  currency: string;
  eventSourceUrl?: string | null;
  email?: string | null;
  externalId?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
};

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// A Meta exige normalização ANTES do hash. Sem isso, "  Fulano@Email.com "
// e "fulano@email.com" produzem hashes diferentes e o match simplesmente
// não acontece — o evento chega, mas não é atribuído a ninguém.
function hashNormalized(value: string): string | undefined {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  return sha256Hex(normalized);
}

// fbp, fbc, IP e user agent NÃO são hasheados — a Meta os quer em texto
// puro. Só os dados pessoais (e-mail, external_id) vão com SHA-256.
function compact<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    ),
  );
}

// Defesa extra: mesmo que a Meta devolvesse o token dentro de uma mensagem
// de erro, ele nunca chega ao log.
function scrubToken(text: string): string {
  if (!ACCESS_TOKEN) return text;
  return text.split(ACCESS_TOKEN).join("<token-oculto>");
}

/**
 * Envia um Purchase pra Conversions API.
 *
 * NUNCA lança: toda falha é capturada e logada aqui dentro. Quem chama está
 * num fluxo de pagamento já concluído — analytics não pode derrubar o
 * webhook nem provocar reprocessamento na Stripe.
 */
export async function sendPurchaseEvent(input: PurchaseEventInput): Promise<void> {
  try {
    if (!PIXEL_ID || !ACCESS_TOKEN) {
      console.warn(
        "[meta-capi] Purchase não enviado: NEXT_PUBLIC_META_PIXEL_ID ou META_CAPI_ACCESS_TOKEN ausente.",
      );
      return;
    }

    const hashedEmail = input.email ? hashNormalized(input.email) : undefined;
    const hashedExternalId = input.externalId ? hashNormalized(input.externalId) : undefined;

    const userData = compact({
      em: hashedEmail ? [hashedEmail] : undefined,
      external_id: hashedExternalId ? [hashedExternalId] : undefined,
      fbp: input.fbp ?? undefined,
      fbc: input.fbc ?? undefined,
      client_ip_address: input.clientIpAddress ?? undefined,
      client_user_agent: input.clientUserAgent ?? undefined,
    });

    const eventPayload = compact({
      event_name: "Purchase",
      event_time: input.eventTime,
      event_id: input.eventId,
      action_source: "website",
      event_source_url: input.eventSourceUrl ?? undefined,
      user_data: userData,
      custom_data: {
        value: input.value,
        currency: input.currency.toUpperCase(),
      },
    });

    const body = compact({
      data: [eventPayload],
      // Vai no CORPO, não na query string — assim o token não aparece em
      // log de acesso, trace de rede nem mensagem de erro de URL.
      access_token: ACCESS_TOKEN,
      test_event_code: TEST_EVENT_CODE || undefined,
    });

    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${PIXEL_ID}/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(
        `[meta-capi] Purchase rejeitado (HTTP ${response.status}) para event_id=${input.eventId}:`,
        scrubToken(detail),
      );
      return;
    }

    console.log(`[meta-capi] Purchase enviado (event_id=${input.eventId}).`);
  } catch (err) {
    console.error("[meta-capi] falha ao enviar Purchase (ignorada):", err);
  }
}
