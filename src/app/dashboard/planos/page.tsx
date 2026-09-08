import { redirect } from "next/navigation";

// O fluxo de upgrade agora é só o modal compacto ("Escolha seu plano",
// aberto pelo botão "Fazer upgrade" na Sidebar ou automaticamente quando uma
// geração é bloqueada por falta de assinatura) — não existe mais página
// cheia de planos. Esta rota continua existindo só pra não quebrar um link
// antigo/favorito de alguém; redireciona pro dashboard.
export default function PlanosPage() {
  redirect("/dashboard");
}
