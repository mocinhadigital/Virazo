"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

// Só copia o texto para a área de transferência — não envia nada.
export default function CopyEmailsButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Sem permissão de área de transferência: dá para selecionar o texto à mão.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!text}
      className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#4C3BFF] to-[#A855F7] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? "Copiado" : "Copiar e-mails"}
    </button>
  );
}
