// Registro de visita à página inicial (tabela page_visits, migration 0032).
// Usado no navegador. Mesma regra do restante do rastreamento: nunca pode
// quebrar a página — toda falha aqui é silenciosa.

const VISITOR_ID_KEY = "virazo:visitor-id";
const LAST_VISIT_DAY_KEY = "virazo:visit-day";
// Marca do navegador do dono (definida ao abrir o painel como administrador):
// visitas daqui não contam.
export const NO_VISIT_TRACKING_KEY = "virazo:no-visit-tracking";

function randomUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // versão 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Dia no fuso de Manaus (o mesmo do funil e do limite diário): "2026-10-27".
function todayInManaus(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Manaus" });
}

export function trackHomeVisit(): void {
  if (typeof window === "undefined") return;

  try {
    // Navegador automatizado (robôs que executam JavaScript).
    if (navigator.webdriver) return;
    if (window.localStorage.getItem(NO_VISIT_TRACKING_KEY)) return;

    // 1 visita por pessoa por dia: o banco também garante, isto só evita a
    // chamada à toa.
    const today = todayInManaus();
    if (window.localStorage.getItem(LAST_VISIT_DAY_KEY) === today) return;

    let visitorId = window.localStorage.getItem(VISITOR_ID_KEY);
    if (!visitorId) {
      visitorId = randomUuid();
      window.localStorage.setItem(VISITOR_ID_KEY, visitorId);
    }

    const params = new URLSearchParams(window.location.search);
    // Referrer do próprio site (voltar para a home) não é origem de visita.
    let referrer = document.referrer;
    try {
      if (referrer && new URL(referrer).host === window.location.host) referrer = "";
    } catch {
      referrer = "";
    }

    const body = JSON.stringify({
      visitorId,
      utmSource: params.get("utm_source") ?? "",
      utmCampaign: params.get("utm_campaign") ?? "",
      fbclid: params.get("fbclid") ?? "",
      referrer,
    });

    const queued = typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/analytics/visit", body);
    if (!queued) {
      void fetch("/api/analytics/visit", { method: "POST", body, keepalive: true }).catch(() => {});
    }
    window.localStorage.setItem(LAST_VISIT_DAY_KEY, today);
  } catch {
    // localStorage bloqueado (modo privado) ou outra falha: não conta, sem erro.
  }
}
