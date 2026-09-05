// Nomes, ordem e imagens espelham exatamente a Etapa 4 do AutoShortz —
// medidos e reaproveitados (reuso de asset autorizado pelo dono de ambos
// os produtos). Os nomes antigos (Anime, Comic, Cartoon 3D etc.) saem da
// lista selecionável, mas séries já criadas com eles continuam funcionando
// normalmente: `visual_style` é só uma string livre passada pro prompt de
// geração de imagem (generateSceneImage), não uma chave fixa.
export const VISUAL_STYLES = [
  { name: "Scary story", thumbnail: "/images/visual-styles/scary_story.jpg" },
  { name: "Medieval", thumbnail: "/images/visual-styles/medieval.jpg" },
  { name: "Pixel art", thumbnail: "/images/visual-styles/pixel_art.jpg" },
  { name: "Storytime", thumbnail: "/images/visual-styles/storytime.jpg" },
  { name: "Xilogravura", thumbnail: "/images/visual-styles/xilogravura.jpg" },
  { name: "Graphic novel", thumbnail: "/images/visual-styles/graphic_novel.jpg" },
  { name: "Animação 3D", thumbnail: "/images/visual-styles/animacao_3d.jpg" },
  { name: "Polaroid", thumbnail: "/images/visual-styles/polaroid.jpg" },
  { name: "Astrofotografia", thumbnail: "/images/visual-styles/astrofotografia.jpg" },
];
