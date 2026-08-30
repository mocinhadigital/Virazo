// Script de configuração única: gera as 3 imagens ilustrativas da seção
// "passo a passo" da landing page e sobe pro Supabase Storage, no bucket
// `videos` já existente, sob o prefixo `_landing-images/`.
//
// Uso: node scripts/generate-howitworks-images.mjs [slug ...]
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
    slug: "step-1-create-series",
    prompt:
      "minimalist 3D isometric illustration, a smartphone screen showing an abstract content creation app interface with colorful sliders, toggle switches and icon dots only, dark background, warm coral and orange gradient lighting, modern premium SaaS product illustration, clean geometric shapes. Absolutely no text, no letters, no words, no logos, no typography anywhere in the image — icons and shapes only",
  },
  {
    slug: "step-2-ai-generates",
    prompt:
      "minimalist 3D isometric illustration, abstract glowing neural network generating a vertical video preview on a smartphone screen, coral and orange glowing particles, dark background, modern premium SaaS product illustration, clean geometric shapes, no text",
  },
  {
    slug: "step-3-review-post",
    prompt:
      "minimalist 3D isometric illustration, a hand holding a smartphone with a finished vertical video, a checkmark and a share icon floating nearby, dark background, warm coral and orange gradient lighting, modern premium SaaS product illustration, clean geometric shapes, no text",
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
        image_size: "landscape_4_3",
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
