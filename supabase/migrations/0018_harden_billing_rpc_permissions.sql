-- Endurece o privilégio EXECUTE de TODAS as RPCs de billing criadas na
-- migration 0017 — não só as 2 de crédito.
--
-- Achado (auditoria read-only, sem alterar dados): chamar as 4 funções com
-- a chave `anon` (sem sessão) chegou a executar o CORPO de cada uma — a
-- prova é que a resposta foi a exceção customizada "Não autorizado" (P0001,
-- levantada de dentro do `plpgsql`), não um erro de permissão do Postgres.
-- Isso só acontece se o papel `anon` já tiver EXECUTE na função. O mesmo
-- vale, com altíssima confiança (mesmo mecanismo, não testável ao vivo sem
-- uma sessão de usuário real), para o papel `authenticated`.
--
-- Causa: `revoke all on function ... from public;` (usado em 0017) só
-- revoga o privilégio concedido ao pseudo-papel PUBLIC — não revoga um
-- GRANT dado diretamente a `anon`/`authenticated`, que é exatamente o que o
-- Supabase concede por padrão em funções novas do schema public (privilégio
-- padrão do projeto, não deste código).
--
-- Nenhuma das 4 funções tem uso legítimo sendo chamada direto por
-- `authenticated`:
-- - try_claim_stripe_event / apply_subscription_credit_reset / cancel_subscription
--   / grant_one_time_credits só devem ser chamadas pelo webhook do Stripe,
--   que roda com service_role (sem sessão de usuário). Deixar qualquer uma
--   aberta pra `authenticated` permitiria, por exemplo, um usuário
--   "reivindicar" de propósito um event_id futuro (bloqueando o crédito
--   real de alguém) ou cancelar a assinatura de outra pessoa sabendo o
--   stripe_subscription_id.
--
-- Esta migration só ajusta privilégio (REVOKE/GRANT) — não recria nem
-- altera o corpo de nenhuma função, não toca em nenhuma linha de dado.
--
-- Rode o arquivo inteiro de uma vez no SQL Editor do Supabase.

begin;

-- try_claim_stripe_event(text, text)
revoke execute on function public.try_claim_stripe_event(
  text, text
) from public, anon, authenticated;

grant execute on function public.try_claim_stripe_event(
  text, text
) to service_role;

-- apply_subscription_credit_reset(uuid, text, text, text, text, timestamptz, integer)
revoke execute on function public.apply_subscription_credit_reset(
  uuid, text, text, text, text, timestamptz, integer
) from public, anon, authenticated;

grant execute on function public.apply_subscription_credit_reset(
  uuid, text, text, text, text, timestamptz, integer
) to service_role;

-- cancel_subscription(text)
revoke execute on function public.cancel_subscription(
  text
) from public, anon, authenticated;

grant execute on function public.cancel_subscription(
  text
) to service_role;

-- grant_one_time_credits(uuid, text, integer)
revoke execute on function public.grant_one_time_credits(
  uuid, text, integer
) from public, anon, authenticated;

grant execute on function public.grant_one_time_credits(
  uuid, text, integer
) to service_role;

commit;
