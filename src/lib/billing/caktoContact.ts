// Contato do cliente num aviso da Cakto de compra NÃO concluída
// (checkout_abandonment, pix_gerado...). O formato desses avisos não é o
// mesmo das vendas e ainda não foi visto em produção — então procura o
// e-mail/celular/plano nos nomes de campo mais comuns, em vez de depender de
// um só. Usado só pela lista de recuperação; o processamento de pagamentos
// (caktoEvents.ts) não usa isto.

type Obj = Record<string, unknown>;

const asObj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const firstString = (...values: unknown[]): string | null => {
  for (const v of values) if (typeof v === "string" && v.trim()) return v.trim();
  return null;
};

export type CaktoContact = { email: string | null; phone: string | null; productName: string | null };

export function readCaktoContact(payload: unknown, emailColumn?: string | null): CaktoContact {
  const root = asObj(payload);
  const data = asObj(root.data);
  const customer = asObj(data.customer);
  const product = asObj(data.product);
  const offer = asObj(data.offer);

  const email = firstString(
    emailColumn,
    customer.email,
    data.customerEmail,
    data.customer_email,
    data.email,
  );
  const phone = firstString(
    customer.phone,
    customer.cellphone,
    customer.mobile,
    data.customerCellphone,
    data.customerPhone,
    data.customer_phone,
    data.phone,
    data.cellphone,
  );
  const productName = firstString(product.name, offer.name, data.productName, data.offerName, data.product_name);

  return { email: email ? email.toLowerCase() : null, phone, productName };
}
