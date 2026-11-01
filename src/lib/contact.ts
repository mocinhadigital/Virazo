// Contatos de suporte do Virazo — um lugar só, usado pela aba "Fale Conosco"
// do app, pela página de contato e pelo rodapé.

export const SUPPORT_EMAIL = "mocinhadigital@gmail.com";

// Número no formato internacional (55 = Brasil, 97 = DDD), como o wa.me exige.
export const WHATSAPP_NUMBER = "5597991544971";
export const WHATSAPP_DISPLAY = "(97) 99154-4971";

// Link do WhatsApp; com `message`, a conversa já abre com o texto pronto.
export function whatsappUrl(message?: string): string {
  const base = `https://wa.me/${WHATSAPP_NUMBER}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export const WHATSAPP_HELP_MESSAGE = "Olá! Preciso de ajuda com o Virazo.";
