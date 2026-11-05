import "server-only";
import { anthropic } from "@/lib/ai/anthropic";
import {
  realisticVisualPrompt,
  type RealisticLanguage,
  type RealisticScript,
} from "./constants";

const LANGUAGE_LABELS: Record<RealisticLanguage, string> = {
  pt: "português do Brasil",
  en: "English",
  es: "español",
};

function buildScriptTool(sceneCount: number) {
  return {
  name: "return_script",
  description: "Retorna o roteiro do vídeo realista dividido em cenas de 5 segundos.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: { type: "string", description: "Título curto e chamativo para o vídeo" },
      scenes: {
        type: "array",
        minItems: sceneCount,
        maxItems: sceneCount,
        description: `EXATAMENTE ${sceneCount} cenas`,
        items: {
          type: "object",
          properties: {
            narration: {
              type: "string",
              description:
                "Texto que o narrador fala nesta cena, no idioma pedido: 10 a 13 palavras (máximo 14), cerca de 4 segundos falados",
            },
            imagePrompt: {
              type: "string",
              description:
                "Descrição visual da cena, em inglês, para um gerador de imagens FOTORREALISTAS: quem aparece (idade, roupa, aparência), onde está, iluminação e enquadramento vertical. Sem texto, letreiros, legendas ou logos na imagem.",
            },
            motionPrompt: {
              type: "string",
              description:
                'Prompt CURTO de movimento, em inglês, para animar a imagem em 5 segundos. Ex.: "the man walks toward the camera, wind in the hair, camera slowly pushing in, cinematic lighting, realistic motion"',
            },
          },
          required: ["narration", "imagePrompt", "motionPrompt"],
        },
      },
    },
    required: ["title", "scenes"],
  },
  };
}

// O modelo às vezes devolve a lista de cenas como TEXTO JSON, com cenas a
// mais, ou com chaves levemente diferentes. Aqui tudo isso é aceito e
// normalizado; só falha se não der para montar as cenas pedidas.
function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeScript(raw: unknown, count: number): RealisticScript | null {
  const input = parseMaybeJson(raw);
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  const scenesRaw = parseMaybeJson(obj.scenes ?? obj.cenas);
  if (!Array.isArray(scenesRaw)) return null;

  const scenes = scenesRaw
    .map((entry) => {
      const scene = (parseMaybeJson(entry) ?? {}) as Record<string, unknown>;
      return {
        narration: text(scene.narration ?? scene.narracao ?? scene.text),
        imagePrompt: text(scene.imagePrompt ?? scene.image_prompt),
        motionPrompt: text(scene.motionPrompt ?? scene.motion_prompt),
      };
    })
    .filter((scene) => scene.narration && scene.imagePrompt);

  if (scenes.length < count) return null;
  return {
    title: text(obj.title ?? obj.titulo) || "Vídeo realista",
    scenes: scenes.slice(0, count).map((scene) => ({
      ...scene,
      motionPrompt: scene.motionPrompt || "slow cinematic camera movement, realistic motion",
    })),
  };
}

export async function generateRealisticScript(input: {
  // O que o cliente pediu: o tema (modo guiado/série) ou a ideia escrita por
  // ele com as próprias palavras (prompt livre).
  request: string;
  kind: "topic" | "idea";
  language: RealisticLanguage;
  // 6 cenas (30s) ou 12 cenas (60s).
  sceneCount: number;
  styleName: string;
  // Texto extra da instrução (ex.: ângulos já usados numa série).
  extra?: string;
}): Promise<RealisticScript> {
  const languageLabel = LANGUAGE_LABELS[input.language];
  const sceneCount = input.sceneCount;
  const subject =
    input.kind === "idea"
      ? `O cliente descreveu com as próprias palavras o que quer ver: "${input.request}". Transforme essa ideia em um vídeo fiel a ela, sem trocar o assunto.`
      : `O ASSUNTO CENTRAL E OBRIGATÓRIO é: "${input.request}". Desenvolva diretamente esse assunto, sem trocar por outro.`;

  // Última contagem de cenas devolvida (para corrigir o modelo na nova tentativa).
  let lastSceneCount: number | null = null;

  async function callModel(attempt: number): Promise<RealisticScript> {
    const correction =
      attempt > 0
        ? `\nATENÇÃO: a resposta anterior veio fora do formato${
            lastSceneCount !== null ? ` com ${lastSceneCount} cenas` : ""
          }. Devolva EXATAMENTE ${sceneCount} cenas completas (narration, imagePrompt e motionPrompt em todas), nem mais nem menos.`
        : "";

    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 8000,
      tools: [buildScriptTool(sceneCount)],
      tool_choice: { type: "tool", name: "return_script" },
      messages: [
        {
          role: "user",
          content: `${correction}Escreva o roteiro de um vídeo curto vertical (9:16, estilo Reels/TikTok) de ${sceneCount * 5} segundos, feito de ${sceneCount} cenas de 5 segundos. Cada cena vira um clipe REAL em movimento, com cara de filme.
${subject}${input.extra ? `\n${input.extra}` : ""}
Estilo realista: ${input.styleName} — ${realisticVisualPrompt(input.styleName)}.
Regras:
- Exatamente ${sceneCount} cenas. A narração de cada cena tem 10 a 13 palavras em ${languageLabel} (nunca mais de 14), em frases diretas, e continua de uma cena para a outra como um texto único, com gancho forte na primeira cena.
- imagePrompt: em inglês, descrição concreta e FOTORREALISTA (pessoas, animais e lugares com aparência real, iluminação cinematográfica). NUNCA desenho, quadrinho, anime ou 3D. NUNCA peça texto, letreiros, legendas, números na tela ou logos. Cada cena mostra um momento/ângulo DIFERENTE, com os mesmos personagens e ambiente quando houver, para o vídeo ficar coeso.
- motionPrompt: em inglês, curto, descrevendo o movimento da cena em 5 segundos (o que a pessoa/animal faz, vento, câmera, luz), sempre terminando com "realistic motion".`,
        },
      ],
    });

    const toolUse = message.content.find((block) => block.type === "tool_use");
    if (toolUse && toolUse.type === "tool_use") {
      const rawScenes = parseMaybeJson((toolUse.input as Record<string, unknown> | null)?.scenes);
      lastSceneCount = Array.isArray(rawScenes) ? rawScenes.length : null;
    }
    const script = toolUse && toolUse.type === "tool_use" ? normalizeScript(toolUse.input, sceneCount) : null;
    if (!script) {
      // Registra o que veio de verdade, para diagnóstico no terminal.
      console.error(
        `[realistic/script] resposta fora do formato (tentativa ${attempt + 1}, pedidas ${sceneCount} cenas, vieram ${lastSceneCount ?? "?"}, stop_reason=${message.stop_reason}):`,
        JSON.stringify(toolUse && toolUse.type === "tool_use" ? toolUse.input : message.content).slice(0, 1500),
      );
      throw new Error("Claude não retornou o roteiro no formato esperado.");
    }
    return script;
  }

  // Até 3 tentativas (a 1ª + 2 automáticas), cada nova avisando o modelo do
  // que veio errado — 12 cenas às vezes saem 10 ou 11 na primeira.
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await callModel(attempt);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
