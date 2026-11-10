import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { sendDueRecoveryEmails } from "@/lib/billing/pixRecovery";

// Envia os e-mails de recuperação de Pix que já passaram do horário (15 min),
// conferindo de novo, na hora, se o pedido/e-mail já pagou. Chamada a cada
// minuto pelo agendador do Supabase (pg_cron + pg_net) — o cron da Vercel no
// plano Hobby só roda 1x por dia. Protegida por `Authorization: Bearer
// <CRON_SECRET>`; sem a variável a rota fica desligada.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET não configurado — rotina desativada." }, { status: 503 });
  }

  const auth = request.headers.get("authorization") ?? "";
  const received = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (!secretsMatch(received, expected)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const summary = await sendDueRecoveryEmails(createServiceRoleClient());
    if (summary.due > 0) console.log("[cron/pix-recovery] resumo:", JSON.stringify(summary));
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[cron/pix-recovery] falhou:", err);
    return NextResponse.json({ error: "Falha no envio dos e-mails de recuperação." }, { status: 500 });
  }
}

function secretsMatch(received: string, expected: string): boolean {
  if (!received) return false;
  const a = createHash("sha256").update(received).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
