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
    const srtCues: { start: number; end: number; text: string }[] = [];
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
          srtCues.push({
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

    if (!burnCaptions || srtCues.length === 0) {
      return await readFile(concatPath);
    }

    const srtPath = path.join(workDir, "captions.srt");
    await writeFile(srtPath, buildSrt(srtCues), "utf-8");

    const finalPath = path.join(workDir, "final.mp4");
    // O filtro "subtitles" do ffmpeg exige escapar ":" no caminho (por causa
    // da letra de unidade no Windows, ex. "C:") e usar barras normais.
    const escapedSrtPath = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:");

    await execFileAsync(ffmpeg.path, [
      "-y",
      "-i",
      concatPath,
      "-vf",
      `subtitles='${escapedSrtPath}':force_style='FontName=Arial,FontSize=20,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=2,Alignment=2,MarginV=140'`,
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

function formatSrtTime(totalSeconds: number): string {
  const ms = Math.max(0, Math.round(totalSeconds * 1000));
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
}

function buildSrt(cues: { start: number; end: number; text: string }[]): string {
  return cues
    .map(
      (cue, i) => `${i + 1}\n${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}\n${cue.text}\n`,
    )
    .join("\n");
}
