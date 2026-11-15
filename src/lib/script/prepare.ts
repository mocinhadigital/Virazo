import "server-only";
import type { Script } from "@/lib/ai/script";
import { writeImagePrompts } from "./imagePrompts";
import {
  checkScriptWords,
  countWords,
  MAX_SCENES,
  MAX_STORY_CHARS,
  MIN_SCENES,
  normalizeText,
  validateScriptInput,
  type ScriptSource,
} from "./limits";
import { alignToBaseline } from "./split";

export type ApprovedScript = {
  script: Script;
  source: ScriptSource;
  // O que fica guardado em videos.script / series.next_script.
  stored: { title: string; scenes: { narration: string; imagePrompt: string }[]; source: ScriptSource };
};

// Confere o roteiro que o cliente aprovou e deixa cada cena pronta para gerar a
// imagem. Cena cujo TEXTO mudou ganha uma descrição de imagem NOVA (a imagem nunca
// repete a antiga); cena que o cliente não tocou mantém a que já tinha; descrição
// que o próprio cliente editou à mão vale como escrita.
export async function prepareApprovedScript(
  raw: unknown,
  duration: string,
  visualStyle: string,
  fallbackTitle: string,
): Promise<{ ok: true; approved: ApprovedScript } | { ok: false; error: string }> {
  // Texto corrido editado pelo cliente (ou história própria): divide em cenas aqui.
  if (raw && typeof raw === "object" && typeof (raw as { text?: unknown }).text === "string") {
    return prepareFromText(raw as { title?: unknown; source?: unknown; scenes?: unknown; text: string }, duration, visualStyle, fallbackTitle);
  }
  const checked = validateScriptInput(raw, duration);
  if (!checked.ok) return checked;
  const { title, scenes, source } = checked.script;

  const prompts: string[] = scenes.map((s) => s.imagePrompt);
  const indexes: number[] = [];
  scenes.forEach((s, i) => {
    const textChanged = s.originalNarration !== undefined && s.narration !== s.originalNarration;
    const promptEditedByHand = s.originalImagePrompt !== undefined && s.imagePrompt !== s.originalImagePrompt;
    if (!s.imagePrompt || (textChanged && !promptEditedByHand)) indexes.push(i);
  });

  const finalTitle = title || fallbackTitle;
  if (indexes.length > 0) {
    const written = await writeImagePrompts({
      title: finalTitle,
      narrations: scenes.map((s) => s.narration),
      indexes,
      existingPrompts: prompts,
      visualStyle,
    });
    for (const i of indexes) prompts[i] = written.get(i) ?? prompts[i];
  }

  const finalScenes = scenes.map((s, i) => ({ narration: s.narration, imagePrompt: prompts[i] }));
  return {
    ok: true,
    approved: {
      script: { title: finalTitle, scenes: finalScenes },
      source,
      stored: { title: finalTitle, scenes: finalScenes, source },
    },
  };
}

// Lê um roteiro guardado no banco (videos.script / series.next_script). null se não
// tiver o formato esperado — nesse caso quem chama escreve um roteiro novo.
export function readStoredScript(raw: unknown): { script: Script; source: ScriptSource } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { title?: unknown; scenes?: unknown; source?: unknown };
  if (!Array.isArray(r.scenes) || r.scenes.length === 0) return null;
  const scenes: { narration: string; imagePrompt: string }[] = [];
  for (const s of r.scenes) {
    const item = s as { narration?: unknown; imagePrompt?: unknown };
    if (typeof item?.narration !== "string" || !item.narration.trim()) return null;
    scenes.push({
      narration: item.narration,
      imagePrompt:
        typeof item.imagePrompt === "string" && item.imagePrompt.trim()
          ? item.imagePrompt
          : `Cinematic scene illustrating: ${item.narration}`,
    });
  }
  const source: ScriptSource = r.source === "custom" || r.source === "edited" ? r.source : "ai";
  return { script: { title: typeof r.title === "string" ? r.title : "", scenes }, source };
}

// Roteiro enviado como texto corrido. Se o texto é igual ao do roteiro de base, vale o
// de base (cenas e imagens intactas). Se mudou: divide o texto em cenas SEM alterar
// nenhuma palavra, mantém a descrição de imagem das cenas cujo texto ficou idêntico
// ao de alguma cena de base e escreve descrição NOVA para as demais — a imagem sempre
// acompanha o texto que o cliente deixou.
async function prepareFromText(
  raw: { title?: unknown; source?: unknown; scenes?: unknown; text: string },
  duration: string,
  visualStyle: string,
  fallbackTitle: string,
): Promise<{ ok: true; approved: ApprovedScript } | { ok: false; error: string }> {
  const text = normalizeText(raw.text);
  if (!text) return { ok: false, error: "O roteiro está vazio. Escreva o texto ou clique em Voltar." };
  if (text.length > MAX_STORY_CHARS) return { ok: false, error: "O texto está muito longo para um vídeo desta duração." };

  const check = checkScriptWords(duration, countWords(text));
  if (!check) return { ok: false, error: "Duração inválida para o roteiro." };
  if (check.state !== "ok") return { ok: false, error: check.message ?? "O texto não cabe nesta duração." };

  const baseline: { narration: string; imagePrompt: string }[] = [];
  if (Array.isArray(raw.scenes)) {
    for (const s of raw.scenes) {
      const item = s as { narration?: unknown; imagePrompt?: unknown };
      if (typeof item?.narration === "string" && item.narration.trim()) {
        baseline.push({
          narration: normalizeText(item.narration),
          imagePrompt: typeof item.imagePrompt === "string" ? item.imagePrompt.trim() : "",
        });
      }
    }
  }
  const title = (typeof raw.title === "string" ? raw.title.trim() : "") || fallbackTitle || text.split(" ").slice(0, 6).join(" ");
  const baseSource: ScriptSource = raw.source === "custom" || baseline.length === 0 ? "custom" : "ai";

  // Texto idêntico ao de base: nada mudou.
  if (baseline.length > 0 && text === baseline.map((s) => s.narration).join(" ")) {
    return prepareApprovedScript({ title, source: baseSource, scenes: baseline }, duration, visualStyle, fallbackTitle);
  }

  // Cenas que o cliente não tocou ficam como estavam (com a imagem delas); o trecho
  // alterado é dividido de novo e ganha descrição de imagem nova.
  const aligned = alignToBaseline(text, baseline);
  const narrations = aligned.map((s) => s.narration);
  if (narrations.length < MIN_SCENES || narrations.length > MAX_SCENES) {
    return { ok: false, error: "Não foi possível dividir o texto em cenas. Revise a pontuação." };
  }
  const prompts: string[] = aligned.map((s) => s.imagePrompt ?? "");
  const indexes = prompts.flatMap((p, i) => (p ? [] : [i]));
  if (indexes.length > 0) {
    const written = await writeImagePrompts({
      title,
      narrations,
      indexes,
      existingPrompts: prompts,
      visualStyle,
    });
    for (const i of indexes) prompts[i] = written.get(i) ?? `Cinematic scene illustrating: ${narrations[i]}`;
  }

  const source: ScriptSource = baseSource === "custom" ? "custom" : "edited";
  const scenes = narrations.map((narration, i) => ({ narration, imagePrompt: prompts[i] }));
  return {
    ok: true,
    approved: { script: { title, scenes }, source, stored: { title, scenes, source } },
  };
}
