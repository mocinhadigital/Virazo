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

// Nomes/descrições espelham o catálogo do AutoShortz. "Heitor" (masculina,
// sussurrada/terror) existe na referência mas fica de fora até termos uma
// voice_id real e distinta pra ele em src/lib/ai/narration.ts — não dá pra
// listar uma voz cujo áudio real não existe.
export const SERIES_VOICES = [
  {
    name: "Rafael",
    gender: "Masculina",
    description: "Grave e contido, feito para narração de suspense.",
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

export const SERIES_CAPTION_STYLES = ["Clássica", "Destaque", "Minimalista"];

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
