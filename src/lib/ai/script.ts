import "server-only";
import { anthropic } from "./anthropic";

export type Scene = {
  narration: string;
  imagePrompt: string;
};

export type Script = {
  title: string;
  scenes: Scene[];
};

const SCENES_PER_DURATION: Record<string, number> = {
  "15s": 3,
  "30s": 5,
  "60s": 8,
  "90s": 12,
};

const RETURN_SCRIPT_TOOL = {
  name: "return_script",
  description: "Retorna o roteiro do vídeo dividido em cenas.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: {
        type: "string",
        description: "Título curto e chamativo para o vídeo",
      },
      scenes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            narration: {
              type: "string",
              description: "Texto que o narrador vai falar nesta cena, em português do Brasil",
            },
            imagePrompt: {
              type: "string",
              description:
                "Descrição visual da cena, em inglês, para um gerador de imagens de IA (sem mencionar texto/legendas)",
            },
          },
          required: ["narration", "imagePrompt"],
        },
      },
    },
    required: ["title", "scenes"],
  },
};

export async function generateScript(input: {
  topic: string;
  contentStyle: string;
  visualStyle: string;
  duration: string;
}): Promise<Script> {
  const sceneCount = SCENES_PER_DURATION[input.duration] ?? 5;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2048,
    tools: [RETURN_SCRIPT_TOOL],
    tool_choice: { type: "tool", name: "return_script" },
    messages: [
      {
        role: "user",
        content: `Escreva o roteiro de um vídeo curto vertical (estilo Reels/TikTok) sobre: "${input.topic}".
Estilo de conteúdo: ${input.contentStyle}.
Estilo visual das imagens: ${input.visualStyle}.
Divida em exatamente ${sceneCount} cenas. Cada cena tem 1-2 frases de narração em português do Brasil, e uma descrição visual em inglês para gerar uma imagem nesse estilo visual.`,
      },
    ],
  });

  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude não retornou o roteiro no formato esperado.");
  }

  return toolUse.input as Script;
}
