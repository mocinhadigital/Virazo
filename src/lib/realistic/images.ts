import "server-only";
import { fal } from "@/lib/ai/fal";
import { realisticVisualPrompt } from "./constants";

type ZImageTurboOutput = { data: { images: { url: string }[] } };

// Imagem fotorrealista de uma cena. Sempre SEM texto/legenda: a legenda é
// gravada só no final, pelo ffmpeg.
export async function generateRealisticImage(imagePrompt: string, styleName: string): Promise<Buffer> {
  const prompt = `${imagePrompt}. ${realisticVisualPrompt(styleName)}. Vertical 9:16 composition. No text, no letters, no words, no captions, no subtitles, no watermark, no logo.`;

  const result = (await fal.subscribe("fal-ai/z-image/turbo", {
    input: {
      prompt,
      image_size: "portrait_16_9",
      num_images: 1,
      output_format: "jpeg",
    },
  })) as ZImageTurboOutput;

  const imageUrl = result.data.images[0]?.url;
  if (!imageUrl) throw new Error("fal.ai não retornou nenhuma imagem.");

  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Falha ao baixar imagem gerada (${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}
