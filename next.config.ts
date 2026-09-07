import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @ffmpeg-installer/ffmpeg resolve o binário certo por plataforma com
  // require() dinâmico — o bundler (Turbopack/Webpack) não consegue analisar
  // isso estaticamente e quebra o build. Deixar como pacote externo faz o
  // Next.js carregá-lo via require normal em runtime, sem tentar empacotar.
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],

  // NÃO adicionar aqui um redirect www->apex enquanto a Vercel (Project
  // Settings -> Domains) ainda redirecionar apex->www: as duas regras juntas
  // criam um loop infinito de redirecionamento entre os dois domínios (fora
  // do ar dos dois lados). A inversão do domínio canônico precisa ser feita
  // SÓ no dashboard da Vercel primeiro; só depois disso faz sentido reforçar
  // www->apex aqui como camada extra de defesa.
};

export default nextConfig;
