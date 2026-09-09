-- Impede que um usuário acabe com 2 assinaturas Virazo ativas ao mesmo
-- tempo (bug real observado em produção: clique em "Assinar" num plano
-- diferente enquanto já existia uma assinatura ativa criava uma SEGUNDA
-- Checkout Session/subscription na Stripe, em vez de trocar o price da
-- existente). A troca de price em si acontece no backend (rota de
-- checkout, via stripe.subscriptions.update) — esta migration só cobre a
-- trava de concorrência: impedir 2 requisições da MESMA conta (duplo
-- clique, 2 abas, retry de rede) rodando a troca ao mesmo tempo.
--
-- Mesmo padrão já usado em elevenlabs_tts_slots (0016) e reserved_at de
-- videos (0019): uma linha de lock com TTL curto, que expira sozinha se a
-- function cair no meio sem liberar — sem precisar de limpeza manual.
--
-- Rode o arquivo inteiro de uma vez no SQL Editor do Supabase.

begin;

create table if not exists public.subscription_change_locks (
  user_id uuid primary key references auth.users (id) on delete cascade,
  claimed_at timestamptz not null default now()
);

alter table public.subscription_change_locks enable row level security;
-- Sem policy nenhuma para anon/authenticated: toda interação passa pelas
-- funções abaixo (security definer), igual ao restante das tabelas de
-- billing deste projeto.

create or replace function public.claim_subscription_change_lock(
  p_user_id uuid default null
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid;
  v_claimed uuid;
begin
  if auth.uid() is not null then
    v_user_id := auth.uid();
  elsif auth.role() = 'service_role' then
    v_user_id := p_user_id;
  else
    raise exception 'Não autorizado';
  end if;

  if v_user_id is null then
    raise exception 'Usuário não identificado';
  end if;

  -- Lock órfão (requisição anterior caiu sem liberar) expira sozinho após
  -- 30s — folga generosa acima do tempo normal de resposta da Stripe
  -- (checkout.sessions.create / subscriptions.update, tipicamente < 2s).
  delete from public.subscription_change_locks
  where user_id = v_user_id and claimed_at < now() - interval '30 seconds';

  insert into public.subscription_change_locks (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing
  returning user_id into v_claimed;

  return v_claimed is not null;
end;
$$;

revoke all on function public.claim_subscription_change_lock(uuid) from public, anon, authenticated;
grant execute on function public.claim_subscription_change_lock(uuid) to authenticated, service_role;

create or replace function public.release_subscription_change_lock(
  p_user_id uuid default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if auth.uid() is not null then
    v_user_id := auth.uid();
  elsif auth.role() = 'service_role' then
    v_user_id := p_user_id;
  else
    raise exception 'Não autorizado';
  end if;

  delete from public.subscription_change_locks where user_id = v_user_id;
end;
$$;

revoke all on function public.release_subscription_change_lock(uuid) from public, anon, authenticated;
grant execute on function public.release_subscription_change_lock(uuid) to authenticated, service_role;

commit;
