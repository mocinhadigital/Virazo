-- Funil de conversão: números mais confiáveis (substitui get_conversion_funnel
-- da 0026; mesma assinatura, então a página continua chamando do mesmo jeito).
--
-- O que muda:
-- 1. Contas de teste ficam FORA dos números do funil e aparecem separadas
--    ("test_accounts"). A lista é a tabela analytics_excluded_users — nada é
--    apagado de conversion_events. Começa só com as contas de administrador
--    (admin_users), que a administradora confirmou ser dela. Outras contas só
--    entram na lista quando forem confirmadas como teste.
-- 2. Funil por COORTE: as etapas contam só quem se cadastrou (signup_completed)
--    dentro do período. Contas anteriores ao rastreamento, que viram os planos
--    mas nunca tiveram evento de cadastro, vão para "other_activity" — não
--    inflam mais as etapas acima de "Cadastros".
-- 3. Vendas NUNCA são excluídas: "purchased_total" conta todas as compras do
--    período, de qualquer conta (inclusive teste e fora da coorte), e
--    "purchased_test"/"purchased_other" mostram quantas dessas vêm de cada
--    grupo.
-- 4. "cakto": Pix gerado e checkout abandonado vindos do webhook da Cakto
--    (cakto_events, só leitura), por pessoa (e-mail), mais quantos ainda não
--    têm pagamento aplicado.
--
-- Não altera subscriptions, cakto_events, conversion_events, gatilhos nem
-- nenhuma função de cobrança. Só cria 1 tabela nova e substitui 1 função.
-- Rode o arquivo inteiro de uma vez no SQL Editor do Supabase.

begin;

-- ============================================================
-- BLOCO 1 — contas excluídas das estatísticas (não é exclusão de dados)
-- ============================================================
create table if not exists public.analytics_excluded_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  reason text not null default '',
  created_at timestamptz not null default now()
);

alter table public.analytics_excluded_users enable row level security;
revoke all on public.analytics_excluded_users from anon, authenticated;

insert into public.analytics_excluded_users (user_id, reason)
select user_id, 'conta de administrador (teste confirmado)'
from public.admin_users
on conflict (user_id) do nothing;

-- ============================================================
-- BLOCO 2 — get_conversion_funnel (mesma assinatura da 0026)
-- p_since nulo = desde o início dos registros.
-- ============================================================
create or replace function public.get_conversion_funnel(p_since timestamptz default null)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not exists (select 1 from public.admin_users where user_id = auth.uid()) then
    raise exception 'Não autorizado';
  end if;

  with
  excl as (
    select user_id from public.analytics_excluded_users
  ),
  ev as (
    select
      user_id,
      event_name,
      plan,
      coalesce(user_id::text, id::text) as person
    from public.conversion_events
    where p_since is null or created_at >= p_since
  ),
  cohort as (
    select distinct user_id
    from ev
    where event_name = 'signup_completed'
      and user_id is not null
      and user_id not in (select user_id from excl)
  ),
  -- grp: 'cohort' = cadastrou no período; 'other' = atividade de quem não
  -- cadastrou no período (e não é teste); 'test' = contas excluídas;
  -- 'all' = tudo, usado só para a contagem de vendas.
  g as (
    select 'cohort'::text as grp, person, event_name, plan from ev
      where user_id in (select user_id from cohort)
    union all
    select 'other', person, event_name, plan from ev
      where (user_id is null or user_id not in (select user_id from cohort))
        and (user_id is null or user_id not in (select user_id from excl))
    union all
    select 'test', person, event_name, plan from ev
      where user_id in (select user_id from excl)
    union all
    select 'all', person, event_name, plan from ev
  ),
  -- Cakto: e-mail do aviso (coluna ou dentro do payload; o aviso de
  -- abandono traz só data.customerEmail).
  cx as (
    select
      event,
      order_id,
      idempotency_key,
      status,
      processed_at,
      lower(coalesce(
        nullif(email, ''),
        payload -> 'data' ->> 'customerEmail',
        payload ->> 'customerEmail',
        payload -> 'data' -> 'customer' ->> 'email'
      )) as em
    from public.cakto_events
    where p_since is null or received_at >= p_since
  ),
  test_emails as (
    select lower(u.email) as em
    from auth.users u
    join excl x on x.user_id = u.id
    where u.email is not null
  ),
  -- Quem já tem pagamento aplicado (em qualquer época).
  paid_emails as (
    select distinct lower(email) as em
    from public.cakto_events
    where idempotency_key like 'activate:%'
      and status = 'processed'
      and processed_at is not null
      and email is not null
      and lower(email) not like '%@example.com'
  ),
  -- Tentativas reais: sem a conta de teste e sem o e-mail de exemplo que a
  -- Cakto usa nos avisos de teste do painel dela.
  attempts as (
    select event, em
    from cx
    where event in ('pix_gerado', 'checkout_abandonment')
      and em is not null
      and em not like '%@example.com'
      and em not in (select em from test_emails)
  )
  select jsonb_build_object(
    'signups',   count(distinct person) filter (where grp = 'cohort' and event_name = 'signup_completed'),
    'paywall',   count(distinct person) filter (where grp = 'cohort' and event_name = 'paywall_viewed'),
    'selected',  count(distinct person) filter (where grp = 'cohort' and event_name = 'plan_selected'),
    'checkout',  count(distinct person) filter (where grp = 'cohort' and event_name = 'checkout_started'),
    'purchased', count(distinct person) filter (where grp = 'cohort' and event_name = 'purchase_completed'),
    'selected_by_plan', jsonb_build_object(
      'daily', count(distinct person) filter (where grp = 'cohort' and event_name = 'plan_selected' and plan = 'daily'),
      'pro',   count(distinct person) filter (where grp = 'cohort' and event_name = 'plan_selected' and plan = 'pro'),
      'ultra', count(distinct person) filter (where grp = 'cohort' and event_name = 'plan_selected' and plan = 'ultra')
    ),
    'purchased_total', count(distinct person) filter (where grp = 'all' and event_name = 'purchase_completed'),
    'purchased_test',  count(distinct person) filter (where grp = 'test' and event_name = 'purchase_completed'),
    'purchased_other', count(distinct person) filter (where grp = 'other' and event_name = 'purchase_completed'),
    'other_activity', jsonb_build_object(
      'paywall',  count(distinct person) filter (where grp = 'other' and event_name = 'paywall_viewed'),
      'selected', count(distinct person) filter (where grp = 'other' and event_name = 'plan_selected'),
      'checkout', count(distinct person) filter (where grp = 'other' and event_name = 'checkout_started')
    ),
    'test_accounts', jsonb_build_object(
      'accounts', (select count(*) from excl),
      'paywall',  count(distinct person) filter (where grp = 'test' and event_name = 'paywall_viewed'),
      'selected', count(distinct person) filter (where grp = 'test' and event_name = 'plan_selected'),
      'checkout', count(distinct person) filter (where grp = 'test' and event_name = 'checkout_started')
    ),
    'cakto', jsonb_build_object(
      'pix_generated',  (select count(distinct em) from attempts where event = 'pix_gerado'),
      'abandoned',      (select count(distinct em) from attempts where event = 'checkout_abandonment'),
      'unpaid',         (select count(distinct em) from attempts where em not in (select em from paid_emails)),
      'paid_orders',    (select count(distinct order_id) from cx
                         where idempotency_key like 'activate:%' and status = 'processed'
                           and processed_at is not null and em not like '%@example.com'),
      'paid_orders_test', (select count(distinct order_id) from cx
                           where idempotency_key like 'activate:%' and status = 'processed'
                             and processed_at is not null and em not like '%@example.com'
                             and em in (select em from test_emails))
    )
  ) into v_result
  from g;

  return v_result;
end;
$$;

revoke all on function public.get_conversion_funnel(timestamptz) from public, anon;
grant execute on function public.get_conversion_funnel(timestamptz) to authenticated;

commit;
