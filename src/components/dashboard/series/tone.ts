// Tom de voz sugerido a partir do tema da série. Sem isto, toda série nascia "Motivacional"
// (o primeiro da lista), mesmo sendo de terror. Arquivo puro (sem imports): usado pelo criador de
// séries e testável sozinho.
export const DEFAULT_TONE = "Storytelling";

// Os temas prontos do criador de séries (nomes exatos) e o tom que combina com cada um.
const TONE_BY_PRESET: Record<string, string> = {
  Medieval: "Épico",
  Terror: "Suspense",
  "True crime": "Suspense",
  Mitologia: "Épico",
  "E se...": "Curiosidades",
  "Histórias bíblicas": "Storytelling",
  "Espaço e universo": "Curiosidades",
  Estoicismo: "Reflexivo",
};

// Tema escrito à mão: adivinha pelas palavras. A ordem importa (o mais específico primeiro).
const RULES: { tone: string; pattern: RegExp }[] = [
  { tone: "Suspense", pattern: /terror|mist[eé]rio|assombr|horror|medo|sombri|macabr|sobrenatural|true crime|crime|assassin|fantasma|lenda urbana|paranormal|serial killer/ },
  { tone: "Humor", pattern: /humor|com[eé]dia|piada|engra[cç]ad|meme/ },
  { tone: "Bem-estar", pattern: /bem-estar|sa[uú]de|medita|relax|yoga|mindful|autocuidado|ansiedade/ },
  { tone: "Produto", pattern: /produto|venda|loja|oferta|afiliad|comprar/ },
  { tone: "Épico", pattern: /medieval|mitolog|guerra|reino|viking|gladiador|imp[eé]rio|cavaleir|lend[ae]s? antig/ },
  { tone: "Reflexivo", pattern: /estoic|filosof|reflex|sabedoria|autoconhec/ },
  { tone: "Motivacional", pattern: /motiva|supera|disciplina|sucesso|mentalidade|lideran|empreend|h[aá]bito/ },
  { tone: "Curiosidades", pattern: /curiosidade|fatos|voc[eê] sabia|ci[eê]ncia|espa[cç]o|universo|cosmos/ },
];

export function suggestTone(nicho: string): string {
  const text = nicho.trim();
  if (!text) return DEFAULT_TONE;
  if (TONE_BY_PRESET[text]) return TONE_BY_PRESET[text];
  const lower = text.toLowerCase();
  return RULES.find((r) => r.pattern.test(lower))?.tone ?? DEFAULT_TONE;
}
