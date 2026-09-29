-- Checagem periódica (cron diário) das assinaturas ativas vindas da Cakto:
-- desativa as canceladas/reembolsadas/contestadas/vencidas e estende as
-- renovadas.
--
-- Nada aqui toca em assinatura do Stripe: tudo filtra por
-- stripe_subscription_id começando com 'cakto_' (ver 0021).
--
-- Requer a 0021. Rode o arquivo inteiro de uma vez no SQL Editor do
-- Supabase.

begin;

-- Quando cada assinatura Cakto foi conferida pela última vez e o que deu.
-- É o que faz o cron começar pelas que estão há mais tempo sem conferir:
-- se a cota da Cakto acabar no meio, a próxima execução continua de onde
-- parou em vez de repetir sempre as mesmas.
create table if not exists public.cakto_subscription_checks (
  subscription_key text primary key,
  user_id uuid references auth.users (id) on delete cascade,
  last_checked_at timestamptz not null default now(),
  last_result text,
  last_error text
);

alter table public.cakto_subscription_checks enable row level security;
-- Sem policy nenhuma: só o service_role (rota do cron) toca essa tabela.

-- Assinaturas Cakto ativas, das menos recentemente conferidas para as
-- mais, com o e-mail do dono (usado para listar os pedidos dele na Cakto).
create or replace function public.list_cakto_subscriptions_to_check(p_limit integer)
returns table (
  user_id uuid,
  plan text,
  subscription_key text,
  current_period_end timestamptz,
  email text,
  last_checked_at timestamptz
)
language sql
stable
security definer set search_path = public
as $$
  select
    s.user_id,
    s.plan,
    s.stripe_subscription_id as subscription_key,
    s.current_period_end,
    coalesce(u.email, p.email)::text as email,
    c.last_checked_at
  from public.subscriptions s
  left join auth.users u on u.id = s.user_id
  left join public.profiles p on p.id = s.user_id
  left join public.cakto_subscription_checks c on c.subscription_key = s.stripe_subscription_id
  where s.status = 'active'
    and s.stripe_subscription_id like 'cakto\_%'
  order by c.last_checked_at nulls first, s.created_at
  limit p_limit;
$$;

revoke execute on function public.list_cakto_subscriptions_to_check(integer) from public, anon, authenticated;
grant execute on function public.list_cakto_subscriptions_to_check(integer) to service_role;

commit;
