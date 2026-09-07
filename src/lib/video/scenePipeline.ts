import "server-only";
import type { Script } from "@/lib/ai/script";
import { synthesizeNarration } from "@/lib/ai/narration";
import { generateSceneImage } from "@/lib/ai/image";
import { transcribeForCaptions } from "@/lib/ai/captions";
import type { RenderScene } from "@/lib/video/render";

// Monta as cenas de um vídeo a partir do roteiro. A narração (ElevenLabs) roda
// UMA cena de cada vez — nunca mais de 1 chamada TTS simultânea por vídeo —
// porque um vídeo de 30s+ sozinho já tem 5-12 cenas, e disparar todas de uma
// vez (como antes) estourava o limite de concorrência da conta inteira. A
// imagem (fal.ai, provedor sem esse limite) continua em paralelo entre todas
// as cenas, pra não perder velocidade à toa nessa etapa.
//
// Usada pelos 3 fluxos que geram vídeo (série, manual, retry) — extraído pra
// não repetir esta mesma lógica 3 vezes e arriscar ela divergir entre eles.
export async function buildRenderScenes(
  script: Script,
  voice: string,
  visualStyle: string,
  language: "pt" | "en" | "es" = "pt",
): Promise<RenderScene[]> {
  const imagePromises = script.scenes.map((scene) => generateSceneImage(scene.imagePrompt, visualStyle));

  const renderScenes: RenderScene[] = [];
  for (let i = 0; i < script.scenes.length; i++) {
    const scene = script.scenes[i];
    const audio = await synthesizeNarration(scene.narration, voice);
    const image = await imagePromises[i];
    const transcript = await transcribeForCaptions(audio, "narration.mp3", language);
    renderScenes.push({
      image,
      audio,
      durationSeconds: transcript.durationSeconds,
      words: transcript.words,
    });
  }
  return renderScenes;
}
