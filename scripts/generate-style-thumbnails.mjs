// Script de configuração única: gera uma imagem de exemplo real por estilo
// visual (fal.ai Z-Image Turbo) e sobe pro Supabase Storage, no bucket
// `videos` já existente, sob o prefixo `_style-thumbnails/` (não é uma pasta
// de usuário, então a policy de insert comum não libera escrita ali — por
// isso usamos a service role key, que ignora RLS). Rode de novo se quiser
// regenerar algum estilo.
//
// Uso: node scripts/generate-style-thumbnails.mjs [slug ...]
// Sem argumentos, regenera os 6. Com argumentos (ex.: "comic"), regenera só
// os estilos informados.
// Precisa de FAL_KEY, NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
// no .env.local.

import { readFileSync } from "node:fs";
import { fal } from "@fal-ai/client";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const content = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) process.env[match[1]] = match[2];
  }
}

loadEnvLocal();

fal.config({ credentials: process.env.FAL_KEY });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const STYLES = [
  {
    slug: "anime",
    name: "Anime",
    prompt:
      "anime style illustration, young hero standing on a rooftop at sunset looking at the city, vibrant cel-shaded colors, Japanese animation art style, dynamic pose",
  },
  {
    slug: "comic",
    name: "Comic",
    prompt:
      "original comic book superhero character, green and purple costume, no cape, no chest emblem, no red and blue colors, comic book art style with halftone dots and bold black ink outlines, action pose, dramatic low-angle shot, comic sound-effect lettering like BOOM and POW in the background",
  },
  {
    slug: "cartoon-3d",
    name: "Cartoon 3D",
    prompt:
      "3D cartoon character render, Pixar-style animation, colorful and friendly, big expressive eyes, smooth toy-like shading, studio lighting",
  },
  {
    slug: "realista",
    name: "Realista",
    prompt:
      "photorealistic portrait photo, natural cinematic lighting, high detail, shot on DSLR, shallow depth of field",
  },
  {
    slug: "dark-fantasy",
    name: "Dark Fantasy",
    prompt:
      "dark fantasy illustration, gothic castle silhouette, moody atmospheric fog, dramatic shadows and rim light, epic fantasy concept art",
  },
  {
    slug: "pintura-classica",
    name: "Pintura Clássica",
    prompt:
      "classical oil painting, renaissance-style portrait, rich warm tones, visible painterly brushstrokes, museum masterpiece style",
  },
  {
    slug: "comic-terror",
    name: "Comic de Terror",
    prompt:
      "creepy horror comic book illustration, dark ink outlines, eerie green and purple atmosphere, halftone shading, spooky original monster character in shadows, original horror comic art style",
  },
  {
    slug: "cartoon-2d",
    name: "Cartoon 2D",
    prompt:
      "modern 2D flat cartoon illustration, bold clean outlines, simple flat vibrant colors, cheerful original character design, contemporary animated series art style",
  },
  {
    slug: "mitologia",
    name: "Mitologia",
    prompt:
      "epic mythological illustration, ancient greek deity character with dramatic lighting, marble and gold tones, classical mythology concept art",
  },
  {
    slug: "pixel-art",
    name: "Pixel Art",
    prompt:
      "retro pixel art illustration, 16-bit video game style character, vibrant colorful pixels, nostalgic arcade aesthetic",
  },
  {
    slug: "fantasia",
    name: "Fantasia",
    prompt:
      "epic high fantasy illustration, a knight facing a majestic dragon inside a glowing crystal cave, dramatic cinematic lighting, detailed digital painting, fantasy book cover art style, no cute creatures",
  },
];

async function main() {
  const requestedSlugs = process.argv.slice(2);
  const stylesToGenerate =
    requestedSlugs.length > 0 ? STYLES.filter((s) => requestedSlugs.includes(s.slug)) : STYLES;

  if (stylesToGenerate.length === 0) {
    throw new Error(`Nenhum estilo encontrado para: ${requestedSlugs.join(", ")}`);
  }

  const result = {};

  for (const style of stylesToGenerate) {
    console.log(`Gerando: ${style.name}...`);

    const generation = await fal.subscribe("fal-ai/z-image/turbo", {
      input: {
        prompt: style.prompt,
        image_size: "portrait_4_3",
        num_images: 1,
        output_format: "jpeg",
      },
    });

    const imageUrl = generation.data.images[0]?.url;
    if (!imageUrl) {
      throw new Error(`fal.ai não retornou imagem para o estilo ${style.name}`);
    }

    const response = await fetch(imageUrl);
    const buffer = Buffer.from(await response.arrayBuffer());

    const path = `_style-thumbnails/${style.slug}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from("videos")
      .upload(path, buffer, { contentType: "image/jpeg", upsert: true });

    if (uploadError) {
      throw new Error(`Falha ao subir ${style.name}: ${uploadError.message}`);
    }

    const { data: publicUrlData } = supabase.storage.from("videos").getPublicUrl(path);
    result[style.slug] = publicUrlData.publicUrl;
    console.log(`  -> ${publicUrlData.publicUrl}`);
  }

  console.log("\nResultado final:");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
