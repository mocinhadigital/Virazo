import "server-only";
import { anthropic } from "@/lib/ai/anthropic";

// A imagem de cada cena é gerada a partir da DESCRIÇÃO VISUAL (em inglês), não da
// narração. Quando o cliente muda o texto de uma cena (ou escreve a própria
// história), a descrição antiga já não combina — esta função escreve a descrição
// nova, olhando o roteiro inteiro para manter personagens e ambiente coerentes.
// Uma única chamada barata para todas as cenas que precisam.
export async function writeImagePrompts(input: {
  title: string;
  narrations: string[];
  // Posições (0-based) das cenas que precisam de descrição nova.
  indexes: number[];
  // Descrições que já existem (das cenas que NÃO mudam), para manter o mesmo estilo.
  existingPrompts?: (string | null)[];
  visualStyle: string;
}): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (input.indexes.length === 0) return result;

  const lines = input.narrations
    .map((n, i) => {
      const need = input.indexes.includes(i);
      const existing = input.existingPrompts?.[i];
      return `${i + 1}. ${n}${need ? "  <-- ESCREVER DESCRIÇÃO" : existing ? `\n   (descrição atual: ${existing})` : ""}`;
    })
    .join("\n");

  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 4096,
    tools: [
      {
        name: "return_image_prompts",
        description: "Devolve a descrição visual (em inglês) de cada cena pedida.",
        input_schema: {
          type: "object" as const,
          properties: {
            prompts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  scene: { type: "integer", description: "Número da cena (1 = primeira)" },
                  imagePrompt: {
                    type: "string",
                    description:
                      "Descrição visual da cena, em inglês, para um gerador de imagens de IA (sem mencionar texto, legendas ou logotipos)",
                  },
                },
                required: ["scene", "imagePrompt"],
              },
            },
          },
          required: ["prompts"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "return_image_prompts" },
    messages: [
      {
        role: "user",
        content: `Este é o roteiro narrado de um vídeo curto vertical${input.title ? ` chamado "${input.title}"` : ""}:
${lines}

Escreva a descrição visual, em inglês, SÓ das cenas marcadas com "<-- ESCREVER DESCRIÇÃO". Cada descrição mostra o que a narração DESSA cena conta, num momento/ângulo diferente das outras cenas, mantendo os mesmos personagens e ambiente do resto do roteiro. Estilo visual das imagens: ${input.visualStyle}. Sem texto na imagem.`,
      },
    ],
  });

  const toolUse = message.content.find((b) => b.type === "tool_use");
  if (toolUse && toolUse.type === "tool_use") {
    const prompts = (toolUse.input as { prompts?: unknown }).prompts;
    if (Array.isArray(prompts)) {
      for (const p of prompts) {
        const item = p as { scene?: unknown; imagePrompt?: unknown };
        if (typeof item.scene === "number" && typeof item.imagePrompt === "string" && item.imagePrompt.trim()) {
          result.set(item.scene - 1, item.imagePrompt.trim());
        }
      }
    }
  }

  // Qualquer cena sem resposta cai numa descrição genérica baseada na narração —
  // nunca na antiga (a imagem tem que acompanhar o texto novo).
  for (const i of input.indexes) {
    if (!result.has(i)) result.set(i, `Cinematic scene illustrating: ${input.narrations[i]}`);
  }
  return result;
}
