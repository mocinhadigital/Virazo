import { MessageCircle } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import ContatoForm from "@/components/dashboard/contato/ContatoForm";
import { WHATSAPP_DISPLAY, WHATSAPP_HELP_MESSAGE, whatsappUrl } from "@/lib/contact";

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
        mocinhadigital@gmail.com.
      </p>

      <div className="mt-8 flex max-w-[620px] flex-col gap-3 rounded-[20px] border border-white/[0.08] bg-[#141416] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[15px] font-medium text-white">Precisa de ajuda agora?</p>
          <p className="mt-1 text-[14px] text-zinc-400">Fale com a gente no WhatsApp: {WHATSAPP_DISPLAY}</p>
        </div>
        <a
          href={whatsappUrl(WHATSAPP_HELP_MESSAGE)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-5 text-[15px] font-semibold text-[#052e16] transition-colors hover:bg-[#3ee27a] active:scale-95"
        >
          <MessageCircle className="h-[18px] w-[18px]" aria-hidden />
          Falar no WhatsApp
        </a>
      </div>

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
