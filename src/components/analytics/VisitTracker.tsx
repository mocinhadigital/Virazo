"use client";

import { useEffect } from "react";
import { trackHomeVisit } from "@/lib/analytics/visit";

// Não renderiza nada: registra 1 visita por pessoa por dia na página inicial.
export default function VisitTracker() {
  useEffect(() => {
    trackHomeVisit();
  }, []);

  return null;
}
