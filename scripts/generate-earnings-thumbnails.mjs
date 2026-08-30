// Script de configuração única: gera as imagens de exemplo dos cards da
// seção "E quanto isso rende?" da landing page. Sobe pro Supabase Storage,
// bucket `videos`, prefixo `_landing-images/`.
//
// Uso: node scripts/generate-earnings-thumbnails.mjs [slug ...]
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

const IMAGES = [
  {
    slug: "earnings-historia",
    prompt:
      "cinematic photo of an ancient Egyptian pyramid at golden hour, dramatic warm lighting, documentary travel photography style, vertical composition, no text, no watermark",
  },
  {
    slug: "earnings-motivacional",
    prompt:
      "cinematic photo of a silhouette of a person standing on a mountain peak at sunrise with arms raised, inspiring and uplifting mood, dramatic golden light, vertical composition, no text, no watermark",
  },
  {
    slug: "earnings-receitas",
    prompt:
      "cinematic top-down food photography of a delicious home-cooked pasta dish being plated, warm kitchen lighting, appetizing and vibrant colors, vertical composition, no text, no watermark",
  },
];

async function main() {
  const requestedSlugs = process.argv.slice(2);
  const imagesToGenerate =
    requestedSlugs.length > 0 ? IMAGES.filter((s) => requestedSlugs.includes(s.slug)) : IMAGES;

  if (imagesToGenerate.length === 0) {
    throw new Error(`Nenhuma imagem encontrada para: ${requestedSlugs.join(", ")}`);
  }

  const result = {};

  for (const image of imagesToGenerate) {
    console.log(`Gerando: ${image.slug}...`);

    const generation = await fal.subscribe("fal-ai/z-image/turbo", {
      input: {
        prompt: image.prompt,
        image_size: "portrait_16_9",
        num_images: 1,
        output_format: "jpeg",
      },
    });

    const imageUrl = generation.data.images[0]?.url;
    if (!imageUrl) {
      throw new Error(`fal.ai não retornou imagem para ${image.slug}`);
    }

    const response = await fetch(imageUrl);
    const buffer = Buffer.from(await response.arrayBuffer());

    const path = `_landing-images/${image.slug}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from("videos")
      .upload(path, buffer, { contentType: "image/jpeg", upsert: true });

    if (uploadError) {
      throw new Error(`Falha ao subir ${image.slug}: ${uploadError.message}`);
    }

    const { data: publicUrlData } = supabase.storage.from("videos").getPublicUrl(path);
    result[image.slug] = publicUrlData.publicUrl;
    console.log(`  -> ${publicUrlData.publicUrl}`);
  }

  console.log("\nResultado final:");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
