import "server-only";
import { fal } from "@/lib/ai/fal";
import { isTransientError } from "./common";

const KLING_MODEL = "fal-ai/kling-video/v2.5-turbo/standard/image-to-video";

type KlingOutput = { data: { video?: { url?: string } } };

// Envia UMA imagem à fila do fal.ai (Kling 2.5 turbo, clipe de 5s) e devolve
// na hora o id do pedido. Quem espera o resultado é advance.ts, em chamadas
// curtas — assim a espera da fila do fal.ai não conta no limite da função.
export async function submitAnimation(imageUrl: string, motionPrompt: string): Promise<string> {
  const { request_id } = await fal.queue.submit(KLING_MODEL, {
    input: {
      prompt: motionPrompt,
      image_url: imageUrl,
      duration: "5",
      negative_prompt: "blur, distort, low quality, cartoon, drawing, text, subtitles, watermark",
    },
  });
  return request_id;
}

export type AnimationCheck =
  | { state: "pending" }
  | { state: "done"; videoUrl: string }
  | { state: "failed"; message: string };

// Consulta um pedido da fila. Erro de rede/servidor na consulta conta como
// "ainda pendente" (tenta de novo no próximo ciclo); só o resultado final
// com erro conta como falha da cena.
export async function checkAnimation(requestId: string): Promise<AnimationCheck> {
  let completed = false;
  try {
    const status = await fal.queue.status(KLING_MODEL, { requestId });
    completed = status.status === "COMPLETED";
  } catch (err) {
    console.warn("[realistic/animate] consulta de status falhou (tenta de novo):", err);
    return { state: "pending" };
  }
  if (!completed) return { state: "pending" };

  try {
    const result = (await fal.queue.result(KLING_MODEL, { requestId })) as KlingOutput;
    const videoUrl = result.data.video?.url;
    if (!videoUrl) return { state: "failed", message: "fal.ai não retornou o clipe animado." };
    return { state: "done", videoUrl };
  } catch (err) {
    // Rede instável ao buscar o resultado não é falha da cena: tenta no próximo ciclo.
    if (isTransientError(err) && !(err instanceof Error && /timeout|timed out/i.test(err.message) && !/fetch failed/i.test(err.message))) {
      return { state: "pending" };
    }
    return { state: "failed", message: err instanceof Error ? err.message : "A animação falhou." };
  }
}
