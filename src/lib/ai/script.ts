import "server-only";
import { anthropic } from "./anthropic";
import { WORDS_PER_SCENE } from "@/lib/video/durationTarget";

export type Scene = {
  narration: string;
  imagePrompt: string;
};

export type Script = {
  title: string;
  scenes: Scene[];
};

// Uma cena (= uma imagem) a cada ~3-4s de narração, pra o vídeo nunca ficar
// parado numa imagem só: ~3s por cena em 15s, ~3,3s por cena nas demais.
const SCENES_PER_DURATION: Record<string, number> = {
  "15s": 5,
  "30s": 9,
  "60s": 18,
  "90s": 27,
};

const LANGUAGE_LABELS = {
  pt: "português do Brasil",
  en: "English",
  es: "español",
} as const;

function buildReturnScriptTool(languageLabel: string) {
  const { min, max } = WORDS_PER_SCENE;
  return {
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
                description: `Texto que o narrador vai falar nesta cena, em ${languageLabel}: 1 ou 2 frases CURTAS, de ${min} a ${max} palavras no total (nunca menos de ${min}; ~3,5 segundos falados)`,
              },
              imagePrompt: {
                type: "string",
                description:
                  "Descrição visual da cena, em inglês, para um gerador de imagens de IA (sem mencionar texto/legendas). Cada cena mostra um momento/ângulo DIFERENTE, no mesmo estilo visual das demais",
              },
            },
            required: ["narration", "imagePrompt"],
          },
        },
      },
      required: ["title", "scenes"],
    },
  };
}

// Remove acentos e normaliza pra minúsculo, só pra comparação de texto —
// não afeta o que é exibido/narrado em lugar nenhum.
function normalizeForMatch(text: string): string {
  let result = "";
  for (const ch of text.normalize("NFD")) {
    const code = ch.codePointAt(0) ?? 0;
    // Faixa Unicode "Combining Diacritical Marks" (acentos separados pela
    // decomposição NFD) — descartada caractere a caractere em vez de via
    // regex, pra não depender de escape \uXXXX dentro de uma classe de
    // caracteres.
    if (code >= 0x0300 && code <= 0x036f) continue;
    result += ch;
  }
  return result.toLowerCase();
}

// Palavras comuns demais (pt/en/es) pra servirem de evidência de aderência
// ao tema — apareceriam em qualquer roteiro, sobre qualquer assunto.
const STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "que", "com", "para", "uma", "um", "uns", "umas", "os", "as",
  "no", "na", "nos", "nas", "em", "por", "sobre", "como", "mais", "muito", "mesmo", "seu", "sua",
  "seus", "suas", "este", "esta", "isso", "essa", "esse", "ele", "ela", "eles", "elas", "ser",
  "foi", "era", "sao", "tem", "ter", "ate", "entre", "sem", "and", "the", "for", "with", "from",
  "that", "this", "are", "was", "were", "about", "into", "onto", "los", "las", "del", "una", "por",
  // Moldes de nome de série ("O que acontece se…"): fazem parte do formato do
  // título, não do assunto — exigir essas palavras no roteiro trava sem motivo.
  "acontece", "acontecer", "acontecesse", "aconteceria", "acontecem",
]);

// Extrai as palavras do tema que realmente identificam o assunto (nomes,
// conceitos), descartando conectivos — usadas só pra checar se o roteiro
// gerado tocou em pelo menos uma delas.
function extractThemeKeywords(theme: string): string[] {
  const normalized = normalizeForMatch(theme);
  const words = normalized.split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return Array.from(new Set(words));
}

// Checagem barata (sem chamada de IA) de aderência ao tema: o roteiro deve
// mencionar pelo menos uma palavra-chave do tema central em algum lugar
// (título ou narração de alguma cena). Não prova aderência perfeita, mas
// pega com folga o caso real observado em produção — um roteiro que troca
// o assunto inteiro por outro (ex.: tema "A volta de jesus" virando uma
// história sobre peste medieval não tem nenhuma palavra em comum).
function scriptMatchesTheme(theme: string, script: Script): boolean {
  const keywords = extractThemeKeywords(theme);
  if (keywords.length === 0) return true; // tema curto/genérico demais pra validar — não bloqueia à toa
  const haystack = normalizeForMatch(`${script.title} ${script.scenes.map((s) => s.narration).join(" ")}`);
  return keywords.some((kw) => haystack.includes(kw));
}

// O modelo às vezes devolve "scenes" como texto JSON em vez de lista.
function normalizeScript(input: unknown): Script {
  const raw = input as { title?: string; scenes?: unknown };
  let scenes = raw.scenes;
  if (typeof scenes === "string") {
    try {
      scenes = JSON.parse(scenes);
      // Às vezes o objeto inteiro ({title, scenes}) vem como texto no campo.
      if (scenes && !Array.isArray(scenes) && typeof scenes === "object") {
        const inner = scenes as { title?: string; scenes?: unknown };
        raw.title ||= inner.title;
        scenes = inner.scenes;
      }
    } catch {
      scenes = undefined;
    }
  }
  if (!Array.isArray(scenes) || scenes.length === 0) throw new Error("Claude retornou cenas em formato inválido.");
  // Cena sem narração é descartada; sem descrição de imagem, usa a narração.
  const fixed = (scenes as Partial<Scene>[])
    .filter((sc) => typeof sc?.narration === "string" && sc.narration.trim().length > 0)
    .map((sc) => ({
      narration: sc.narration as string,
      imagePrompt:
        typeof sc.imagePrompt === "string" && sc.imagePrompt.trim().length > 0
          ? sc.imagePrompt
          : `Cinematic scene illustrating: ${sc.narration}`,
    }));
  if (fixed.length === 0) throw new Error("Claude retornou cenas em formato inválido.");
  return { title: raw.title ?? "", scenes: fixed };
}

export async function generateScript(input: {
  // Instrução completa enviada ao modelo — pode incluir orientação extra
  // (ex.: "explore um ângulo ainda não coberto"), não só o assunto puro.
  topic: string;
  // Assunto central, "nu", usado para validar aderência (ver
  // scriptMatchesTheme). Se omitido, usa `topic` — correto pro vídeo avulso,
  // onde `topic` já É o assunto puro digitado pelo usuário.
  coreTheme?: string;
  contentStyle: string;
  visualStyle: string;
  duration: string;
  language?: "pt" | "en" | "es";
  // Só séries: o que os episódios anteriores já contaram + regras para o novo
  // episódio ser diferente (ver src/lib/series/memory.ts).
  seriesMemory?: string;
  // Roteiro de episódio de série: se, depois da nova tentativa, o texto ainda
  // não citar as palavras do nome da série, aceita mesmo assim em vez de falhar
  // (um episódio novo e diferente quase nunca repete o nome da série).
  isSeries?: boolean;
}): Promise<Script> {
  const sceneCount = SCENES_PER_DURATION[input.duration] ?? 5;
  const languageLabel = LANGUAGE_LABELS[input.language ?? "pt"];
  const theme = input.coreTheme ?? input.topic;

  async function callModel(reinforceAdherence: boolean): Promise<Script> {
    const keywords = extractThemeKeywords(theme).slice(0, 6);
    const reinforcement = reinforceAdherence
      ? `ATENÇÃO: uma tentativa anterior se desviou do assunto pedido. Desta vez siga ESTRITAMENTE a instrução abaixo, sem trocar de assunto${
          keywords.length > 0 ? ` e cite explicitamente o assunto central no roteiro (por exemplo com: ${keywords.join(", ")})` : ""
        }.\n\n`
      : "";

    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      tools: [buildReturnScriptTool(languageLabel)],
      tool_choice: { type: "tool", name: "return_script" },
      messages: [
        {
          role: "user",
          content: `${reinforcement}Escreva o roteiro de um vídeo curto vertical (estilo Reels/TikTok). O ASSUNTO CENTRAL E OBRIGATÓRIO deste vídeo é: "${input.topic}". Todo o roteiro deve desenvolver diretamente esse assunto — nunca troque por outro tema, nunca invente uma história genérica desconectada, e preserve os nomes/conceitos centrais mencionados nele.
O "estilo de conteúdo" e o "estilo visual" abaixo controlam APENAS o tom e a estética de como esse mesmo assunto é contado — eles nunca substituem nem alteram o assunto.
Estilo de conteúdo (tom): ${input.contentStyle}.
Estilo visual das imagens: ${input.visualStyle}.${input.seriesMemory ? `\n${input.seriesMemory}` : ""}
Divida em exatamente ${sceneCount} cenas. Cada cena tem 1 ou 2 frases CURTAS de narração em ${languageLabel} — de ${WORDS_PER_SCENE.min} a ${WORDS_PER_SCENE.max} palavras no total (NUNCA menos de ${WORDS_PER_SCENE.min} nem mais de ${WORDS_PER_SCENE.max}), para durar uns 3,5 segundos falados — frases diretas, sem orações longas — e uma descrição visual em inglês para gerar uma imagem nesse estilo visual — sempre representando o mesmo assunto central, nunca um assunto diferente. Cada cena deve ter uma imagem DIFERENTE das outras (outro momento, ângulo ou detalhe da história), mas todas no mesmo estilo visual, com os mesmos personagens/ambiente quando houver, para o vídeo parecer coeso. A narração continua de uma cena para a outra como um texto único.`,
        },
      ],
    });

    const toolUse = message.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error("Claude não retornou o roteiro no formato esperado.");
    }

    return normalizeScript(toolUse.input);
  }

  // Resposta com cenas em formato inválido: tenta de novo (até 3x) antes de falhar.
  async function callModelWithRetry(reinforce: boolean): Promise<Script> {
    for (let i = 0; ; i++) {
      try {
        return await callModel(reinforce);
      } catch (err) {
        if (i >= 2 || !/formato/.test(String((err as Error).message))) throw err;
      }
    }
  }

  const firstAttempt = await callModelWithRetry(false);
  if (scriptMatchesTheme(theme, firstAttempt)) {
    return firstAttempt;
  }

  // Só 1 nova tentativa, com o mesmo tema reforçado — barato (mais 1
  // chamada, não um loop) e cobre o caso real de drift observado.
  const secondAttempt = await callModelWithRetry(true);
  if (scriptMatchesTheme(theme, secondAttempt)) {
    return secondAttempt;
  }

  if (input.isSeries) {
    console.warn(`[script] roteiro de série sem as palavras do tema "${theme}" após nova tentativa — aceito mesmo assim.`);
    return secondAttempt;
  }

  throw new Error(
    "Não conseguimos criar um roteiro que combinasse com o tema desta vez. Tente gerar de novo: esse vídeo não foi descontado do seu limite diário nem do seu bônus.",
  );
}

// Cenas de reforço quando a narração sai curta: continuam o roteiro e fecham
// o vídeo (a última termina com chamada para seguir o canal).
export async function generateExtraScenes(input: {
  script: Script;
  count: number;
  visualStyle: string;
  language?: "pt" | "en" | "es";
}): Promise<Scene[]> {
  const languageLabel = LANGUAGE_LABELS[input.language ?? "pt"];
  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2048,
    tools: [buildReturnScriptTool(languageLabel)],
    tool_choice: { type: "tool", name: "return_script" },
    messages: [
      {
        role: "user",
        content: `Este é o roteiro de um vídeo curto vertical, que ficou curto demais:
Título: ${input.script.title}
${input.script.scenes.map((s, i) => `${i + 1}. ${s.narration}`).join("\n")}

Escreva exatamente ${input.count} cena(s) FINAIS que continuam a narração acima sem repetir nada, no mesmo assunto e tom, em ${languageLabel}. Cada cena: de ${WORDS_PER_SCENE.min} a ${WORDS_PER_SCENE.max} palavras. A ÚLTIMA cena fecha o vídeo com uma chamada curta para seguir o canal. Descrição visual de cada cena em inglês, no estilo: ${input.visualStyle}, sem texto na imagem. Devolva o campo title igual ao título acima.`,
      },
    ],
  });
  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("Claude não retornou as cenas extras.");
  return normalizeScript(toolUse.input).scenes.slice(0, input.count);
}
