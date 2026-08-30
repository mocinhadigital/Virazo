// Script de configuração única: gera 3 vídeos reais de exemplo (um por
// nicho) usando a MESMA stack de IA do Virazo (Claude + ElevenLabs + fal.ai
// + Groq + ffmpeg), pra usar como preview em loop nos cards da seção
// "E quanto isso rende?" da landing page. Não passa pela rota autenticada
// nem consome crédito de nenhum usuário — chama as APIs direto.
//
// Os módulos `src/lib/ai/*` do app têm `import "server-only"`, que quebra
// fora do Next.js — por isso a lógica (já testada em produção) está
// duplicada aqui, e não importada.
//
// Uso: node scripts/generate-earnings-example-videos.mjs [slug ...]
// Precisa de ANTHROPIC_API_KEY, ELEVENLABS_API_KEY, FAL_KEY, GROQ_API_KEY,
// NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.

import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { fal } from "@fal-ai/client";
import Groq, { toFile } from "groq-sdk";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
import { createClient } from "@supabase/supabase-js";

const execFileAsync = promisify(execFile);

function loadEnvLocal() {
  const content = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) process.env[match[1]] = match[2];
  }
}
loadEnvLocal();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const elevenlabs = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
fal.config({ credentials: process.env.FAL_KEY });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const VOICE_IDS = {
  Ana: "Xb7hH8MSUJpSbSDYk0k2",
  Lucas: "TX3LPaxmHKxFdv7VOQHJ",
  Sofia: "cgSgspJ2msm6clMCkdW9",
  Marcos: "JBFqnCBsd6RMkjVDRZzb",
};

const EXAMPLES = [
  {
    slug: "earnings-historia",
    topic: "curiosidades incríveis e pouco conhecidas sobre as pirâmides do Egito",
    contentStyle: "Curiosidades",
    visualStyle: "Realista",
    voice: "Marcos",
    sceneCount: 4,
  },
  {
    slug: "earnings-motivacional",
    topic: "motivação para começar o dia com foco, disciplina e propósito",
    contentStyle: "Motivacional",
    visualStyle: "Realista",
    voice: "Lucas",
    sceneCount: 4,
  },
  {
    slug: "earnings-receitas",
    topic: "receita rápida e deliciosa de macarrão à bolonhesa em poucos minutos",
    contentStyle: "Receitas rápidas",
    visualStyle: "Realista",
    voice: "Sofia",
    sceneCount: 4,
  },
];

const RETURN_SCRIPT_TOOL = {
  name: "return_script",
  description: "Retorna o roteiro do vídeo dividido em cenas.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      scenes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            narration: { type: "string" },
            imagePrompt: { type: "string" },
          },
          required: ["narration", "imagePrompt"],
        },
      },
    },
    required: ["title", "scenes"],
  },
};

async function generateScript({ topic, contentStyle, visualStyle, sceneCount }) {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2048,
    tools: [RETURN_SCRIPT_TOOL],
    tool_choice: { type: "tool", name: "return_script" },
    messages: [
      {
        role: "user",
        content: `Escreva o roteiro de um vídeo curto vertical (estilo Reels/TikTok) sobre: "${topic}".
Estilo de conteúdo: ${contentStyle}.
Estilo visual das imagens: ${visualStyle}.
Divida em exatamente ${sceneCount} cenas. Cada cena tem 1-2 frases de narração em português do Brasil, e uma descrição visual em inglês para gerar uma imagem nesse estilo visual.`,
      },
    ],
  });
  const toolUse = message.content.find((b) => b.type === "tool_use");
  if (!toolUse) throw new Error("Claude não retornou o roteiro esperado.");
  return toolUse.input;
}

async function synthesizeNarration(text, voiceName) {
  const voiceId = VOICE_IDS[voiceName] ?? VOICE_IDS.Ana;
  const stream = await elevenlabs.textToSpeech.convert(voiceId, {
    text,
    modelId: "eleven_multilingual_v2",
  });
  const chunks = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function generateSceneImage(imagePrompt, visualStyle) {
  const result = await fal.subscribe("fal-ai/z-image/turbo", {
    input: {
      prompt: `${imagePrompt}, estilo visual: ${visualStyle}`,
      image_size: "portrait_16_9",
      num_images: 1,
      output_format: "jpeg",
    },
  });
  const imageUrl = result.data.images[0]?.url;
  if (!imageUrl) throw new Error("fal.ai não retornou imagem.");
  const response = await fetch(imageUrl);
  return Buffer.from(await response.arrayBuffer());
}

async function transcribeForCaptions(audio) {
  const response = await groq.audio.transcriptions.create({
    model: "whisper-large-v3-turbo",
    file: await toFile(audio, "narration.mp3"),
    response_format: "verbose_json",
    timestamp_granularities: ["word"],
    language: "pt",
  });
  const words = response.words ?? [];
  return {
    durationSeconds: response.duration ?? (words.length > 0 ? words[words.length - 1].end : 0),
    words,
  };
}

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 25;

function groupWordsIntoCues(words, groupSize = 4) {
  const cues = [];
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

function formatAssTime(totalSeconds) {
  const centis = Math.max(0, Math.round(totalSeconds * 100));
  const hours = Math.floor(centis / 360_000);
  const minutes = Math.floor((centis % 360_000) / 6_000);
  const seconds = Math.floor((centis % 6_000) / 100);
  const remainingCentis = centis % 100;
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  return `${hours}:${pad(minutes)}:${pad(seconds)}.${pad(remainingCentis)}`;
}

function buildAss(cues) {
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
    .map((cue) => `Dialogue: 0,${formatAssTime(cue.start)},${formatAssTime(cue.end)},Default,,0,0,0,,${cue.text.replace(/[{}]/g, "")}`)
    .join("\n");
  return header + events + "\n";
}

async function renderFinalVideo(scenes) {
  const workDir = await mkdtemp(path.join(tmpdir(), "virazo-example-"));
  try {
    const sceneClipPaths = [];
    const srtCues = [];
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
        "-y", "-loop", "1", "-i", imagePath, "-i", audioPath,
        "-filter_complex",
        `[0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},zoompan=z='min(zoom+0.0015,1.2)':d=${frames}:s=${WIDTH}x${HEIGHT}:fps=${FPS}[v]`,
        "-map", "[v]", "-map", "1:a",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
        "-t", durationSeconds.toFixed(2), "-shortest", clipPath,
      ]);
      sceneClipPaths.push(clipPath);

      for (const cue of groupWordsIntoCues(scene.words)) {
        srtCues.push({
          start: cumulativeSeconds + cue.start,
          end: cumulativeSeconds + cue.end,
          text: cue.text,
        });
      }
      cumulativeSeconds += durationSeconds;
    }

    const listPath = path.join(workDir, "list.txt");
    await writeFile(listPath, sceneClipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));

    const concatPath = path.join(workDir, "concat.mp4");
    await execFileAsync(ffmpeg.path, ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", concatPath]);

    const assPath = path.join(workDir, "captions.ass");
    await writeFile(assPath, buildAss(srtCues), "utf-8");

    const finalPath = path.join(workDir, "final.mp4");
    const escapedAssPath = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");

    await execFileAsync(ffmpeg.path, [
      "-y", "-i", concatPath, "-vf",
      `ass='${escapedAssPath}'`,
      "-c:a", "copy", finalPath,
    ]);

    return await readFile(finalPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function main() {
  const requestedSlugs = process.argv.slice(2);
  const examples = requestedSlugs.length > 0 ? EXAMPLES.filter((e) => requestedSlugs.includes(e.slug)) : EXAMPLES;
  if (examples.length === 0) throw new Error(`Nenhum exemplo encontrado para: ${requestedSlugs.join(", ")}`);

  const result = {};

  for (const example of examples) {
    console.log(`\n=== ${example.slug} ===`);
    console.log("Gerando roteiro...");
    const script = await generateScript(example);

    console.log(`Gerando ${script.scenes.length} cenas (narração + imagem + legenda)...`);
    const renderScenes = await Promise.all(
      script.scenes.map(async (scene) => {
        const [audio, image] = await Promise.all([
          synthesizeNarration(scene.narration, example.voice),
          generateSceneImage(scene.imagePrompt, example.visualStyle),
        ]);
        const transcript = await transcribeForCaptions(audio);
        return { image, audio, durationSeconds: transcript.durationSeconds, words: transcript.words };
      }),
    );

    console.log("Renderizando vídeo final...");
    const finalVideo = await renderFinalVideo(renderScenes);

    const uploadPath = `_landing-images/${example.slug}.mp4`;
    const { error: uploadError } = await supabase.storage
      .from("videos")
      .upload(uploadPath, finalVideo, { contentType: "video/mp4", upsert: true });
    if (uploadError) throw new Error(`Falha ao subir ${example.slug}: ${uploadError.message}`);

    const { data: publicUrlData } = supabase.storage.from("videos").getPublicUrl(uploadPath);
    result[example.slug] = publicUrlData.publicUrl;
    console.log(`  -> ${publicUrlData.publicUrl}`);
  }

  console.log("\nResultado final:");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
