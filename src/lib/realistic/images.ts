import "server-only";
import { fal } from "@/lib/ai/fal";
import { realisticVisualPrompt } from "./constants";
import { describeError, retryTransient } from "./common";

type FalImagesOutput = { data: { images: { url: string }[] } };

const NO_TEXT = "No text, no letters, no words, no captions, no subtitles, no watermark, no logo.";

// Imagem fotorrealista de uma cena. Sempre SEM texto/legenda: a legenda é
// gravada só no final, pelo ffmpeg.
//
// `character` é a descrição fixa do personagem principal: é colada, igual, em
// toda cena em que ele aparece. Com `referenceUrl` (imagem de outra cena), o
// Nano Banana Edit reproduz a MESMA pessoa; sem referência, vale só o texto.
export async function generateRealisticImage(input: {
  imagePrompt: string;
  styleName: string;
  character?: string | null;
  referenceUrl?: string | null;
}): Promise<Buffer> {
  const { imagePrompt, styleName, character, referenceUrl } = input;
  const scene = character ? `${character}. ${imagePrompt}` : imagePrompt;
  const style = realisticVisualPrompt(styleName);

  let imageUrl: string | undefined;
  if (character && referenceUrl) {
    try {
      const result = (await retryTransient(() =>
        fal.subscribe("fal-ai/nano-banana/edit", {
          input: {
            prompt: `The person in the reference image is the main character. Keep EXACTLY the same person: identical face, age, hair, beard and clothing. Create a new photograph of this same person in a different scene: ${scene}. ${style}. Vertical 9:16 composition. ${NO_TEXT}`,
            image_urls: [referenceUrl],
            num_images: 1,
            aspect_ratio: "9:16",
            output_format: "jpeg",
          },
        }),
      )) as FalImagesOutput;
      imageUrl = result.data.images[0]?.url;
    } catch (err) {
      // Sem referência a cena ainda sai (com a mesma descrição do personagem).
      console.error("[realistic/images] referência falhou, usando só texto:", describeError(err));
    }
  }

  if (!imageUrl) {
    const result = (await retryTransient(() =>
      fal.subscribe("fal-ai/z-image/turbo", {
        input: {
          prompt: `${scene}. ${style}. Vertical 9:16 composition. ${NO_TEXT}`,
          image_size: "portrait_16_9",
          num_images: 1,
          output_format: "jpeg",
        },
      }),
    )) as FalImagesOutput;
    imageUrl = result.data.images[0]?.url;
  }
  if (!imageUrl) throw new Error("fal.ai não retornou nenhuma imagem.");

  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Falha ao baixar imagem gerada (${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}
