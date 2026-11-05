import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
import type { WordTiming } from "@/lib/ai/captions";
import {
  BACKGROUND_MUSIC_VOLUME,
  FADE_SECONDS,
  FONTS_DIR,
  FPS,
  HEIGHT,
  WIDTH,
  buildAss,
  type AssLayout,
  escapePathForFilter,
  groupWordsIntoCues,
} from "@/lib/video/render";
import { REALISTIC_CLIP_SECONDS } from "./constants";

const execFileAsync = promisify(execFile);

// Legenda no padrão TikTok/Reels: ~2x maior, negrito, contorno preto grosso e
// um pouco acima do rodapé. Cor, caixa e maiúsculas seguem o estilo escolhido.
const CAPTION_LAYOUT: AssLayout = { fontScale: 2, outlineScale: 2.2, minOutline: 7, forceBold: true, marginV: 380 };

export type RealisticRenderScene = {
  clip: Buffer; // clipe animado de 5s (mp4, sem som)
  audio: Buffer; // narração da cena
  narrationSeconds: number;
  words: WordTiming[]; // tempos relativos ao início da cena
};

// Narração um pouco maior que a cena é acelerada (até 1,3x) para caber nos
// 5s sem cortar a frase; acima disso é cortada no fim da cena.
const MAX_TEMPO = 1.3;
const NARRATION_BUDGET_SECONDS = REALISTIC_CLIP_SECONDS - 0.15;

// Monta o vídeo realista: cada cena é o clipe animado (5s) + a narração +
// a legenda da própria cena (gravadas numa única codificação), depois
// concatenadas por cópia e, se houver, com a música de fundo por baixo.
// Mesma receita do vídeo normal (src/lib/video/render.ts), só que a imagem
// parada com zoom virou um clipe em movimento.
export async function renderRealisticVideo(
  scenes: RealisticRenderScene[],
  burnCaptions: boolean,
  captionStyle: string | null | undefined,
  backgroundMusic?: Buffer,
  onSceneStart?: (current: number, total: number) => void | Promise<void>,
): Promise<Buffer> {
  const workDir = await mkdtemp(path.join(tmpdir(), "virazo-real-"));
  try {
    const clipPaths: string[] = [];
    const escapedFontsDir = escapePathForFilter(FONTS_DIR);
    const seconds = REALISTIC_CLIP_SECONDS;

    for (let i = 0; i < scenes.length; i++) {
      await onSceneStart?.(i + 1, scenes.length);

      const scene = scenes[i];
      const sourcePath = path.join(workDir, `src_${i}.mp4`);
      const audioPath = path.join(workDir, `scene_${i}.mp3`);
      const outPath = path.join(workDir, `scene_${i}.mp4`);
      await writeFile(sourcePath, scene.clip);
      await writeFile(audioPath, scene.audio);

      const tempo =
        scene.narrationSeconds > NARRATION_BUDGET_SECONDS
          ? Math.min(MAX_TEMPO, scene.narrationSeconds / NARRATION_BUDGET_SECONDS)
          : 1;

      // Garante exatamente 5s de vídeo: repete o último quadro se o clipe
      // vier um pouco mais curto e corta se vier mais longo.
      let videoFilter = `[0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},fps=${FPS},tpad=stop_mode=clone:stop_duration=2,trim=duration=${seconds},setpts=PTS-STARTPTS`;
      if (i !== 0) videoFilter += `,fade=t=in:st=0:d=${FADE_SECONDS}`;
      if (i !== scenes.length - 1) videoFilter += `,fade=t=out:st=${(seconds - FADE_SECONDS).toFixed(2)}:d=${FADE_SECONDS}`;

      // Legenda desta cena, com os tempos ajustados à velocidade da fala.
      const words = scene.words.map((w) => ({ ...w, start: w.start / tempo, end: w.end / tempo }));
      const cues = burnCaptions ? groupWordsIntoCues(words, 3) : [];
      if (cues.length > 0) {
        const assPath = path.join(workDir, `scene_${i}.ass`);
        await writeFile(assPath, buildAss(cues, captionStyle ?? null, CAPTION_LAYOUT), "utf-8");
        videoFilter += `,ass='${escapePathForFilter(assPath)}':fontsdir='${escapedFontsDir}'`;
      }

      const audioFilter = `[1:a]${tempo > 1 ? `atempo=${tempo.toFixed(3)},` : ""}apad,atrim=0:${seconds}[a]`;

      await execFileAsync(ffmpeg.path, [
        "-y",
        "-i",
        sourcePath,
        "-i",
        audioPath,
        "-filter_complex",
        `${videoFilter}[v];${audioFilter}`,
        "-map",
        "[v]",
        "-map",
        "[a]",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-ar",
        "44100",
        "-ac",
        "2",
        "-t",
        String(seconds),
        outPath,
      ]);
      clipPaths.push(outPath);
    }

    const listPath = path.join(workDir, "list.txt");
    await writeFile(listPath, clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));

    const concatPath = path.join(workDir, "concat.mp4");
    await execFileAsync(ffmpeg.path, ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", concatPath]);

    if (!backgroundMusic) return await readFile(concatPath);

    const musicPath = path.join(workDir, "music.mp3");
    await writeFile(musicPath, backgroundMusic);

    const mixedPath = path.join(workDir, "mixed.mp4");
    await execFileAsync(ffmpeg.path, [
      "-y",
      "-i",
      concatPath,
      "-stream_loop",
      "-1",
      "-i",
      musicPath,
      "-filter_complex",
      `[1:a]volume=${BACKGROUND_MUSIC_VOLUME}[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=0,volume=2,alimiter=limit=0.95[aout]`,
      "-map",
      "0:v",
      "-map",
      "[aout]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-t",
      String(seconds * scenes.length),
      mixedPath,
    ]);
    return await readFile(mixedPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
