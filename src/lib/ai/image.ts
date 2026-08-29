import "server-only";
import { fal } from "./fal";

type ZImageTurboOutput = {
  data: {
    images: { url: string }[];
  };
};

export async function generateSceneImage(imagePrompt: string, visualStyle: string): Promise<Buffer> {
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
      prompt: `${imagePrompt}, estilo visual: ${visualStyle}`,
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
