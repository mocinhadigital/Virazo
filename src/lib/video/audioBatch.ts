import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
import { transcribeForCaptions, type Transcript, type WordTiming } from "@/lib/ai/captions";

const execFileAsync = promisify(execFile);

// Quantas cenas entram numa única transcrição. Antes: 1 chamada ao Groq por
// cena (18 num vídeo de 60s). Agora: 1 por lote de 6 cenas (~20s de áudio) —
// curto o bastante para os tempos por palavra continuarem precisos.
export const CAPTION_BATCH_SIZE = 6;

// Duração real do áudio, decodificando-o (não depende do cabeçalho do mp3).
export async function measureAudioSeconds(audio: Buffer): Promise<number> {
  const dir = await mkdtemp(path.join(tmpdir(), "virazo-dur-"));
  try {
    const file = path.join(dir, "a.mp3");
    await writeFile(file, audio);
    const { stderr } = await execFileAsync(ffmpeg.path, ["-i", file, "-f", "null", "-"]);
    const all = [...String(stderr).matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
    const m = all[all.length - 1];
    if (!m) throw new Error("Não foi possível medir a duração do áudio da cena.");
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function concatAudio(audios: Buffer[]): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "virazo-batch-"));
  try {
    const args: string[] = ["-y"];
    for (let i = 0; i < audios.length; i++) {
      const p = path.join(dir, `in_${i}.mp3`);
      await writeFile(p, audios[i]);
      args.push("-i", p);
    }
    const inputs = audios.map((_, i) => `[${i}:a]`).join("");
    const out = path.join(dir, "batch.mp3");
    args.push(
      "-filter_complex",
      `${inputs}concat=n=${audios.length}:v=0:a=1,aresample=16000,aformat=channel_layouts=mono[a]`,
      "-map",
      "[a]",
      "-b:a",
      "64k",
      out,
    );
    await execFileAsync(ffmpeg.path, args);
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// Transcreve várias cenas numa chamada só e devolve uma transcrição POR CENA,
// com os tempos de cada palavra relativos ao início da própria cena (o mesmo
// formato de antes). As fronteiras vêm das durações medidas de cada áudio; a
// palavra pertence à cena onde cai o seu ponto médio.
export async function transcribeScenesBatch(
  audios: Buffer[],
  durations: number[],
  language: "pt" | "en" | "es",
): Promise<Transcript[]> {
  const merged = audios.length === 1 ? audios[0] : await concatAudio(audios);
  const batch = await transcribeForCaptions(merged, "batch.mp3", language);

  const offsets: number[] = [];
  let acc = 0;
  for (const d of durations) {
    offsets.push(acc);
    acc += d;
  }

  const perScene: WordTiming[][] = audios.map(() => []);
  for (const w of batch.words) {
    const mid = (w.start + w.end) / 2;
    let idx = offsets.length - 1;
    for (let i = 0; i < offsets.length; i++) {
      if (mid < offsets[i] + durations[i]) {
        idx = i;
        break;
      }
    }
    const off = offsets[idx];
    const start = Math.max(0, w.start - off);
    const end = Math.min(durations[idx], Math.max(start, w.end - off));
    perScene[idx].push({ word: w.word, start, end });
  }

  return audios.map((_, i) => ({
    text: perScene[i].map((w) => w.word).join(" "),
    durationSeconds: durations[i],
    words: perScene[i],
  }));
}
