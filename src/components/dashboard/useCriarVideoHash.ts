"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// "Criar vídeo" não é uma rota própria — é a âncora #criar dentro da própria
// página do Painel (/dashboard). Como não existe um pathname diferente pra
// distinguir as duas, isso acompanha o hash da URL pra saber quando o
// usuário está "em" Criar vídeo.
export function useIsCriarVideoActive(): boolean {
  const pathname = usePathname();
  const [hash, setHash] = useState("");

  useEffect(() => {
    function updateHash() {
      setHash(window.location.hash);
    }
    updateHash();
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, [pathname]);

  return pathname === "/dashboard" && hash === "#criar";
}
