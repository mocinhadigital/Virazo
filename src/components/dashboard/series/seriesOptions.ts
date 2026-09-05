// As 2 faixas de duração da Etapa 6 do AutoShortz (medidas ao vivo: um
// <select> nativo com exatamente essas 2 opções, sem mais nem menos).
// `value` continua "30s"/"60s" de propósito — são as mesmas chaves reais
// que SCENES_PER_DURATION (src/lib/ai/script.ts) já usa pra decidir quantas
// cenas gerar; só o texto exibido mudou pra bater com a referência. "15s" e
// "90s" saem da lista de seleção, mas continuam suportados no backend pra
// não quebrar séries antigas que já usam esses valores.
export const SERIES_DURATIONS = [
  { value: "30s", label: "30 a 40 segundos" },
  { value: "60s", label: "60 a 70 segundos" },
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
// pra um destes 4 estilos). O texto do preview não é fixo por estilo — os 4
// mostram a mesma frase revelada palavra por palavra ("VOCÊ SABIA DISSO?",
// sincronizada entre os cards; ver CAPTION_PREVIEW_WORDS em SeriesWizard.tsx),
// só o `textTransform` de cada estilo muda como essa palavra aparece.
export const SERIES_CAPTION_STYLES = [
  {
    name: "Traço forte",
    textTransform: "uppercase" as const,
    color: "#ffffff",
    strokeColor: "#000000",
    strokeWidth: "2.81px",
  },
  {
    name: "Destaque vermelho",
    textTransform: "uppercase" as const,
    color: "#ff3b30",
    strokeColor: "#000000",
    strokeWidth: "3.13px",
  },
  {
    name: "Suave",
    textTransform: "uppercase" as const,
    color: "#ffffff",
    strokeColor: null,
    strokeWidth: "0px",
  },
  {
    name: "Impacto",
    textTransform: "lowercase" as const,
    color: "#ffffff",
    strokeColor: "#000000",
    strokeWidth: "3.75px",
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
