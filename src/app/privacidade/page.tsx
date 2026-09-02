import type { Metadata } from "next";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "Política de Privacidade — Virazo",
};

export default function PrivacidadePage() {
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-[#05050a]">
      <Header />
      <main className="flex-1 py-16 sm:py-24">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Política de Privacidade
          </h1>
          <p className="mt-2 text-xs text-zinc-500">
            Rascunho inicial — revise com um advogado e preencha os dados da empresa antes de
            publicar oficialmente.
          </p>

          <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed text-zinc-400">
            <section>
              <h2 className="text-base font-semibold text-white">1. Dados que coletamos</h2>
              <p className="mt-2">
                Coletamos seu e-mail e nome (para autenticação e identificação da conta), os temas e
                roteiros usados para gerar vídeos, e dados de pagamento processados diretamente pela
                Stripe — o Virazo nunca armazena os dados do seu cartão.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-white">2. Como usamos seus dados</h2>
              <p className="mt-2">
                Usamos seus dados para operar sua conta, gerar os vídeos solicitados, processar
                pagamentos e dar suporte. Não vendemos seus dados a terceiros.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-white">3. Onde seus dados ficam armazenados</h2>
              <p className="mt-2">
                Autenticação, banco de dados e arquivos de vídeo ficam hospedados no Supabase.
                Pagamentos ficam com a Stripe. Cada serviço segue suas próprias práticas de segurança
                e criptografia.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-white">4. Seus direitos</h2>
              <p className="mt-2">
                Você pode solicitar a exclusão da sua conta e dos seus dados a qualquer momento
                entrando em contato pelo e-mail abaixo.
              </p>
            </section>
            <section>
              <h2 className="text-base font-semibold text-white">5. Contato</h2>
              <p className="mt-2">
                Dúvidas sobre privacidade: <span className="text-zinc-300">contato@virazo.app</span>.
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
