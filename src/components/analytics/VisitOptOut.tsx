"use client";

import { useEffect } from "react";
import { NO_VISIT_TRACKING_KEY } from "@/lib/analytics/visit";

// Só é renderizado para administradores (dashboard/layout.tsx). Marca este
// navegador para que as visitas do dono à página inicial — mesmo sem estar
// logado — não entrem na contagem de "Visitaram a página".
export default function VisitOptOut() {
  useEffect(() => {
    try {
      window.localStorage.setItem(NO_VISIT_TRACKING_KEY, "1");
    } catch {
      // localStorage bloqueado: a rota ainda ignora o dono quando está logado.
    }
  }, []);

  return null;
}
