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
          <p className="mt-2 text-xs text-zinc-500">
            Rascunho inicial — revise com um advogado e preencha os dados da empresa antes de
            publicar oficialmente.
          </p>

          <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed text-zinc-400">
            <section>
              <h2 className="text-base font-semibold text-white">1. Sobre o serviço</h2>
              <p className="mt-2">
                O Virazo é um serviço de geração de vídeos por inteligência artificial, operado por{" "}
                <span className="text-zinc-500">[razão social e CNPJ a inserir]</span>. Ao criar uma
                conta, você concorda com estes Termos de Uso.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-white">2. Conta e uso aceitável</h2>
              <p className="mt-2">
                Você é responsável pelo conteúdo (temas, roteiros e vídeos) que solicita gerar através
                da plataforma, e concorda em não usar o serviço para produzir conteúdo ilegal,
                enganoso ou que infrinja direitos de terceiros.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-white">3. Créditos e cobrança</h2>
              <p className="mt-2">
                Cada plano concede uma quantidade de créditos mensais (1 crédito = 1 vídeo gerado).
                Pagamentos são processados pela Stripe. O cancelamento pode ser feito a qualquer
                momento, com acesso mantido até o fim do período já pago.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-white">4. Propriedade dos vídeos gerados</h2>
              <p className="mt-2">
                Os vídeos gerados a partir da sua conta são seus para usar, publicar e monetizar
                livremente.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-white">5. Alterações</h2>
              <p className="mt-2">
                Estes termos podem ser atualizados; mudanças relevantes serão comunicadas por e-mail
                ou dentro do painel.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-white">6. Contato</h2>
              <p className="mt-2">
                Dúvidas sobre estes termos: <span className="text-zinc-300">contato@virazo.app</span>.
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
