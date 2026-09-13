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

const LANGUAGE_LABELS = {
  pt: "português do Brasil",
  en: "English",
  es: "español",
} as const;

function buildReturnScriptTool(languageLabel: string) {
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
                description: `Texto que o narrador vai falar nesta cena, em ${languageLabel}`,
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
}): Promise<Script> {
  const sceneCount = SCENES_PER_DURATION[input.duration] ?? 5;
  const languageLabel = LANGUAGE_LABELS[input.language ?? "pt"];
  const theme = input.coreTheme ?? input.topic;

  async function callModel(reinforceAdherence: boolean): Promise<Script> {
    const reinforcement = reinforceAdherence
      ? `ATENÇÃO: uma tentativa anterior se desviou do assunto pedido. Desta vez siga ESTRITAMENTE a instrução abaixo, sem trocar de assunto.\n\n`
      : "";

    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2048,
      tools: [buildReturnScriptTool(languageLabel)],
      tool_choice: { type: "tool", name: "return_script" },
      messages: [
        {
          role: "user",
          content: `${reinforcement}Escreva o roteiro de um vídeo curto vertical (estilo Reels/TikTok). O ASSUNTO CENTRAL E OBRIGATÓRIO deste vídeo é: "${input.topic}". Todo o roteiro deve desenvolver diretamente esse assunto — nunca troque por outro tema, nunca invente uma história genérica desconectada, e preserve os nomes/conceitos centrais mencionados nele.
O "estilo de conteúdo" e o "estilo visual" abaixo controlam APENAS o tom e a estética de como esse mesmo assunto é contado — eles nunca substituem nem alteram o assunto.
Estilo de conteúdo (tom): ${input.contentStyle}.
Estilo visual das imagens: ${input.visualStyle}.
Divida em exatamente ${sceneCount} cenas. Cada cena tem 1-2 frases de narração em ${languageLabel}, e uma descrição visual em inglês para gerar uma imagem nesse estilo visual — sempre representando o mesmo assunto central, nunca um assunto diferente.`,
        },
      ],
    });

    const toolUse = message.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error("Claude não retornou o roteiro no formato esperado.");
    }

    return toolUse.input as Script;
  }

  const firstAttempt = await callModel(false);
  if (scriptMatchesTheme(theme, firstAttempt)) {
    return firstAttempt;
  }

  // Só 1 nova tentativa, com o mesmo tema reforçado — barato (mais 1
  // chamada, não um loop) e cobre o caso real de drift observado.
  const secondAttempt = await callModel(true);
  if (scriptMatchesTheme(theme, secondAttempt)) {
    return secondAttempt;
  }

  throw new Error(
    `topic_adherence_failed: não foi possível gerar um roteiro aderente ao tema "${theme}" após nova tentativa.`,
  );
}
