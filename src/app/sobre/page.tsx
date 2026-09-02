import type { Metadata } from "next";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "Sobre — Virazo",
};

export default function SobrePage() {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-[#05050a]">
      <Header />
      <main className="flex-1 py-20 sm:py-28">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Sobre o Virazo</h1>
          <p className="mt-6 text-sm leading-relaxed text-zinc-400 sm:text-base">
            O Virazo é uma plataforma que usa inteligência artificial para criar vídeos verticais
            prontos para publicar — roteiro, narração, imagens e legenda gerados automaticamente, a
            partir de um tema ou de uma série configurada uma única vez.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-zinc-400 sm:text-base">
            A ideia é simples: tirar do seu caminho o trabalho de gravar, editar e narrar, para que
            você possa manter uma produção de conteúdo consistente sem precisar aparecer nem dominar
            edição de vídeo.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
