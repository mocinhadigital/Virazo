"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import SectionHeading from "./SectionHeading";

const FAQ_ITEMS = [
  {
    question: "O que é uma \"série\" no Virazo?",
    answer:
      "Uma série é um fluxo de vídeos com o mesmo nicho, tom de voz e estilo visual. Você configura uma vez e gera novos vídeos dentro dela sempre que quiser, respeitando o limite de séries simultâneas do seu plano.",
  },
  {
    question: "Posso editar o vídeo depois que a IA gera?",
    answer:
      "Você revisa e ajusta tema, estilo visual, categoria, duração, voz e legenda antes de gerar. Depois de pronto, o vídeo pode ser baixado e editado em qualquer editor externo, se quiser um ajuste fino.",
  },
  {
    question: "Em quais plataformas posso postar os vídeos?",
    answer:
      "Os vídeos saem no formato vertical (9:16), ideal para Reels, TikTok e YouTube Shorts. Hoje você baixa o arquivo pronto e publica manualmente na plataforma escolhida.",
  },
  {
    question: "Meus dados e pagamentos estão seguros?",
    answer:
      "Sim. A autenticação usa Supabase com criptografia padrão de mercado, e os pagamentos são processados pela Stripe — o Virazo nunca armazena os dados do seu cartão.",
  },
  {
    question: "Os vídeos podem ser gerados em outros idiomas?",
    answer:
      "Hoje o roteiro e a narração são gerados em português do Brasil. Suporte a outros idiomas está no radar para versões futuras.",
  },
  {
    question: "Existe limite de vídeos que posso gerar?",
    answer:
      "Sim, de acordo com o plano escolhido: cada plano tem uma quantidade de créditos por mês (1 crédito = 1 vídeo) e um limite de séries geradas ao mesmo tempo.",
  },
  {
    question: "Posso cancelar minha assinatura quando quiser?",
    answer:
      "Sim, o cancelamento é feito a qualquer momento direto pela Stripe, sem multa. Você continua com acesso até o fim do período já pago.",
  },
];

export default function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Dúvidas frequentes"
          title="Perguntas frequentes"
          description="Não achou o que procurava? Fale com a gente antes de assinar."
        />

        <div className="mt-10 flex flex-col gap-3">
          {FAQ_ITEMS.map((item, index) => {
            const isOpen = openIndex === index;
            return (
              <div key={item.question} className="card-glass overflow-hidden rounded-2xl">
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <span className="text-sm font-semibold text-white sm:text-base">
                    {item.question}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <p className="px-5 pb-4 text-sm leading-relaxed text-zinc-400">{item.answer}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
