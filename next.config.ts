import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @ffmpeg-installer/ffmpeg resolve o binário certo por plataforma com
  // require() dinâmico — o bundler (Turbopack/Webpack) não consegue analisar
  // isso estaticamente e quebra o build. Deixar como pacote externo faz o
  // Next.js carregá-lo via require normal em runtime, sem tentar empacotar.
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],

  // As faixas prontas são lidas com fs de public/audio/music-library dentro
  // das rotas de geração — garante que entrem no bundle das functions.
  outputFileTracingIncludes: {
    "/api/*": ["public/audio/music-library/**/*"],
  },

  // Vídeo de vendas (VSL) e a capa: cache longo no navegador, para quem volta
  // à página não baixar de novo. O nome do arquivo muda quando o conteúdo muda
  // (virazo-vsl-v2.mp4): ao trocar o vídeo ou a capa, use um nome novo (v3...).
  async headers() {
    return [
      {
        source: "/assets/vsl/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },

  // NÃO adicionar aqui um redirect www->apex enquanto a Vercel (Project
  // Settings -> Domains) ainda redirecionar apex->www: as duas regras juntas
  // criam um loop infinito de redirecionamento entre os dois domínios (fora
  // do ar dos dois lados). A inversão do domínio canônico precisa ser feita
  // SÓ no dashboard da Vercel primeiro; só depois disso faz sentido reforçar
  // www->apex aqui como camada extra de defesa.
};

export default nextConfig;
