import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
import type { WordTiming } from "../ai/captions";

const execFileAsync = promisify(execFile);

export type RenderScene = {
  image: Buffer;
  audio: Buffer;
  durationSeconds: number;
  words: WordTiming[]; // timestamps relativos ao início desta cena
};

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 25;

export async function renderFinalVideo(scenes: RenderScene[], burnCaptions: boolean): Promise<Buffer> {
  const workDir = await mkdtemp(path.join(tmpdir(), "virazo-"));
  try {
    const sceneClipPaths: string[] = [];
    const captionCues: { start: number; end: number; text: string }[] = [];
    let cumulativeSeconds = 0;

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const imagePath = path.join(workDir, `scene_${i}.jpg`);
      const audioPath = path.join(workDir, `scene_${i}.mp3`);
      const clipPath = path.join(workDir, `scene_${i}.mp4`);
      await writeFile(imagePath, scene.image);
      await writeFile(audioPath, scene.audio);

      const durationSeconds = Math.max(0.5, scene.durationSeconds);
      const frames = Math.max(1, Math.round(durationSeconds * FPS));

      await execFileAsync(ffmpeg.path, [
        "-y",
        "-loop",
        "1",
        "-i",
        imagePath,
        "-i",
        audioPath,
        "-filter_complex",
        `[0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},zoompan=z='min(zoom+0.0015,1.2)':d=${frames}:s=${WIDTH}x${HEIGHT}:fps=${FPS}[v]`,
        "-map",
        "[v]",
        "-map",
        "1:a",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-t",
        durationSeconds.toFixed(2),
        "-shortest",
        clipPath,
      ]);
      sceneClipPaths.push(clipPath);

      if (burnCaptions) {
        for (const cue of groupWordsIntoCues(scene.words)) {
          captionCues.push({
            start: cumulativeSeconds + cue.start,
            end: cumulativeSeconds + cue.end,
            text: cue.text,
          });
        }
      }
      cumulativeSeconds += durationSeconds;
    }

    const listPath = path.join(workDir, "list.txt");
    await writeFile(
      listPath,
      sceneClipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"),
    );

    const concatPath = path.join(workDir, "concat.mp4");
    await execFileAsync(ffmpeg.path, [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c",
      "copy",
      concatPath,
    ]);

    if (!burnCaptions || captionCues.length === 0) {
      return await readFile(concatPath);
    }

    const assPath = path.join(workDir, "captions.ass");
    await writeFile(assPath, buildAss(captionCues), "utf-8");

    const finalPath = path.join(workDir, "final.mp4");
    // O filtro "ass" do ffmpeg exige escapar ":" no caminho (por causa da
    // letra de unidade no Windows, ex. "C:") e usar barras normais.
    const escapedAssPath = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");

    await execFileAsync(ffmpeg.path, [
      "-y",
      "-i",
      concatPath,
      "-vf",
      `ass='${escapedAssPath}'`,
      "-c:a",
      "copy",
      finalPath,
    ]);

    return await readFile(finalPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

function groupWordsIntoCues(words: WordTiming[], groupSize = 4) {
  const cues: { start: number; end: number; text: string }[] = [];
  for (let i = 0; i < words.length; i += groupSize) {
    const group = words.slice(i, i + groupSize);
    if (group.length === 0) continue;
    cues.push({
      start: group[0].start,
      end: group[group.length - 1].end,
      text: group.map((w) => w.word.trim()).join(" "),
    });
  }
  return cues;
}

function formatAssTime(totalSeconds: number): string {
  const centis = Math.max(0, Math.round(totalSeconds * 100));
  const hours = Math.floor(centis / 360_000);
  const minutes = Math.floor((centis % 360_000) / 6_000);
  const seconds = Math.floor((centis % 6_000) / 100);
  const remainingCentis = centis % 100;
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${hours}:${pad(minutes)}:${pad(seconds)}.${pad(remainingCentis)}`;
}

// Gera um .ass com PlayResX/PlayResY iguais à resolução real do vídeo — sem
// isso, o filtro "subtitles"/"ass" do ffmpeg tenta adivinhar a resolução de
// referência (geralmente um valor pequeno, tipo 384x288) e o texto sai
// desproporcionalmente enorme e mal posicionado quando escalado pro tamanho
// real do vídeo (1080x1920). Estilo pensado pra parecer legenda de
// Reels/TikTok: texto discreto, negrito, contorno fino (sem caixa sólida),
// perto da base da tela.
function buildAss(cues: { start: number; end: number; text: string }[]): string {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${WIDTH}
PlayResY: ${HEIGHT}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,52,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,3,1,2,60,60,180,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = cues
    .map(
      (cue) =>
        `Dialogue: 0,${formatAssTime(cue.start)},${formatAssTime(cue.end)},Default,,0,0,0,,${cue.text.replace(/[{}]/g, "")}`,
    )
    .join("\n");

  return header + events + "\n";
}
