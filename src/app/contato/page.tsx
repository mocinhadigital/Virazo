import type { Metadata } from "next";
import { Mail } from "lucide-react";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "Contato — Virazo",
};

export default function ContatoPage() {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-[#05050a]">
      <Header />
      <main className="flex-1 py-20 sm:py-28">
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Fale com a gente</h1>
          <p className="mt-4 text-sm leading-relaxed text-zinc-400 sm:text-base">
            Dúvidas sobre sua conta, cobrança ou algum problema com a geração de vídeos? Manda um
            e-mail que a gente responde.
          </p>
          <a
            href="mailto:contato@virazo.app"
            className="mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#FF6B5B] to-[#FFB84D] px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-[#FF6B5B]/25 transition-transform active:scale-95 sm:hover:scale-[1.03]"
          >
            <Mail className="h-4 w-4" />
            contato@virazo.app
          </a>
        </div>
      </main>
      <Footer />
    </div>
  );
}
