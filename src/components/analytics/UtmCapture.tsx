"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { captureUtmFromUrl } from "@/lib/analytics/conversion";

// Não renderiza nada. Guarda as UTMs da URL (landing de anúncio) para os
// eventos do funil enviados depois, já no dashboard. Montado uma vez em
// src/app/layout.tsx, ao lado do MetaPixel.
export default function UtmCapture() {
  const pathname = usePathname();

  useEffect(() => {
    captureUtmFromUrl();
  }, [pathname]);

  return null;
}
