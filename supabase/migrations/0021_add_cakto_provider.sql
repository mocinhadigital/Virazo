-- Cakto como segundo provedor de pagamento, convivendo com o Stripe.
--
-- Nada do fluxo do Stripe muda: as assinaturas da Cakto entram na MESMA
-- tabela public.subscriptions, pela MESMA função apply_subscription_plan
-- (migration 0019) que o webhook do Stripe usa. Não existe sistema de
-- créditos — desde a 0019 o plano define o limite diário de vídeos
-- (diario=1, pro=2, ultra=3) e reserve_daily_video_slot só olha para a
-- assinatura com status='active'.
--
-- Como uma assinatura da Cakto é identificada em public.subscriptions:
-- - stripe_subscription_id = 'cakto_<id da assinatura na Cakto>' (ou
--   'cakto_order_<id do pedido>' quando o pedido não traz assinatura). O
--   prefixo garante que nunca colide com um id do Stripe ('sub_...') e é
--   o que as funções abaixo usam para achar "as assinaturas Cakto" de um
--   usuário.
-- - stripe_customer_id = NULL. A rota de checkout do Stripe lê essa coluna
--   para reaproveitar o customer; um valor da Cakto ali seria tratado como
--   customer órfão do Stripe.
--
-- Rode o arquivo inteiro de uma vez no SQL Editor do Supabase.

begin;

-- ============================================================
-- BLOCO 1 — log de TODO evento recebido da Cakto (uma linha por entrega,
-- inclusive reenvios e eventos ignorados). processed_at marca a linha que
-- de fato aplicou o evento; o índice único parcial garante que só UMA linha
-- por (order_id, event) consegue ser marcada como processada — é a trava de
-- idempotência.
-- ============================================================
create table if not exists public.cakto_events (
  id bigint generated always as identity primary key,
  order_id text,
  event text not null,
  email text,
  product_id text,
  payload jsonb not null,
  status text not null default 'received'
    check (status in ('received', 'processed', 'pending_user', 'ignored', 'duplicate', 'error')),
  error_message text,
  processed_at timestamptz,
  received_at timestamptz not null default now()
);

create unique index if not exists cakto_events_processed_once
  on public.cakto_events (order_id, event)
  where processed_at is not null;

create index if not exists cakto_events_email_idx on public.cakto_events (lower(email));

alter table public.cakto_events enable row level security;
-- Sem policy nenhuma: só o service_role (dentro do webhook) toca essa tabela.

-- Marca a linha de log como "a que processou este (order_id, event)".
-- true = pode aplicar; false = esse pedido+evento já foi processado antes.
create or replace function public.try_claim_cakto_event(p_event_row_id bigint)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Não autorizado';
  end if;

  update public.cakto_events
  set processed_at = now()
  where id = p_event_row_id;

  return true;
exception
  when unique_violation then
    return false;
end;
$$;

revoke execute on function public.try_claim_cakto_event(bigint) from public, anon, authenticated;
grant execute on function public.try_claim_cakto_event(bigint) to service_role;

-- ============================================================
-- BLOCO 2 — busca de usuário por e-mail (sem diferenciar maiúsculas).
-- ============================================================
create index if not exists profiles_email_lower_idx on public.profiles (lower(email));

create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer set search_path = public
as $$
  select id
  from public.profiles
  where lower(email) = lower(trim(p_email))
  order by created_at
  limit 1;
$$;

revoke execute on function public.find_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.find_user_id_by_email(text) to service_role;

-- ============================================================
-- BLOCO 3 — desativa assinatura Cakto (cancelamento, reembolso,
-- chargeback). Só muda status para 'canceled'; não apaga nada e não mexe
-- nos vídeos já gerados. Se o id da assinatura não bater com nenhuma linha
-- (ex.: reembolso de pedido sem assinatura no payload), desativa todas as
-- assinaturas Cakto ativas do usuário — nunca as do Stripe.
-- ============================================================
create or replace function public.deactivate_cakto_subscription(
  p_user_id uuid,
  p_subscription_key text
)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Não autorizado';
  end if;

  update public.subscriptions
  set status = 'canceled', updated_at = now()
  where user_id = p_user_id
    and stripe_subscription_id = p_subscription_key;
  get diagnostics v_count = row_count;

  if v_count = 0 then
    update public.subscriptions
    set status = 'canceled', updated_at = now()
    where user_id = p_user_id
      and status = 'active'
      and stripe_subscription_id like 'cakto\_%';
    get diagnostics v_count = row_count;
  end if;

  return v_count;
end;
$$;

revoke execute on function public.deactivate_cakto_subscription(uuid, text) from public, anon, authenticated;
grant execute on function public.deactivate_cakto_subscription(uuid, text) to service_role;

-- ============================================================
-- BLOCO 4 — compras cujo e-mail ainda não tem conta. Guarda também os
-- cancelamentos/reembolsos desses e-mails, para que a ordem dos fatos seja
-- respeitada quando a conta aparecer (comprou e pediu reembolso antes de
-- criar conta = entra sem plano ativo).
-- ============================================================
create table if not exists public.cakto_pending_purchases (
  id bigint generated always as identity primary key,
  email text not null,
  action text not null check (action in ('activate', 'deactivate')),
  plan text check (plan in ('diario', 'pro', 'ultra')),
  subscription_key text not null,
  current_period_end timestamptz,
  order_id text,
  event text not null,
  cakto_event_id bigint references public.cakto_events (id) on delete set null,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  applied_user_id uuid references auth.users (id) on delete set null,
  check (action = 'deactivate' or plan is not null)
);

create index if not exists cakto_pending_purchases_open_idx
  on public.cakto_pending_purchases (lower(email))
  where applied_at is null;

alter table public.cakto_pending_purchases enable row level security;
-- Sem policy nenhuma: só service_role.

-- Aplica, em ordem de chegada, as pendências do e-mail do usuário. Chamada
-- pelo servidor quando o usuário (com e-mail confirmado) abre o dashboard —
-- ou seja, logo após criar conta ou fazer login. "for update skip locked"
-- impede que duas abas abertas ao mesmo tempo apliquem a mesma pendência.
-- Retorna quantas pendências foram aplicadas.
create or replace function public.claim_cakto_pending_purchases(
  p_user_id uuid,
  p_email text
)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.cakto_pending_purchases;
  v_count integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Não autorizado';
  end if;

  for v_row in
    select *
    from public.cakto_pending_purchases
    where lower(email) = lower(trim(p_email))
      and applied_at is null
    order by created_at, id
    for update skip locked
  loop
    if v_row.action = 'activate' then
      perform public.apply_subscription_plan(
        p_user_id,
        v_row.plan,
        null,
        v_row.subscription_key,
        'active',
        v_row.current_period_end
      );
    else
      perform public.deactivate_cakto_subscription(p_user_id, v_row.subscription_key);
    end if;

    update public.cakto_pending_purchases
    set applied_at = now(), applied_user_id = p_user_id
    where id = v_row.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.claim_cakto_pending_purchases(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_cakto_pending_purchases(uuid, text) to service_role;

commit;
