-- Funil: contagem de VENDAS REAIS, compras de teste separadas, datas dos
-- pagamentos pelo "paidAt" da Cakto e quadro de conciliação (só leitura).
-- Substitui get_conversion_funnel da 0028 (mesma assinatura; a página
-- continua chamando do mesmo jeito). Requer a 0028.
--
-- O que muda em relação à 0028:
-- 1. purchased_total e cakto.paid_orders passam a contar SÓ vendas reais:
--    compras de contas de teste (analytics_excluded_users) saem desses
--    totais e aparecem à parte em purchased_test / cakto.paid_orders_test.
--    Nada é apagado nem alterado.
-- 2. Pedidos pagos na Cakto entram no período pela DATA DO PAGAMENTO
--    (payload.data.paidAt), e não pela data em que o Virazo ficou sabendo
--    (muitos pedidos são descobertos horas depois, por consulta à API).
--    Se o paidAt não existir ou não for uma data, usa a data de recebimento.
-- 3. cakto.reconciliation: lista os pedidos pagos que o Virazo conhece
--    (todos os períodos, os 50 mais recentes), um por pedido, para comparar
--    com o relatório da Cakto: data do pagamento, plano, valor, cliente,
--    e-mail mascarado, se é conta de teste e se a pessoa tem conta, assinatura
--    ativa e evento de compra no funil.
--
-- Só substitui 1 função. Não cria tabelas, não escreve em nenhuma tabela,
-- não altera subscriptions, cakto_events, conversion_events, gatilhos,
-- permissões de acesso nem webhooks.
-- Para desfazer: rode de novo o arquivo 0028 (ele recria a função anterior).
-- Rode o arquivo inteiro de uma vez no SQL Editor do Supabase.

begin;

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
  -- cadastrou no período (e não é teste); 'test' = contas excluídas.
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
  ),
  test_emails as (
    select lower(u.email) as em
    from auth.users u
    join excl x on x.user_id = u.id
    where u.email is not null
  ),
  -- Um registro por pedido pago e aplicado no Virazo. Fica de fora o aviso
  -- de teste da Cakto (e-mail @example.com, "Produto Teste").
  paid as (
    select distinct on (order_id)
      order_id,
      lower(email) as em,
      payload -> 'data' ->> 'amount' as amount,
      payload -> 'data' -> 'product' ->> 'name' as product,
      payload -> 'data' -> 'customer' ->> 'id' as customer_id,
      coalesce(
        case
          when payload -> 'data' ->> 'paidAt' ~ '^\d{4}-\d{2}-\d{2}T'
            then (payload -> 'data' ->> 'paidAt')::timestamptz
        end,
        received_at
      ) as paid_ts
    from public.cakto_events
    where idempotency_key like 'activate:%'
      and status = 'processed'
      and processed_at is not null
      and order_id is not null
      and email is not null
      and lower(email) not like '%@example.com'
    order by order_id, processed_at
  ),
  paid_in_period as (
    select * from paid where p_since is null or paid_ts >= p_since
  ),
  -- Tentativas (Pix gerado / checkout abandonado), pela data do aviso.
  -- O aviso de abandono traz o e-mail só em data.customerEmail.
  attempts as (
    select
      event,
      lower(coalesce(
        nullif(email, ''),
        payload -> 'data' ->> 'customerEmail',
        payload ->> 'customerEmail',
        payload -> 'data' -> 'customer' ->> 'email'
      )) as em
    from public.cakto_events
    where event in ('pix_gerado', 'checkout_abandonment')
      and (p_since is null or received_at >= p_since)
  ),
  real_attempts as (
    select event, em
    from attempts
    where em is not null
      and em not like '%@example.com'
      and em not in (select em from test_emails)
  ),
  recon as (
    select
      p.paid_ts,
      jsonb_build_object(
        'order_id', p.order_id,
        'paid_at', p.paid_ts,
        'product', p.product,
        'amount', p.amount,
        'customer_id', p.customer_id,
        'email', regexp_replace(p.em, '^(.{2}).*(@.*)$', '\1***\2'),
        'is_test', p.em in (select em from test_emails),
        'has_account', exists (select 1 from auth.users u where lower(u.email) = p.em),
        'has_active_subscription', exists (
          select 1
          from public.subscriptions s
          join auth.users u on u.id = s.user_id
          where lower(u.email) = p.em and s.status = 'active'
        ),
        'has_purchase_event', exists (
          select 1
          from public.conversion_events c
          join auth.users u on u.id = c.user_id
          where lower(u.email) = p.em and c.event_name = 'purchase_completed'
        )
      ) as row_json
    from paid p
    order by p.paid_ts desc
    limit 50
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
    -- Vendas reais: coorte + quem já tinha conta. Teste fica à parte.
    'purchased_total', count(distinct person) filter (where grp in ('cohort', 'other') and event_name = 'purchase_completed'),
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
      'pix_generated', (select count(distinct em) from real_attempts where event = 'pix_gerado'),
      'abandoned',     (select count(distinct em) from real_attempts where event = 'checkout_abandonment'),
      'unpaid',        (select count(distinct em) from real_attempts
                        where em not in (select em from paid)),
      'paid_orders',      (select count(*) from paid_in_period where em not in (select em from test_emails)),
      'paid_orders_test', (select count(*) from paid_in_period where em in (select em from test_emails)),
      'reconciliation', (select coalesce(jsonb_agg(row_json order by paid_ts desc), '[]'::jsonb) from recon)
    )
  ) into v_result
  from g;

  return v_result;
end;
$$;

revoke all on function public.get_conversion_funnel(timestamptz) from public, anon;
grant execute on function public.get_conversion_funnel(timestamptz) to authenticated;

commit;
