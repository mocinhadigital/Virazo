import { countWords } from "./limits";

// Divide a história do cliente em cenas de ~8 palavras SEM mudar nenhuma palavra
// (ordem e texto idênticos; só onde cada cena começa e termina). Sem IA: quem cria
// a descrição da imagem de cada cena é outra etapa.
const TARGET_MAX = 10; // junta frases curtas até aqui
const SCENE_HARD_MAX = 12; // acima disso a frase é cortada
const PIECE_TARGET = 9;

function sentencesOf(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?…])\s+/)
    .filter(Boolean);
}

// Quebra uma frase longa em pedaços de até ~9 palavras, preferindo as vírgulas.
function cutLongSentence(sentence: string): string[] {
  const parts = sentence.split(/(?<=[,;:])\s+/).filter(Boolean);
  const pieces: string[] = [];
  let current = "";
  const push = () => {
    if (current) pieces.push(current);
    current = "";
  };
  for (const part of parts) {
    const n = countWords(part);
    if (n > SCENE_HARD_MAX) {
      push();
      const words = part.split(/\s+/);
      const chunks = Math.ceil(words.length / PIECE_TARGET);
      const size = Math.ceil(words.length / chunks);
      for (let i = 0; i < words.length; i += size) pieces.push(words.slice(i, i + size).join(" "));
      continue;
    }
    if (current && countWords(current) + n > TARGET_MAX) push();
    current = current ? `${current} ${part}` : part;
  }
  push();
  return pieces;
}

export function splitStoryIntoScenes(text: string): string[] {
  const units: string[] = [];
  for (const sentence of sentencesOf(text)) {
    if (countWords(sentence) > SCENE_HARD_MAX) units.push(...cutLongSentence(sentence));
    else units.push(sentence);
  }

  const scenes: string[] = [];
  let current = "";
  for (const unit of units) {
    if (!current) {
      current = unit;
      continue;
    }
    const total = countWords(current) + countWords(unit);
    // Cena ainda curta (< 7 palavras): junta com a próxima se não passar do teto.
    if (countWords(current) < 7 && total <= SCENE_HARD_MAX) current = `${current} ${unit}`;
    else if (total <= TARGET_MAX - 1 && countWords(current) < 8) current = `${current} ${unit}`;
    else {
      scenes.push(current);
      current = unit;
    }
  }
  if (current) {
    // Sobra curtinha no fim: cola na última cena em vez de virar uma cena de 2 palavras.
    if (countWords(current) < 4 && scenes.length > 0 && countWords(scenes[scenes.length - 1]) + countWords(current) <= SCENE_HARD_MAX + 3) {
      scenes[scenes.length - 1] = `${scenes[scenes.length - 1]} ${current}`;
    } else scenes.push(current);
  }

  // Cenas muito curtas (< 5 palavras) grudam na vizinha se couberem juntas.
  for (let i = 0; i < scenes.length && scenes.length > 1; ) {
    if (countWords(scenes[i]) >= 5) {
      i++;
      continue;
    }
    const prev = i > 0 ? countWords(scenes[i - 1]) : Infinity;
    const next = i < scenes.length - 1 ? countWords(scenes[i + 1]) : Infinity;
    const here = countWords(scenes[i]);
    if (i > 0 && prev + here <= SCENE_HARD_MAX && prev <= next) {
      scenes[i - 1] = `${scenes[i - 1]} ${scenes[i]}`;
      scenes.splice(i, 1);
    } else if (i < scenes.length - 1 && next + here <= SCENE_HARD_MAX) {
      scenes[i + 1] = `${scenes[i]} ${scenes[i + 1]}`;
      scenes.splice(i, 1);
    } else i++;
  }
  return scenes;
}

// Alinha o texto editado ao roteiro de base: as cenas cujo texto continua exatamente
// igual (nas mesmas fronteiras) ficam como estavam, com a descrição de imagem delas;
// só o trecho que o cliente mexeu é dividido de novo e fica com `imagePrompt: null`
// (a imagem dessas cenas é escrita de novo a partir do texto novo).
export function alignToBaseline(
  text: string,
  baseline: { narration: string; imagePrompt: string }[],
): { narration: string; imagePrompt: string | null }[] {
  const out: { narration: string; imagePrompt: string | null }[] = [];
  let rest = text.replace(/\s+/g, " ").trim();
  let bi = 0;

  // A cena de base começa na posição `at` de `rest` e termina numa fronteira de palavra?
  const matchesAt = (s: string, at: number, scene: string) =>
    s.startsWith(scene, at) && (at === 0 || s[at - 1] === " ") && (at + scene.length === s.length || s[at + scene.length] === " ");

  while (rest.length > 0) {
    if (bi < baseline.length && baseline[bi].narration && matchesAt(rest, 0, baseline[bi].narration)) {
      out.push({ narration: baseline[bi].narration, imagePrompt: baseline[bi].imagePrompt || null });
      rest = rest.slice(baseline[bi].narration.length).trim();
      bi++;
      continue;
    }
    // O cliente apagou uma ou mais cenas: o texto já recomeça numa cena de base mais adiante.
    let jumped = false;
    for (let j = bi + 1; j < baseline.length; j++) {
      if (baseline[j].narration && matchesAt(rest, 0, baseline[j].narration)) {
        out.push({ narration: baseline[j].narration, imagePrompt: baseline[j].imagePrompt || null });
        rest = rest.slice(baseline[j].narration.length).trim();
        bi = j + 1;
        jumped = true;
        break;
      }
    }
    if (jumped) continue;

    // Trecho alterado: vai até a próxima cena de base que ainda aparece mais adiante.
    let cut = -1;
    let next = -1;
    for (let j = bi; j < baseline.length; j++) {
      const scene = baseline[j].narration;
      if (!scene) continue;
      let from = 1;
      while (from <= rest.length) {
        const idx = rest.indexOf(scene, from);
        if (idx < 0) break;
        if (matchesAt(rest, idx, scene)) {
          if (cut === -1 || idx < cut) {
            cut = idx;
            next = j;
          }
          break;
        }
        from = idx + 1;
      }
    }
    const chunk = cut === -1 ? rest : rest.slice(0, cut).trim();
    for (const narration of splitStoryIntoScenes(chunk)) out.push({ narration, imagePrompt: null });
    rest = cut === -1 ? "" : rest.slice(cut).trim();
    if (next >= 0) bi = next;
  }
  return out;
}
