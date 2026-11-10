import "server-only";
import { fal } from "./fal";
import { trimWhiteBorders } from "./trimBorders";

type ZImageTurboOutput = {
  data: {
    images: { url: string }[];
  };
};

// Estilos com instrução própria de imagem. Os demais estilos continuam usando
// só o nome ("estilo visual: <nome>"), exatamente como antes.
export const CINEMATIC_STYLE_NAME = "Cinematográfico";
const STYLE_PROMPTS: Record<string, string> = {
  [CINEMATIC_STYLE_NAME]:
    "ultra photorealistic cinematic film still, shot on 35mm anamorphic lens, epic landscape and real-world scene, dramatic natural lighting, golden hour or moody atmosphere, rich color grading, shallow depth of field, subtle film grain, high detail, full-bleed vertical 9:16 composition filling the entire frame edge to edge, single continuous photograph, not a collage, no split screen, no panels, no border, no white frame, no margin, no letterbox, no text, no watermark",
};

export async function generateSceneImage(imagePrompt: string, visualStyle: string): Promise<Buffer> {
  const image = await requestSceneImage(imagePrompt, visualStyle);
  // Só o estilo Cinematográfico exige tela cheia: tira moldura branca e, se
  // ela for grande demais (cortar deformaria a cena), gera de novo (1x).
  if (visualStyle !== CINEMATIC_STYLE_NAME) return image;
  const first = await trimWhiteBorders(image);
  if (first.removedFraction <= 0.2) return first.image;
  const second = await trimWhiteBorders(await requestSceneImage(imagePrompt, visualStyle));
  return second.removedFraction < first.removedFraction ? second.image : first.image;
}

// Palavras de enquadramento horizontal ("wide", "panoramic"...) num quadro
// vertical fazem o gerador empilhar várias faixas da mesma cena (colagem).
// No estilo Cinematográfico elas são trocadas por composição vertical.
function toVerticalPrompt(imagePrompt: string): string {
  const cleaned = imagePrompt
    .replace(/\b(ultra[- ]wide|wide[- ]angle|wide|panoramic|panorama|sweeping|establishing|expansive|endless|horizontal|landscape[- ]orientation|triptych|collage|split[- ]screen|multiple panels?)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return `Tall vertical portrait-orientation composition, ONE single photograph filling the whole frame: ${cleaned}`;
}

async function requestSceneImage(imagePrompt: string, visualStyle: string): Promise<Buffer> {
  if (visualStyle === CINEMATIC_STYLE_NAME) imagePrompt = toVerticalPrompt(imagePrompt);
  // LOG TEMPORÁRIO — remover depois de descobrir o problema do saldo do fal.ai.
  const rawKey = process.env.FAL_KEY ?? "";
  console.log(
    "[Virazo debug] FAL_KEY usada nesta chamada:",
    rawKey.slice(0, 4) + "..." + rawKey.slice(-4),
    "| tamanho:",
    rawKey.length,
  );

  const result = (await fal.subscribe("fal-ai/z-image/turbo", {
    input: {
      prompt: STYLE_PROMPTS[visualStyle]
        ? `${imagePrompt}, ${STYLE_PROMPTS[visualStyle]}`
        : `${imagePrompt}, estilo visual: ${visualStyle}`,
      image_size: "portrait_16_9",
      num_images: 1,
      output_format: "jpeg",
    },
  })) as ZImageTurboOutput;

  const imageUrl = result.data.images[0]?.url;
  if (!imageUrl) {
    throw new Error("fal.ai não retornou nenhuma imagem.");
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Falha ao baixar imagem gerada (${response.status}).`);
  }
  return Buffer.from(await response.arrayBuffer());
}
