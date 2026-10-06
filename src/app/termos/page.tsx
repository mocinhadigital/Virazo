import type { Metadata } from "next";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "Termos de Uso — Virazo",
};

export default function TermosPage() {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-[#05050a]">
      <Header />
      <main className="flex-1 py-16 sm:py-24">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Termos de Uso</h1>

          <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed text-zinc-400">
            <section>
              <h2 className="text-base font-semibold text-white">1. Sobre o serviço</h2>
              <p className="mt-2">
                O Virazo é um serviço de geração de vídeos por inteligência artificial, operado pela
                equipe Virazo. Ao criar uma conta, você concorda com estes Termos de Uso.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-white">2. Conta e uso aceitável</h2>
              <p className="mt-2">
                Você é responsável pelo conteúdo (temas, roteiros e vídeos) que solicita gerar através
                da plataforma e concorda em não usar o serviço para produzir conteúdo ilegal,
                enganoso ou que infrinja direitos de terceiros.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-white">3. Planos e cobrança</h2>
              <p className="mt-2">
                Cada plano permite gerar uma quantidade fixa de vídeos por dia (Diário: 1 vídeo por
                dia; Pro: 2; Ultra: 3). Os pagamentos são processados de forma segura pela Cakto. A
                assinatura é renovada mensalmente e pode ser cancelada a qualquer momento, com acesso
                mantido até o fim do período já pago.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-white">4. Garantia de 7 dias</h2>
              <p className="mt-2">
                Você tem 7 dias, a partir da data da compra, para solicitar o reembolso integral do
                valor pago, sem precisar justificar o motivo. Basta enviar um e-mail para{" "}
                <span className="text-zinc-300">mocinhadigital@gmail.com</span>.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-white">5. Propriedade dos vídeos gerados</h2>
              <p className="mt-2">
                Os vídeos gerados a partir da sua conta são seus para usar, publicar e monetizar
                livremente.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-white">6. Alterações</h2>
              <p className="mt-2">
                Estes termos podem ser atualizados. Mudanças relevantes serão comunicadas por e-mail
                ou dentro do painel.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-white">7. Contato</h2>
              <p className="mt-2">
                Dúvidas sobre estes termos: <span className="text-zinc-300">mocinhadigital@gmail.com</span>.
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
