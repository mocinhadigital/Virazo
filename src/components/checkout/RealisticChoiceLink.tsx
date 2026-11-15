"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { RealisticPackageKey } from "@/lib/realistic/constants";
import { realisticCheckoutPath, rememberSelectedRealisticPackage } from "@/lib/billing/selectedRealisticPackage";

// Botão de pacote da página /realista: grava o pacote no cookie (para sobreviver ao login com
// Google) e segue para /realista/comprar?pacote=… (mesmo desenho do PlanChoiceLink de /planos).
export default function RealisticChoiceLink({
  packageKey,
  className,
  children,
}: {
  packageKey: RealisticPackageKey;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={realisticCheckoutPath(packageKey)}
      onClick={() => rememberSelectedRealisticPackage(packageKey)}
      className={className}
    >
      {children}
    </Link>
  );
}
