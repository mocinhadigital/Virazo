// Memória de uma série: o que os episódios anteriores já contaram.
//
// Antes, o gerador só recebia os TÍTULOS dos últimos vídeos — e o título de um
// episódio é sempre "nome da série — data", então a IA não tinha como saber o
// que já tinha sido contado e repetia o mesmo episódio. Agora cada episódio
// guarda o roteiro (videos.script / realistic_videos.script) e o próximo recebe
// o que foi narrado, o número do episódio e a ordem de não repetir.
// Usado pelas séries normais (generate.ts) e pelas realistas (pipeline.ts).

export type PastEpisode = {
  title: string;
  // Texto narrado do episódio; null nos episódios antigos, gerados antes de o
  // roteiro passar a ser guardado.
  narration: string | null;
};

// Os 2 últimos episódios entram quase por inteiro (é onde uma história
// contínua precisa continuar); os mais antigos, resumidos.
const FULL_NARRATION_CHARS = 700;
const SHORT_NARRATION_CHARS = 260;
const FULL_EPISODES = 2;

// Nicho curto ("Medieval") é uma categoria; nicho longo é uma descrição de
// cena escrita pelo cliente — que não pode virar o conteúdo de TODO episódio.
const NICHO_CATEGORY_MAX_CHARS = 80;
const NICHO_DESCRIPTION_MAX_CHARS = 400;

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
}

// Texto narrado de um roteiro (série normal ou realista: ambos têm
// scenes[].narration). null se não há roteiro guardado.
export function extractNarration(script: unknown): string | null {
  if (!script || typeof script !== "object") return null;
  const scenes = (script as { scenes?: unknown }).scenes;
  if (!Array.isArray(scenes)) return null;
  const text = scenes
    .map((s) => (s && typeof (s as { narration?: unknown }).narration === "string" ? (s as { narration: string }).narration.trim() : ""))
    .filter(Boolean)
    .join(" ");
  return text || null;
}

// Linha do banco (título + roteiro) → episódio anterior. Prefere o título do
// roteiro (o que a IA deu ao episódio) ao título da linha ("série — data").
export function toPastEpisode(row: { title: string; script?: unknown }): PastEpisode {
  const scriptTitle =
    row.script && typeof row.script === "object" && typeof (row.script as { title?: unknown }).title === "string"
      ? ((row.script as { title: string }).title.trim())
      : "";
  return { title: scriptTitle || row.title, narration: extractNarration(row.script) };
}

// Como o "nicho" entra na instrução: categoria de tom (curto) ou ambientação
// (longo). Nunca como o acontecimento do episódio.
export function describeNicho(nicho: string): string {
  const text = nicho.replace(/\s+/g, " ").trim();
  if (text.length <= NICHO_CATEGORY_MAX_CHARS) {
    return `A categoria "${text}" define apenas o tom/estética da narrativa, nunca o assunto.`;
  }
  return `O cliente descreveu o mundo e o clima da série assim: "${clip(text, NICHO_DESCRIPTION_MAX_CHARS)}". Use isso só como ambientação, estilo visual e tom — NÃO é o acontecimento do episódio: cada episódio mostra algo NOVO e nunca repete essa mesma cena.`;
}

// Bloco de instrução com a memória da série. `past` vem do mais recente para o
// mais antigo; `episodeNumber` é o número DESTE episódio (já contando os
// anteriores). Vazio no primeiro episódio.
export function buildSeriesMemory(input: { episodeNumber: number; past: PastEpisode[] }): string {
  const { episodeNumber, past } = input;
  if (episodeNumber <= 1) return "";

  const lines: string[] = [`CONTINUIDADE DA SÉRIE: este é o EPISÓDIO ${episodeNumber} desta série.`];

  const known = past.map((ep, i) => ({ ep, number: episodeNumber - 1 - i })).filter((x) => x.ep.narration);
  if (known.length > 0) {
    lines.push("O que os episódios anteriores já contaram (do mais recente para o mais antigo):");
    known.forEach(({ ep, number }, i) => {
      const max = i < FULL_EPISODES ? FULL_NARRATION_CHARS : SHORT_NARRATION_CHARS;
      lines.push(`- Episódio ${number} — "${ep.title}": ${clip(ep.narration as string, max)}`);
    });
  }

  const unknownCount = Math.max(0, episodeNumber - 1 - known.length);
  if (unknownCount > 0) {
    lines.push(
      `Existem ${unknownCount} episódio(s) anterior(es) cujo conteúdo não foi registrado e que podem ter repetido a mesma ideia: por isso fuja do caminho mais óbvio e escolha uma ideia claramente nova.`,
    );
  }

  lines.push(
    `REGRAS DO EPISÓDIO ${episodeNumber}:`,
    "1. Ele precisa ser DIFERENTE de todos os anteriores: outro fato, outro momento ou outra reviravolta. Nunca recontar, resumir ou parafrasear algo já contado, e abrir com um gancho/cena diferente das aberturas anteriores.",
    "2. Se a série conta uma história contínua (personagens, enredo), continue do ponto exato em que o último episódio parou e faça a trama AVANÇAR. Se for de curiosidades ou temas soltos, traga um fato ou tema novo dentro do assunto central.",
    "3. Mantenha o assunto central, o tom e o estilo visual da série.",
    "4. O número do episódio é só para você se orientar: NÃO diga \"episódio\" nem o número na narração e não escreva isso no título.",
  );
  return lines.join("\n");
}
