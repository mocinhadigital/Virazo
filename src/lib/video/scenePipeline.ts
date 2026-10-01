import "server-only";
import type { Script } from "@/lib/ai/script";
import { synthesizeNarration } from "@/lib/ai/narration";
import { generateSceneImage } from "@/lib/ai/image";
import { transcribeForCaptions, type Transcript } from "@/lib/ai/captions";
import type { RenderScene } from "@/lib/video/render";
import type { ReportProgress } from "@/lib/video/generateAssets";

// Monta as cenas de um vídeo a partir do roteiro. A narração (ElevenLabs) roda
// UMA cena de cada vez — nunca mais de 1 chamada TTS simultânea por vídeo —
// porque um vídeo de 30s+ sozinho já tem 5-12 cenas, e disparar todas de uma
// vez (como antes) estourava o limite de concorrência da conta inteira. A
// imagem (fal.ai, provedor sem esse limite) continua em paralelo entre todas
// as cenas, pra não perder velocidade à toa nessa etapa.
//
// A transcrição (Groq, para a legenda) também não espera mais em fila: a da
// cena N roda enquanto a narração da cena N+1 é gerada. Antes cada cena
// esperava a própria transcrição antes de começar a próxima narração — num
// vídeo de 60s (8 cenas) isso era tempo morto somado ao limite de 300s.
//
// Usada pelos 3 fluxos que geram vídeo (série, manual, retry) — extraído pra
// não repetir esta mesma lógica 3 vezes e arriscar ela divergir entre eles.
export async function buildRenderScenes(
  script: Script,
  voice: string,
  visualStyle: string,
  language: "pt" | "en" | "es" = "pt",
  report?: ReportProgress,
): Promise<RenderScene[]> {
  const total = script.scenes.length;

  // A primeira falha de qualquer tarefa paralela interrompe o loop de
  // narração na próxima cena — sem isso, uma imagem que falhou logo no
  // começo só seria percebida depois de pagar a narração de todas as cenas.
  let firstError: unknown;
  let imagesDone = 0;
  const track = <T>(promise: Promise<T>): Promise<T> => {
    promise.catch((err) => {
      firstError ??= err;
    });
    return promise;
  };

  const imagePromises = script.scenes.map((scene) =>
    track(
      generateSceneImage(scene.imagePrompt, visualStyle).then((image) => {
        imagesDone++;
        return image;
      }),
    ),
  );

  const audios: Buffer[] = [];
  const transcriptPromises: Promise<Transcript>[] = [];
  for (let i = 0; i < total; i++) {
    if (firstError) throw firstError;
    await report?.("voz", i + 1, total);
    const audio = await synthesizeNarration(script.scenes[i].narration, voice);
    audios.push(audio);
    transcriptPromises.push(track(transcribeForCaptions(audio, "narration.mp3", language)));
  }

  if (imagesDone < total) await report?.("imagens", imagesDone, total);
  const [images, transcripts] = await Promise.all([
    Promise.all(imagePromises),
    Promise.all(transcriptPromises),
  ]);

  return images.map((image, i) => ({
    image,
    audio: audios[i],
    durationSeconds: transcripts[i].durationSeconds,
    words: transcripts[i].words,
  }));
}
