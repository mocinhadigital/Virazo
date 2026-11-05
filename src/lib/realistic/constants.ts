// Constantes do Vídeo Realista ✨ — sem "server-only": o wizard (navegador)
// usa as mesmas listas e preços que o servidor.

export const REALISTIC_CLIP_SECONDS = 5;

// Duração do vídeo: 30s = 6 cenas de 5s (1 crédito); 60s = 12 cenas (2 créditos).
export type RealisticDuration = 30 | 60;

export const REALISTIC_DURATIONS: {
  seconds: RealisticDuration;
  scenes: number;
  credits: number;
  label: string;
}[] = [
  { seconds: 30, scenes: 6, credits: 1, label: "30 segundos (1 crédito)" },
  { seconds: 60, scenes: 12, credits: 2, label: "60 segundos (2 créditos)" },
];

export function isRealisticDuration(value: unknown): value is RealisticDuration {
  return value === 30 || value === 60;
}

export function realisticSceneCount(seconds: number): number {
  return seconds === 60 ? 12 : 6;
}

export function realisticCreditCost(seconds: number): number {
  return seconds === 60 ? 2 : 1;
}

// Converte "30s"/"60s" (formato da série) em duração realista.
export function realisticDurationFromLabel(label: string | null | undefined): RealisticDuration {
  return label === "60s" ? 60 : 30;
}
// Trocas de imagem gratuitas na prévia das cenas.
export const REALISTIC_MAX_IMAGE_SWAPS = 3;
// Roteiros gratuitos por rascunho (escrever de novo / outro roteiro). Limite
// só para o custo de IA não ficar aberto; o cliente raramente chega perto.
export const REALISTIC_MAX_SCRIPT_GENERATIONS = 6;

export type RealisticLanguage = "pt" | "en" | "es";

export const REALISTIC_LANGUAGES: { value: RealisticLanguage; label: string }[] = [
  { value: "pt", label: "🇧🇷 Português (Brasil)" },
  { value: "en", label: "🇺🇸 English (US)" },
  { value: "es", label: "🇪🇸 Español" },
];

// Os 3 estilos realistas. O `visualPrompt` entra no prompt de TODAS as imagens
// (fotorrealismo, nada de desenho/quadrinho/3D).
export const REALISTIC_STYLES = [
  {
    name: "Cinematográfico",
    description: "Cara de filme: luz dramática, lente de cinema, cores marcantes.",
    visualPrompt:
      "ultra photorealistic cinematic film still, shot on 35mm anamorphic lens, dramatic cinematic lighting, shallow depth of field, rich color grading, real people and real places, natural skin texture, film grain",
  },
  {
    name: "Documentário",
    description: "Visual natural e real, como uma reportagem ou documentário.",
    visualPrompt:
      "ultra photorealistic documentary photograph, natural available light, handheld realistic look, authentic real people and real locations, true-to-life colors, sharp detail, candid moment",
  },
  {
    name: "Suspense/Noturno",
    description: "Noite, sombras e tensão — ideal para mistério e terror.",
    visualPrompt:
      "ultra photorealistic cinematic night scene, moody low-key lighting, deep shadows, fog and atmosphere, suspenseful thriller film still, real people and real places, natural skin texture",
  },
] as const;

export type RealisticStyleName = (typeof REALISTIC_STYLES)[number]["name"];

export const DEFAULT_REALISTIC_STYLE: RealisticStyleName = "Cinematográfico";

export function isRealisticStyle(name: string): name is RealisticStyleName {
  return REALISTIC_STYLES.some((s) => s.name === name);
}

export function realisticVisualPrompt(name: string): string {
  return (REALISTIC_STYLES.find((s) => s.name === name) ?? REALISTIC_STYLES[0]).visualPrompt;
}

// Pacotes de pagamento único (Cakto). Os ids/links dos produtos ficam em
// variáveis de ambiente (ver src/lib/billing/realisticPackages.ts).
export type RealisticPackageKey = "10" | "20";

export const REALISTIC_PACKAGES: {
  key: RealisticPackageKey;
  credits: number;
  priceCents: number;
  label: string;
  featured: boolean;
}[] = [
  { key: "10", credits: 10, priceCents: 14700, label: "10 vídeos realistas", featured: false },
  { key: "20", credits: 20, priceCents: 24700, label: "20 vídeos realistas", featured: true },
];

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
}

// Estado do vídeo realista como a tela enxerga.
export type RealisticScript = {
  title: string;
  scenes: { narration: string; imagePrompt: string; motionPrompt: string }[];
};

export type RealisticVideoStatus = "Rascunho" | "Processando" | "Pronto" | "Erro";

export type RealisticVideoRecord = {
  id: string;
  seriesId: string | null;
  mode: "guided" | "free" | "series";
  title: string;
  topic: string;
  language: RealisticLanguage;
  realisticStyle: string;
  durationSeconds: RealisticDuration;
  creditCost: number;
  voice: string | null;
  captionsEnabled: boolean;
  captionStyle: string | null;
  backgroundMusicId: string | null;
  script: RealisticScript | null;
  // URLs públicas das imagens da prévia (mesma ordem das cenas).
  sceneImageUrls: string[];
  scriptGenerations: number;
  swapsUsed: number;
  status: RealisticVideoStatus;
  creditRefunded: boolean;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  errorMessage: string | null;
  progressStage: string | null;
  progressCurrent: number | null;
  progressTotal: number | null;
  startedAtIso: string;
  createdAtIso: string;
};
