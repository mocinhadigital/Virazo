// Texto curto de ajuda de cada tela do painel (botão "?"). Linguagem do dia a dia, sem termos
// técnicos. A chave é o começo do endereço; vale o mais específico.
export type HelpText = { title: string; lines: string[] };

const HELP: { prefix: string; help: HelpText }[] = [
  {
    prefix: "/dashboard/series/nova",
    help: {
      title: "Criando uma série",
      lines: [
        "Responda um passo de cada vez. No alto você vê em que passo está.",
        "No último passo você escolhe: “Gerar só quando eu pedir” (já vem marcado) ou “Gerar um vídeo novo todo dia automático”, em que você escolhe o horário.",
        "Pode voltar a qualquer momento para mudar o que escolheu.",
      ],
    },
  },
  {
    prefix: "/dashboard/series",
    help: {
      title: "Suas séries",
      lines: [
        "“Gerar um vídeo agora” cria um vídeo na hora. Antes, você escolhe a história: escrever a sua ou deixar a IA criar.",
        "“Escrever a história do próximo vídeo” deixa a história pronta para o vídeo seguinte.",
        "Cada série mostra se está em “Automático” (um vídeo por dia, no horário marcado) ou “Manual” (só quando você pedir). Toque em “Ligar automático” ou “Desligar automático” para trocar quando quiser.",
      ],
    },
  },
  {
    prefix: "/dashboard/videos",
    help: {
      title: "Seus vídeos",
      lines: [
        "Aqui ficam todos os seus vídeos. Toque em um vídeo pronto para ver e baixar.",
        "Se algum vídeo falhar, toque em “Tentar de novo”: não gasta outro vídeo do seu dia.",
        "Para fazer um vídeo novo, volte ao Início e toque em “Criar um vídeo agora”.",
      ],
    },
  },
  {
    prefix: "/dashboard/guias",
    help: {
      title: "Guias",
      lines: ["Aqui tem o passo a passo para começar e para crescer. Toque em um guia para ler."],
    },
  },
  {
    prefix: "/dashboard/contato",
    help: {
      title: "Suporte",
      lines: ["Está com dúvida ou algo não funcionou? Toque em “Falar no WhatsApp” e conte o que aconteceu."],
    },
  },
  {
    prefix: "/dashboard/configuracoes",
    help: {
      title: "Sua conta",
      lines: ["Aqui você vê os seus dados e o seu plano."],
    },
  },
  {
    prefix: "/dashboard/planos",
    help: {
      title: "Planos",
      lines: ["Aqui você vê o seu plano e pode mudar para um que gera mais vídeos por dia."],
    },
  },
  {
    prefix: "/dashboard",
    help: {
      title: "Tela inicial",
      lines: [
        "Para fazer um vídeo só, toque em “Criar um vídeo agora”.",
        "Para ter vídeos novos automáticos, toque em “Criar uma série”.",
        "Seus vídeos prontos ficam em “Vídeos”.",
      ],
    },
  },
];

const FALLBACK: HelpText = {
  title: "Precisa de ajuda?",
  lines: ["Toque em “Como usar” para rever o passo a passo, ou fale com a gente no WhatsApp."],
};

export function helpFor(pathname: string | null | undefined): HelpText {
  if (!pathname) return FALLBACK;
  // "/dashboard" só vale quando é exatamente a tela inicial.
  const found = HELP.find((h) => (h.prefix === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(h.prefix)));
  return found?.help ?? FALLBACK;
}
