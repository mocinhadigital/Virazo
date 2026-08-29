// Script de configuração única: cria os produtos e preços dos 3 planos do
// Virazo na Stripe (mensal + anual = 6 preços). Rode de novo se precisar
// recriar em outra conta/modo (ex.: ao migrar de teste pra produção) —
// ele não apaga nada, só cria produtos/preços novos a cada execução.
//
// Uso: node scripts/setup-stripe-plans.mjs
// Precisa de STRIPE_SECRET_KEY no .env.local.

import { readFileSync } from "node:fs";
import Stripe from "stripe";

function loadEnvLocal() {
  const content = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) process.env[match[1]] = match[2];
  }
}

loadEnvLocal();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PLANS = [
  {
    key: "starter",
    name: "Virazo Starter",
    monthlyAmount: 1990, // R$19,90
    yearlyAmount: 17916, // R$14,93/mês equivalente, cobrado uma vez por ano
  },
  {
    key: "turbo",
    name: "Virazo Turbo",
    monthlyAmount: 2990, // R$29,90
    yearlyAmount: 26916, // R$22,43/mês equivalente
  },
  {
    key: "maximo",
    name: "Virazo Máximo",
    monthlyAmount: 4990, // R$49,90
    yearlyAmount: 44916, // R$37,43/mês equivalente
  },
];

async function main() {
  const result = {};

  for (const plan of PLANS) {
    const product = await stripe.products.create({ name: plan.name });

    const monthlyPrice = await stripe.prices.create({
      product: product.id,
      currency: "brl",
      unit_amount: plan.monthlyAmount,
      recurring: { interval: "month" },
    });

    const yearlyPrice = await stripe.prices.create({
      product: product.id,
      currency: "brl",
      unit_amount: plan.yearlyAmount,
      recurring: { interval: "year" },
    });

    result[plan.key] = {
      productId: product.id,
      monthlyPriceId: monthlyPrice.id,
      yearlyPriceId: yearlyPrice.id,
    };
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
