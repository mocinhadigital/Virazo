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

// Fontes empacotadas em public/ (a Vercel sempre inclui esta pasta,
// verbatim, em todo deploy — diferente de um arquivo binário solto em
// src/, que não tem garantia de ser rastreado/incluído no bundle da
// function serverless). Sem isso, o filtro "ass" do ffmpeg dependia de
// descoberta de fonte do sistema operacional (DirectWrite no Windows,
// que sempre acha "Arial" — mas não existe equivalente no runtime Linux
// da Vercel, então a legenda falhava silenciosamente: vídeo gerado e
// baixável normalmente, só que sem nenhum texto visível).
const FONTS_DIR = path.join(process.cwd(), "public", "fonts");

// Volume da música de fundo em relação à narração — baixo o bastante pra
// não brigar com a voz, mas audível. Mesma ideia do "sorteio de uma faixa
// por vídeo" do AutoShortz: aqui a faixa já vem escolhida (generate.ts).
const BACKGROUND_MUSIC_VOLUME = 0.18;

export async function renderFinalVideo(
  scenes: RenderScene[],
  burnCaptions: boolean,
  captionStyle: string | null | undefined,
  backgroundMusic?: Buffer,
): Promise<Buffer> {
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

    let audioBasePath = concatPath;

    if (backgroundMusic) {
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
        `[1:a]volume=${BACKGROUND_MUSIC_VOLUME}[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
        "-map",
        "0:v",
        "-map",
        "[aout]",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-t",
        cumulativeSeconds.toFixed(2),
        mixedPath,
      ]);
      audioBasePath = mixedPath;
    }

    if (!burnCaptions || captionCues.length === 0) {
      return await readFile(audioBasePath);
    }

    const assPath = path.join(workDir, "captions.ass");
    await writeFile(assPath, buildAss(captionCues, captionStyle ?? null), "utf-8");

    const finalPath = path.join(workDir, "final.mp4");
    // O filtro "ass" do ffmpeg exige escapar ":" no caminho (por causa da
    // letra de unidade no Windows, ex. "C:") e usar barras normais. Mesma
    // regra vale pro "fontsdir" — que aponta a fonte empacotada no projeto
    // pro libass, em vez de depender da fonte "Arial" do sistema operacional
    // (inexistente no runtime Linux da Vercel).
    const escapePathForFilter = (p: string) => p.replace(/\\/g, "/").replace(/:/g, "\\:");
    const escapedAssPath = escapePathForFilter(assPath);
    const escapedFontsDir = escapePathForFilter(FONTS_DIR);

    await execFileAsync(ffmpeg.path, [
      "-y",
      "-i",
      audioBasePath,
      "-vf",
      `ass='${escapedAssPath}':fontsdir='${escapedFontsDir}'`,
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

type CaptionPreset = {
  fontSize: number;
  primaryColor: string; // hex "#rrggbb"
  outlineColor: string; // hex "#rrggbb", ignorado se outlineWidth = 0
  outlineWidth: number; // unidade ASS "Outline", relativa a PlayResX/Y
  bold: boolean;
  boxed: boolean; // true = caixa opaca atrás do texto (BorderStyle 3), false = contorno (BorderStyle 1)
  boxColor?: string; // hex, só usado quando boxed = true
  transform?: "uppercase" | "lowercase";
};

// Nomes e valores dos 3 estilos do vídeo avulso (CAPTION_STYLES em
// CreateVideoWizard.tsx) e dos 4 estilos de série (SERIES_CAPTION_STYLES em
// seriesOptions.ts). Cor, presença/ausência de contorno e caixa-alta/baixa
// dos estilos de série vêm dos valores reais medidos no preview do
// AutoShortz; a espessura exata do contorno não é diretamente portável de
// um preview em CSS pra unidades ASS num vídeo 1080x1920, então aqui ela é
// aproximada mantendo a mesma ordem relativa (Suave sem contorno < Traço
// forte < Destaque vermelho < Impacto, do mais fino ao mais grosso).
const CAPTION_PRESETS: Record<string, CaptionPreset> = {
  // --- vídeo avulso ---
  "Clássica": {
    fontSize: 52,
    primaryColor: "#ffffff",
    outlineColor: "#000000",
    outlineWidth: 3,
    bold: true,
    boxed: false,
  },
  "Destaque": {
    fontSize: 58,
    primaryColor: "#ffffff",
    outlineColor: "#000000",
    outlineWidth: 4,
    bold: true,
    boxed: true,
    boxColor: "#4C3BFF",
  },
  "Minimalista": {
    fontSize: 44,
    primaryColor: "#ffffff",
    outlineColor: "#000000",
    outlineWidth: 1,
    bold: false,
    boxed: false,
  },
  // --- séries ---
  "Traço forte": {
    fontSize: 52,
    primaryColor: "#ffffff",
    outlineColor: "#000000",
    outlineWidth: 3,
    bold: true,
    boxed: false,
    transform: "uppercase",
  },
  "Destaque vermelho": {
    fontSize: 52,
    primaryColor: "#ff3b30",
    outlineColor: "#000000",
    outlineWidth: 4,
    bold: true,
    boxed: false,
    transform: "uppercase",
  },
  "Suave": {
    fontSize: 44,
    primaryColor: "#ffffff",
    outlineColor: "#000000",
    outlineWidth: 0,
    bold: false,
    boxed: false,
    transform: "uppercase",
  },
  "Impacto": {
    fontSize: 58,
    primaryColor: "#ffffff",
    outlineColor: "#000000",
    outlineWidth: 5,
    bold: true,
    boxed: false,
    transform: "lowercase",
  },
};

const DEFAULT_PRESET: CaptionPreset = CAPTION_PRESETS["Clássica"];

// "#rrggbb" -> "&HAABBGGRR" (ordem de bytes do ASS é invertida em relação a
// CSS, e o alpha vem primeiro). alpha "00" = totalmente opaco.
function hexToAssColor(hex: string, alpha = "00"): string {
  const clean = hex.replace("#", "");
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return `&H${alpha}${b}${g}${r}`.toUpperCase();
}

// Gera um .ass com PlayResX/PlayResY iguais à resolução real do vídeo — sem
// isso, o filtro "subtitles"/"ass" do ffmpeg tenta adivinhar a resolução de
// referência (geralmente um valor pequeno, tipo 384x288) e o texto sai
// desproporcionalmente enorme e mal posicionado quando escalado pro tamanho
// real do vídeo (1080x1920). Fontname aponta pra "Roboto", empacotada em
// public/fonts (ver FONTS_DIR) — nunca "Arial", que não existe no runtime
// Linux da Vercel.
function buildAss(
  cues: { start: number; end: number; text: string }[],
  styleName: string | null,
): string {
  const preset = (styleName && CAPTION_PRESETS[styleName]) || DEFAULT_PRESET;

  const primaryColor = hexToAssColor(preset.primaryColor);
  const outlineColor = hexToAssColor(preset.outlineColor);
  const borderStyle = preset.boxed ? 3 : 1;
  const backColor = preset.boxed ? hexToAssColor(preset.boxColor ?? "#000000", "20") : "&H64000000";

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${WIDTH}
PlayResY: ${HEIGHT}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Roboto,${preset.fontSize},${primaryColor},&H000000FF,${outlineColor},${backColor},${preset.bold ? 1 : 0},0,0,0,100,100,0,0,${borderStyle},${preset.outlineWidth},1,2,60,60,180,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = cues
    .map((cue) => {
      let text = cue.text.replace(/[{}]/g, "");
      if (preset.transform === "uppercase") text = text.toUpperCase();
      else if (preset.transform === "lowercase") text = text.toLowerCase();
      return `Dialogue: 0,${formatAssTime(cue.start)},${formatAssTime(cue.end)},Default,,0,0,0,,${text}`;
    })
    .join("\n");

  return header + events + "\n";
}
