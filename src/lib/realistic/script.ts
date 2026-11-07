import "server-only";
import { anthropic } from "@/lib/ai/anthropic";
import {
  realisticVisualPrompt,
  type RealisticLanguage,
  type RealisticScene,
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
      character: {
        type: "string",
        description:
          "Descrição ÚNICA e fixa do personagem principal humano, em inglês: idade aproximada, rosto, cabelo, barba, tom de pele, corpo e roupa exata (ex.: \"a 68-year-old fisherman with deeply tanned weathered skin, short white beard, gray eyes, wearing a faded navy wool sweater and a dark knit cap\"). Ela é copiada IGUAL em todas as imagens, então deve combinar com a idade/aparência dita na narração. String vazia se o vídeo não tem uma pessoa recorrente.",
      },
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
                "Descrição visual da cena, em inglês, para um gerador de imagens FOTORREALISTAS: o que acontece, onde está, ação, iluminação e enquadramento vertical. NÃO descreva a aparência do personagem principal (idade, rosto, roupa): escreva só \"the character\" — a descrição fixa é colada pelo sistema. Outras pessoas e animais podem ser descritos. Sem texto, letreiros, legendas ou logos na imagem.",
            },
            showsCharacter: {
              type: "boolean",
              description: "true se o personagem principal aparece nesta cena; false para paisagem, objeto, animal ou detalhe sem ele.",
            },
            motionPrompt: {
              type: "string",
              description:
                'Prompt CURTO de movimento, em inglês, para animar a imagem em 5 segundos. Ex.: "the man walks toward the camera, wind in the hair, camera slowly pushing in, cinematic lighting, realistic motion"',
            },
          },
          required: ["narration", "imagePrompt", "motionPrompt", "showsCharacter"],
        },
      },
    },
    required: ["title", "character", "scenes"],
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

  const character = text(obj.character ?? obj.personagem);
  const scenes = scenesRaw
    .map((entry): RealisticScene => {
      const scene = (parseMaybeJson(entry) ?? {}) as Record<string, unknown>;
      const shows = scene.showsCharacter ?? scene.shows_character;
      return {
        narration: text(scene.narration ?? scene.narracao ?? scene.text),
        imagePrompt: text(scene.imagePrompt ?? scene.image_prompt),
        motionPrompt: text(scene.motionPrompt ?? scene.motion_prompt),
        showsCharacter: typeof shows === "boolean" ? shows : character !== "",
      };
    })
    .filter((scene) => scene.narration && scene.imagePrompt);

  if (scenes.length < count) return null;
  return {
    title: text(obj.title ?? obj.titulo) || "Vídeo realista",
    character,
    imageEditsUsed: 0,
    scenes: scenes.slice(0, count).map((scene) => ({
      ...scene,
      motionPrompt: scene.motionPrompt || "slow cinematic camera movement, realistic motion",
    })),
  };
}

const REWRITE_TOOL = {
  name: "return_scene",
  description: "Retorna a descrição visual atualizada de UMA cena.",
  input_schema: {
    type: "object" as const,
    properties: {
      imagePrompt: {
        type: "string",
        description:
          "Descrição visual FOTORREALISTA da cena em inglês (o que acontece, onde, ação, luz, enquadramento vertical), combinando com a narração. Escreva só \"the character\" para o personagem principal — nunca repita a aparência dele. Sem texto, letreiros ou logos.",
      },
      motionPrompt: {
        type: "string",
        description: 'Movimento da cena em 5 segundos, em inglês, curto, terminando com "realistic motion".',
      },
      showsCharacter: { type: "boolean", description: "true se o personagem principal aparece nesta cena." },
    },
    required: ["imagePrompt", "motionPrompt", "showsCharacter"],
  },
};

// Reescreve a parte visual de UMA cena para combinar com a narração atual
// (texto editado pelo cliente) e/ou com um pedido de mudança ("mais velho,
// de chapéu"). O personagem fixo do roteiro não muda.
export async function rewriteSceneVisuals(input: {
  script: RealisticScript;
  index: number;
  narration: string;
  styleName: string;
  // O que o cliente quer mudar na imagem (opcional).
  instruction?: string;
}): Promise<Pick<RealisticScene, "imagePrompt" | "motionPrompt" | "showsCharacter">> {
  const { script, index, narration, instruction } = input;
  const current = script.scenes[index];
  const story = script.scenes
    .map((scene, i) => `Cena ${i + 1}: ${i === index ? narration : scene.narration}`)
    .join("\n");

  const prompt = `Você ajusta UMA cena de um vídeo curto vertical realista.
Título: ${script.title}
Personagem principal (descrição fixa, não pode mudar): ${script.character ? script.character : "(nenhum personagem principal)"}
Estilo: ${input.styleName} — ${realisticVisualPrompt(input.styleName)}
Narração completa:
${story}

A cena a ajustar é a Cena ${index + 1}, cuja narração agora é: "${narration}".
Descrição visual anterior (pode estar desatualizada): "${current.imagePrompt}"
${instruction ? `O cliente pediu esta mudança na imagem: "${instruction}". Aplique-a (se pedir mudar o personagem, aplique só ao que não conflita com a descrição fixa).\n` : ""}Escreva a nova descrição visual para combinar EXATAMENTE com a narração desta cena. Regras: inglês, fotorrealista, sem texto/letreiros/logos; escreva só "the character" para o personagem principal, sem repetir a aparência dele.`;

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 1000,
        tools: [REWRITE_TOOL],
        tool_choice: { type: "tool", name: "return_scene" },
        messages: [{ role: "user", content: prompt }],
      });
      const toolUse = message.content.find((block) => block.type === "tool_use");
      const data = (toolUse && toolUse.type === "tool_use" ? toolUse.input : null) as Record<string, unknown> | null;
      const imagePrompt = text(data?.imagePrompt);
      if (!imagePrompt) throw new Error("Claude não retornou a descrição da cena.");
      return {
        imagePrompt,
        motionPrompt: text(data?.motionPrompt) || current.motionPrompt,
        showsCharacter: typeof data?.showsCharacter === "boolean" ? data.showsCharacter : current.showsCharacter,
      };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
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
- character: se o vídeo tem uma pessoa principal, descreva-a UMA vez (idade, rosto, cabelo, barba, pele, roupa exata), em inglês. A idade e o tipo de pessoa DEVEM bater com a narração (se a narração fala em "velho pescador", o personagem é um homem idoso). Sem pessoa recorrente: string vazia.
- imagePrompt: em inglês, descrição concreta e FOTORREALISTA do que acontece na cena (lugares, ação, animais, iluminação cinematográfica). Para o personagem principal escreva só "the character" e NUNCA repita a aparência dele (o sistema cola a descrição fixa). NUNCA desenho, quadrinho, anime ou 3D. NUNCA peça texto, letreiros, legendas, números na tela ou logos. Cada cena mostra um momento/ângulo DIFERENTE, no mesmo ambiente e história, para o vídeo ficar coeso. showsCharacter = true só nas cenas em que o personagem principal aparece.
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
