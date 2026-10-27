// Regras do registro de visitas à página inicial (tabela page_visits,
// migration 0032). Funções puras, usadas pela rota /api/analytics/visit.

// Contas do dono: nunca contam como visita. As contas em admin_users também
// não contam (a rota confere as duas coisas).
export const OWNER_EMAILS = new Set(["mocinhadigital@gmail.com", "italoeandreiavip33@gmail.com"]);

export function isOwnerEmail(email: string | null | undefined): boolean {
  return !!email && OWNER_EMAILS.has(email.trim().toLowerCase());
}

// Robôs e prévias de link. Os navegadores embutidos do Instagram e do
// Facebook (FBAN/FBAV/Instagram no User-Agent) são PESSOAS e não entram aqui;
// o que entra é o rastreador que o Facebook usa para montar prévias
// (facebookexternalhit, Meta-ExternalAgent...) e os robôs em geral.
const BOT_PATTERN = new RegExp(
  [
    "bot",
    "crawl",
    "spider",
    "slurp",
    "headless",
    "lighthouse",
    "pagespeed",
    "gtmetrix",
    "pingdom",
    "uptime",
    "monitor",
    "preview",
    "facebookexternalhit",
    "facebot",
    "meta-external",
    "whatsapp",
    "telegram",
    "discord",
    "slack",
    "curl",
    "wget",
    "python-requests",
    "axios",
    "node-fetch",
    "go-http-client",
    "http-client",
    "libwww",
    "scrapy",
    "phantomjs",
    "puppeteer",
    "playwright",
    "vercel-screenshot",
  ].join("|"),
  "i",
);

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  const ua = userAgent?.trim();
  if (!ua) return true; // navegador de verdade sempre manda User-Agent
  return BOT_PATTERN.test(ua);
}

export type CleanVisit = {
  visitorId: string;
  utmSource: string | null;
  utmCampaign: string | null;
  fbclid: string | null;
  referrer: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SOURCE = 100;
const MAX_CAMPAIGN = 200;
const MAX_FBCLID = 500;
const MAX_REFERRER = 500;

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().slice(0, max);
  return text || null;
}

// Só o que o banco aceita, com tamanho limitado. null = corpo inválido.
export function cleanVisitPayload(body: unknown): CleanVisit | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.visitorId !== "string" || !UUID_PATTERN.test(b.visitorId)) return null;
  return {
    visitorId: b.visitorId.toLowerCase(),
    utmSource: cleanText(b.utmSource, MAX_SOURCE),
    utmCampaign: cleanText(b.utmCampaign, MAX_CAMPAIGN),
    fbclid: cleanText(b.fbclid, MAX_FBCLID),
    referrer: cleanText(b.referrer, MAX_REFERRER),
  };
}

// Violação de índice único: a mesma pessoa já foi contada hoje. É o caminho
// normal quando a pessoa volta no mesmo dia — não é erro.
export const UNIQUE_VIOLATION = "23505";
