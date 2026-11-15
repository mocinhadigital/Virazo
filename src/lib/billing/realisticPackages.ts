import "server-only";
import { REALISTIC_PACKAGES, type RealisticPackageKey } from "@/lib/realistic/constants";

// Pacotes do Vídeo Realista ✨ na Cakto (pagamento único). Mesmo esquema dos
// planos (lib/billing/cakto.ts): o id do produto e o link do checkout ficam
// em variáveis de ambiente, porque são criados no painel da Cakto.
//
//   CAKTO_PRODUCT_REALISTA_3 / _10 / _20   -> id do produto
//   CAKTO_CHECKOUT_REALISTA_3 / _10 / _20 -> link do checkout
const PRODUCT_ENV: Record<RealisticPackageKey, string> = {
  "3": "CAKTO_PRODUCT_REALISTA_3",
  "10": "CAKTO_PRODUCT_REALISTA_10",
  "20": "CAKTO_PRODUCT_REALISTA_20",
};

const CHECKOUT_ENV: Record<RealisticPackageKey, string> = {
  "3": "CAKTO_CHECKOUT_REALISTA_3",
  "10": "CAKTO_CHECKOUT_REALISTA_10",
  "20": "CAKTO_CHECKOUT_REALISTA_20",
};

export function findRealisticPackageByCaktoProductId(
  productId: string,
): { key: RealisticPackageKey; credits: number; label: string } | undefined {
  const pkg = REALISTIC_PACKAGES.find((p) => process.env[PRODUCT_ENV[p.key]]?.trim() === productId);
  return pkg ? { key: pkg.key, credits: pkg.credits, label: pkg.label } : undefined;
}

// Só os pacotes que têm link configurado (um pacote sem variável simplesmente não aparece,
// sem derrubar os outros).
export type RealisticCheckoutUrls = Partial<Record<RealisticPackageKey, string>>;

// Links de checkout com o e-mail do usuário já preenchido (mesmos parâmetros
// do checkout dos planos). null se nenhum pacote tem link — o pop-up então avisa
// que a compra está indisponível, em vez de mostrar um botão quebrado.
export function getRealisticCheckoutUrls(
  email: string | null | undefined,
  name?: string | null,
): RealisticCheckoutUrls | null {
  const urls: RealisticCheckoutUrls = {};
  for (const pkg of REALISTIC_PACKAGES) {
    const raw = process.env[CHECKOUT_ENV[pkg.key]]?.trim();
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if (email) {
        url.searchParams.set("email", email);
        url.searchParams.set("confirmEmail", email);
      }
      const cleanName = name?.trim();
      if (cleanName) url.searchParams.set("name", cleanName);
      urls[pkg.key] = url.toString().replace(/\+/g, "%20");
    } catch {
      console.error(`[billing/realistic] ${CHECKOUT_ENV[pkg.key]} não é uma URL válida.`);
    }
  }
  return Object.keys(urls).length > 0 ? urls : null;
}

// Ids dos produtos dos pacotes configurados (para consultar as vendas).
export function getRealisticProductIds(): { id: string; key: RealisticPackageKey }[] {
  return REALISTIC_PACKAGES.flatMap((p) => {
    const id = process.env[PRODUCT_ENV[p.key]]?.trim();
    return id ? [{ id, key: p.key }] : [];
  });
}
