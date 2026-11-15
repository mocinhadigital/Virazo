// Regras do roteiro editável (vídeo normal e episódios de série). Arquivo SEM
// "server-only": é usado pela tela (contador de palavras, avisos) e pelo servidor
// (que confere tudo de novo — a tela nunca é a palavra final).

export type ScriptSource = "ai" | "edited" | "custom";

// Uma cena do roteiro. `original*` guardam o que a IA tinha escrito, para o
// servidor saber quais cenas o cliente mudou (e refazer a descrição da imagem
// só dessas: a imagem é gerada a partir de `imagePrompt`, não da narração).
export type ScriptScene = {
  narration: string;
  imagePrompt: string;
  originalNarration?: string;
  originalImagePrompt?: string;
};

export type EditableScript = {
  title: string;
  scenes: ScriptScene[];
  source: ScriptSource;
};

// Faixa de palavras por duração. A voz do app fala de 2,25 a 2,95 palavras por
// segundo em pt-BR (medido: 2,25 a 2,55 num texto de teste e 2,92 numa história
// real com a voz mais rápida, Sofia). O mínimo garante que o vídeo NUNCA fique
// abaixo da duração mesmo na voz/texto mais rápidos, já que a voz só pode ser
// desacelerada em 15% e texto do cliente não ganha cenas de reforço:
//  - 30s: 78 palavras a 3,0 pal/s ≈ 26s de voz ≈ 30,6s com a voz 15% mais lenta;
//  - 60s: 160 palavras a 3,0 pal/s ≈ 53s de voz ≈ 62,7s (mínimo real exigido: 61s).
// O máximo é o teto aceito pelo dono (acima disso o vídeo passa muito da duração).
export const SCRIPT_WORD_LIMITS: Record<string, { min: number; max: number; idealMin: number; idealMax: number }> = {
  "15s": { min: 25, idealMin: 30, idealMax: 40, max: 45 },
  "30s": { min: 78, idealMin: 80, idealMax: 86, max: 90 },
  "60s": { min: 160, idealMin: 160, idealMax: 168, max: 170 },
};

export const MIN_SCENES = 3;
export const MAX_SCENES = 40;
// Uma cena é uma imagem parada na tela: passou de ~12 palavras (≈ 5s) vira aviso;
// passou do teto é recusada.
export const SCENE_WORDS_WARN = 12;
export const SCENE_WORDS_MAX = 30;
export const MAX_NARRATION_CHARS = 400;
export const MAX_IMAGE_PROMPT_CHARS = 800;
export const MAX_TITLE_CHARS = 140;
export const MAX_STORY_CHARS = 2600;

// Pedidos de roteiro por conta (cada um custa ~R$ 0,06 de IA): teto por dia. O
// "Refazer roteiro" também conta. Não afeta o limite de vídeos do plano.
export const MAX_SCRIPT_REQUESTS_PER_DAY = 30;
// Quantas vezes o cliente pode apertar "Refazer roteiro" na mesma criação (a tela
// avisa; o teto por dia é o que o servidor garante).
export const MAX_SCRIPT_REDOS_PER_DRAFT = 5;

export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

export function totalWords(scenes: { narration: string }[]): number {
  return scenes.reduce((sum, s) => sum + countWords(s.narration), 0);
}

export type WordCheck = {
  words: number;
  min: number;
  max: number;
  idealMin: number;
  idealMax: number;
  state: "short" | "ok" | "long";
  message: string | null;
};

export function checkScriptWords(duration: string, words: number): WordCheck | null {
  const limits = SCRIPT_WORD_LIMITS[duration];
  if (!limits) return null;
  const base = { words, ...limits };
  if (words < limits.min) {
    return {
      ...base,
      state: "short",
      message: `Seu texto tem ${words} palavras. Para ${duration}, escreva pelo menos ${limits.min}.`,
    };
  }
  if (words > limits.max) {
    return {
      ...base,
      state: "long",
      message: `Seu texto tem ${words} palavras. Para ${duration}, o máximo é ${limits.max}: corte ${words - limits.max} palavra(s).`,
    };
  }
  return { ...base, state: "ok", message: null };
}

// O roteiro foi mudado pelo cliente? (compara a narração de cada cena com a que a
// IA escreveu). Roteiro "custom" (história própria) nunca tem original.
export function detectSource(script: { source?: ScriptSource; scenes: ScriptScene[] }): ScriptSource {
  if (script.source === "custom") return "custom";
  const changed = script.scenes.some(
    (s) => s.originalNarration !== undefined && s.narration.trim() !== s.originalNarration.trim(),
  );
  return changed ? "edited" : "ai";
}

export type ValidatedScript = {
  title: string;
  scenes: { narration: string; imagePrompt: string; originalNarration?: string; originalImagePrompt?: string }[];
  source: ScriptSource;
};

// Confere um roteiro vindo do navegador. Devolve o roteiro limpo ou a mensagem de
// erro (já em português, pronta para mostrar). Roteiro da IA sem nenhuma edição só
// tem o teto de palavras conferido (a IA às vezes fica um pouco abaixo do mínimo e
// o gerador completa com cenas de reforço); roteiro editado ou próprio precisa
// estar dentro da faixa inteira.
export function validateScriptInput(
  input: unknown,
  duration: string,
): { ok: true; script: ValidatedScript } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "Roteiro inválido." };
  const raw = input as { title?: unknown; scenes?: unknown; source?: unknown };
  if (!Array.isArray(raw.scenes)) return { ok: false, error: "Roteiro inválido." };
  if (raw.scenes.length < MIN_SCENES || raw.scenes.length > MAX_SCENES) {
    return { ok: false, error: `O roteiro precisa ter entre ${MIN_SCENES} e ${MAX_SCENES} cenas.` };
  }
  const title = typeof raw.title === "string" ? raw.title.trim().slice(0, MAX_TITLE_CHARS) : "";

  const scenes: ValidatedScript["scenes"] = [];
  for (let i = 0; i < raw.scenes.length; i++) {
    const s = raw.scenes[i] as Record<string, unknown> | null;
    if (!s || typeof s !== "object" || typeof s.narration !== "string") {
      return { ok: false, error: "Roteiro inválido." };
    }
    const narration = s.narration.replace(/\s+/g, " ").trim();
    if (!narration) return { ok: false, error: `A cena ${i + 1} está vazia. Escreva o texto ou volte ao roteiro anterior.` };
    if (narration.length > MAX_NARRATION_CHARS || countWords(narration) > SCENE_WORDS_MAX) {
      return { ok: false, error: `A cena ${i + 1} está muito longa. Divida o texto em cenas menores.` };
    }
    const imagePrompt = typeof s.imagePrompt === "string" ? s.imagePrompt.trim().slice(0, MAX_IMAGE_PROMPT_CHARS) : "";
    scenes.push({
      narration,
      imagePrompt,
      originalNarration: typeof s.originalNarration === "string" ? s.originalNarration.trim() : undefined,
      originalImagePrompt: typeof s.originalImagePrompt === "string" ? s.originalImagePrompt.trim() : undefined,
    });
  }

  const source = detectSource({ source: raw.source === "custom" ? "custom" : undefined, scenes });
  const words = totalWords(scenes);
  const check = checkScriptWords(duration, words);
  if (!check) return { ok: false, error: "Duração inválida para o roteiro." };
  if (check.state === "long" || (check.state === "short" && source !== "ai")) {
    return { ok: false, error: check.message ?? "O texto não cabe nesta duração." };
  }
  return { ok: true, script: { title, scenes, source } };
}

// ---------------------------------------------------------------------------
// Roteiro como TEXTO CORRIDO (tela de leitura/edição, como no AutoShortz)
// ---------------------------------------------------------------------------

// O que a tela envia ao servidor ao gerar/salvar:
//  - `scenes`: o roteiro de base (o que a IA escreveu ou o que já estava salvo), com a
//    descrição de imagem de cada cena;
//  - `text`: só quando o cliente editou o texto. O servidor divide esse texto em cenas
//    e mantém a imagem das cenas que ficaram iguais; as demais ganham imagem nova.
export type ScriptPayload = {
  title: string;
  source: "ai" | "custom";
  scenes: { narration: string; imagePrompt: string }[];
  text?: string;
};

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// Cenas -> parágrafos para mostrar/editar (3 cenas por parágrafo, texto idêntico ao das
// cenas; só a quebra de linha é de exibição).
export function scenesToParagraphs(scenes: { narration: string }[], perParagraph = 3): string {
  const paragraphs: string[] = [];
  for (let i = 0; i < scenes.length; i += perParagraph) {
    paragraphs.push(
      scenes
        .slice(i, i + perParagraph)
        .map((s) => s.narration.trim())
        .join(" "),
    );
  }
  return paragraphs.join("\n\n");
}
