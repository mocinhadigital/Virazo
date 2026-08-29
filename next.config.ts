import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @ffmpeg-installer/ffmpeg resolve o binário certo por plataforma com
  // require() dinâmico — o bundler (Turbopack/Webpack) não consegue analisar
  // isso estaticamente e quebra o build. Deixar como pacote externo faz o
  // Next.js carregá-lo via require normal em runtime, sem tentar empacotar.
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],
};

export default nextConfig;
