import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @ffmpeg-installer/ffmpeg resolve o binário certo por plataforma com
  // require() dinâmico — o bundler (Turbopack/Webpack) não consegue analisar
  // isso estaticamente e quebra o build. Deixar como pacote externo faz o
  // Next.js carregá-lo via require normal em runtime, sem tentar empacotar.
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],

  // Domínio canônico é virazo.app (sem www) — o redirect apex->www hoje é
  // feito no nível de domínio da Vercel (fora deste código) e precisa ser
  // invertido lá (Project Settings -> Domains). Este redirect aqui é a
  // camada de defesa dentro do próprio app: garante www -> apex mesmo que a
  // configuração de domínio da Vercel mude ou fique inconsistente no futuro.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.virazo.app" }],
        destination: "https://virazo.app/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
