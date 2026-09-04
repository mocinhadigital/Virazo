import { createClient } from "@/utils/supabase/server";
import ContatoForm from "@/components/dashboard/contato/ContatoForm";

export default async function DashboardContatoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto max-w-[980px]">
      <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-white">Fale Conosco</h1>
      <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-zinc-400">
        Dúvidas, problemas ou sugestões? Escreva pra gente aqui mesmo. Também respondemos em
        contato@virazo.app.
      </p>

      <ContatoForm initialEmail={user?.email ?? ""} />

      <section className="mt-14 max-w-[620px]">
        <h2 className="text-[18px] font-semibold text-white">Suas conversas</h2>
        <p className="mt-4 rounded-[20px] border border-white/[0.08] bg-[#141416] px-5 py-6 text-[14px] text-zinc-400">
          Você ainda não tem conversas.
        </p>
      </section>
    </div>
  );
}
