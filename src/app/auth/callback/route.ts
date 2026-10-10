import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { checkoutPath, parsePlanKey, SELECTED_PLAN_COOKIE } from "@/lib/billing/selectedPlan";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const explicitNext = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Quem escolheu um plano em /planos antes de entrar (cookie, ver
      // lib/billing/selectedPlan.ts) segue para o checkout dele. Um "next"
      // explícito (ex.: recuperação de senha) sempre tem prioridade; sem
      // nenhum dos dois, o painel, como sempre.
      const selectedPlan = parsePlanKey((await cookies()).get(SELECTED_PLAN_COOKIE)?.value);
      const next = explicitNext ?? (selectedPlan ? checkoutPath(selectedPlan) : "/dashboard");
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
