import type { Metadata } from "next";
import { Mail } from "lucide-react";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "Afiliados — Virazo",
};

export default function AfiliadosPage() {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-[#05050a]">
      <Header />
      <main className="flex-1 py-20 sm:py-28">
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Programa de afiliados
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-zinc-400 sm:text-base">
            Estamos estruturando o programa de afiliados do Virazo. Se você já cria conteúdo sobre
            IA, marketing digital ou criação de vídeos e quer ser um dos primeiros parceiros, entre
            em contato — em breve teremos os detalhes de comissão e acompanhamento.
          </p>
          <a
            href="mailto:contato@virazo.app?subject=Programa%20de%20afiliados"
            className="mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#FF6B5B] to-[#FFB84D] px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-[#FF6B5B]/25 transition-transform active:scale-95 sm:hover:scale-[1.03]"
          >
            <Mail className="h-4 w-4" />
            Quero ser afiliado
          </a>
        </div>
      </main>
      <Footer />
    </div>
  );
}
