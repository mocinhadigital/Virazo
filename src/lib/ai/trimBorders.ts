import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpeg from "@ffmpeg-installer/ffmpeg";

const execFileAsync = promisify(execFile);

export type TrimResult = {
  image: Buffer;
  // Fração da área original removida (0 = sem borda).
  removedFraction: number;
};

// Geradores de imagem às vezes desenham uma moldura/faixa branca em volta da
// cena. Detecta bordas quase brancas (cropdetect sobre a imagem invertida) e
// corta, devolvendo só a cena. A etapa de montagem depois escala a imagem
// para preencher a tela cheia.
export async function trimWhiteBorders(image: Buffer): Promise<TrimResult> {
  const dir = await mkdtemp(path.join(tmpdir(), "virazo-trim-"));
  try {
    const input = path.join(dir, "in.jpg");
    await writeFile(input, image);
    let stderr = "";
    try {
      const r = await execFileAsync(ffmpeg.path, [
        "-loop",
        "1",
        "-i",
        input,
        "-vf",
        // Imagem repetida: o cropdetect desta versão do ffmpeg só estabiliza
        // depois de alguns quadros.
        "negate,cropdetect=limit=40:round=2",
        "-frames:v",
        "6",
        "-f",
        "null",
        "-",
      ]);
      stderr = String(r.stderr);
    } catch (err) {
      stderr = String((err as { stderr?: string }).stderr ?? "");
    }
    const info = /Stream #0:0.*?, (\d+)x(\d+)/.exec(stderr);
    const crops = [...stderr.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
    const last = crops[crops.length - 1];
    if (!info || !last) return { image, removedFraction: 0 };

    const [W, H] = [Number(info[1]), Number(info[2])];
    const [w, h, x, y] = [Number(last[1]), Number(last[2]), Number(last[3]), Number(last[4])];
    const removed = 1 - (w * h) / (W * H);
    // Menos de 1,5% de borda não vale o corte; a área restante precisa ser
    // uma cena de verdade (não uma imagem quase toda branca).
    if (removed < 0.015 || w < W * 0.4 || h < H * 0.4) return { image, removedFraction: 0 };

    const output = path.join(dir, "out.jpg");
    await execFileAsync(ffmpeg.path, ["-y", "-i", input, "-vf", `crop=${w}:${h}:${x}:${y}`, "-q:v", "2", output]);
    return { image: await readFile(output), removedFraction: removed };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
