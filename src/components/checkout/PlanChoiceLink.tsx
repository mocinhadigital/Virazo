"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { PlanKey } from "@/lib/billing/plans";
import { checkoutPath, rememberSelectedPlan } from "@/lib/billing/selectedPlan";

// Botão "Escolher …" da página /planos: grava o plano no cookie (para
// sobreviver ao login com Google) e segue para /assinar?plano=….
export default function PlanChoiceLink({
  plan,
  className,
  children,
}: {
  plan: PlanKey;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={checkoutPath(plan)} onClick={() => rememberSelectedPlan(plan)} className={className}>
      {children}
    </Link>
  );
}
