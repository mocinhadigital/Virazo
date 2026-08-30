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

export const SERIES_VOICES = [
  { name: "Ana", tag: "Feminina · Natural" },
  { name: "Lucas", tag: "Masculina · Confiante" },
  { name: "Sofia", tag: "Feminina · Jovem" },
  { name: "Marcos", tag: "Masculina · Grave" },
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
  { value: "pt", label: "Português" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
];
