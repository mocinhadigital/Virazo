// Opções de formulário específicas de Séries. Duração e voz espelham as
// mesmas listas usadas em CreateVideoWizard.tsx (não exportadas de lá pra
// não tocar naquele arquivo) — mantenha as duas em sincronia se adicionar
// uma nova duração/voz no wizard manual.
export const SERIES_DURATIONS = [
  { value: "15s", label: "Rápido e direto" },
  { value: "30s", label: "Ideal para Reels/TikTok" },
  { value: "60s", label: "Mais contexto" },
  { value: "90s", label: "Storytelling completo" },
];

// Nomes/descrições espelham o catálogo do AutoShortz.
//
// "Heitor" ainda não tem voice_id real de TTS testado nesta conta
// ElevenLabs (busca por "Heitor" não retorna nada exato, só "Hector" em
// outros idiomas) — por isso `ttsPending: true`. O preview dele usa um
// áudio de amostra reaproveitado do próprio AutoShortz (asset público,
// reuso autorizado pelo dono de ambos os produtos), servido localmente em
// public/audio/voice-previews/heitor.mp3 — é só uma prévia gravada, não
// tem qualquer ligação com o pipeline real de geração de narração.
// `synthesizeNarration` (src/lib/ai/narration.ts) não tem entrada pra
// "Heitor", e a criação de série em src/app/api/series/route.ts rejeita
// explicitamente essa voz — não existe fallback silencioso pra outra voz.
export const SERIES_VOICES = [
  {
    name: "Rafael",
    gender: "Masculina",
    description: "Grave e contido, feito para narração de suspense.",
  },
  {
    name: "Heitor",
    gender: "Masculina",
    description: "Sussurrado e próximo, arrepia em terror e folclore.",
    previewSrc: "/audio/voice-previews/heitor.mp3",
    ttsPending: true,
  },
  {
    name: "Vicente",
    gender: "Masculina",
    description: "Narrador preciso, tom de documentário para true crime.",
  },
  {
    name: "Bianca",
    gender: "Feminina",
    description: "Tom de suspense, feita para terror e true crime.",
  },
  {
    name: "Clara",
    gender: "Feminina",
    description: "Viva e expressiva, boa para e se e espaço.",
  },
];

// Estrutura e valores (cor, contorno, caixa) medidos ao vivo no preview de
// cada card da Etapa 5 do AutoShortz. "Sem legenda" não entra nesta lista —
// é tratado à parte no wizard (desliga captionsEnabled em vez de apontar
// pra um destes 4 estilos).
export const SERIES_CAPTION_STYLES = [
  {
    name: "Traço forte",
    previewText: "VOCÊ",
    textTransform: "uppercase" as const,
    color: "#ffffff",
    strokeColor: "#000000",
    strokeWidth: "3px",
  },
  {
    name: "Destaque vermelho",
    previewText: "VOCÊ",
    textTransform: "uppercase" as const,
    color: "#ff3b30",
    strokeColor: "#000000",
    strokeWidth: "3px",
  },
  {
    name: "Suave",
    previewText: "VOCÊ",
    textTransform: "uppercase" as const,
    color: "#ffffff",
    strokeColor: null,
    strokeWidth: "0px",
  },
  {
    name: "Impacto",
    previewText: "você",
    textTransform: "lowercase" as const,
    color: "#ffffff",
    strokeColor: "#000000",
    strokeWidth: "4px",
  },
];

// Só sugestões — o campo Nicho no formulário de Série é um combobox livre,
// o usuário nunca fica preso a esta lista.
export const NICHO_SUGESTOES = [
  "Fé e Cristianismo",
  "Histórias Bíblicas",
  "Orações e Devocionais",
  "Curiosidades históricas",
  "Motivação diária",
  "Fatos de ciência",
  "Mitologia e lendas",
  "Finanças pessoais",
  "Empreendedorismo",
  "Inteligência artificial",
  "Tecnologia",
  "Saúde e bem-estar",
  "Receitas rápidas",
  "Terror e mistério",
  "Relacionamentos",
  "Desenvolvimento pessoal",
  "Direito",
  "Futebol",
  "Curiosidades gerais",
];

export const FREQUENCIA_OPTIONS = [
  { value: 1, label: "Todos os dias" },
  { value: 2, label: "A cada 2 dias" },
  { value: 3, label: "A cada 3 dias" },
  { value: 7, label: "Semanal" },
];

export const IDIOMA_OPTIONS = [
  { value: "pt", label: "🇧🇷 Português (Brasil)" },
  { value: "en", label: "🇺🇸 English (US)" },
  { value: "es", label: "🇪🇸 Español" },
];
