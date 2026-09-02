"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import SectionHeading from "./SectionHeading";

const FAQ_ITEMS = [
  {
    question: "O que é uma série?",
    answer:
      "Uma série é um fluxo de vídeos com o mesmo nicho, tom de voz e estilo visual. Você configura uma vez e a IA gera novos vídeos dentro dela sempre que quiser, respeitando o limite de séries simultâneas do seu plano.",
  },
  {
    question: "Preciso saber editar vídeo?",
    answer:
      "Não. Você escolhe tema, estilo visual, duração, voz e legenda antes de gerar, e a IA cuida de roteiro, narração, imagens e montagem. O vídeo pronto pode ser baixado e ajustado num editor externo se quiser um refino manual.",
  },
  {
    question: "Quais plataformas funcionam?",
    answer:
      "Os vídeos saem no formato vertical (9:16), ideal para Reels, TikTok e YouTube Shorts.",
  },
  {
    question: "Como os vídeos são publicados?",
    answer:
      "Hoje você baixa o arquivo pronto direto do painel e publica manualmente na plataforma escolhida.",
  },
  {
    question: "Em que idioma os vídeos são feitos?",
    answer:
      "Ao criar uma série você escolhe o idioma — português, inglês ou espanhol —, e roteiro, narração e legenda saem nesse idioma.",
  },
  {
    question: "Quantos vídeos posso criar por mês?",
    answer:
      "De acordo com o plano escolhido: cada plano tem uma quantidade de créditos por mês (1 crédito = 1 vídeo) e um limite de séries geradas ao mesmo tempo.",
  },
  {
    question: "Posso cancelar quando quiser?",
    answer:
      "Sim, o cancelamento é feito a qualquer momento direto pela Stripe, sem multa. Você continua com acesso até o fim do período já pago.",
  },
  {
    question: "Meus dados e pagamentos estão seguros?",
    answer:
      "Sim. A autenticação usa Supabase com criptografia padrão de mercado, e os pagamentos são processados pela Stripe — o Virazo nunca armazena os dados do seu cartão.",
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
