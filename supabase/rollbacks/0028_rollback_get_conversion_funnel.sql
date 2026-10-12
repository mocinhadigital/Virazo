-- REVERSÃO da migration 0028 (e da 0029): volta get_conversion_funnel para a
-- definição ORIGINAL da migration 0026 (copiada sem alteração).
--
-- Só recria a função. Não mexe em assinaturas, pagamentos, eventos, gatilhos
-- nem webhooks, e é seguro rodar mais de uma vez. Depois dela, a página do
-- funil continua funcionando (os blocos novos deixam de aparecer).
--
-- A tabela public.analytics_excluded_users (criada pela 0028) NÃO é apagada
-- aqui: sem a função nova ninguém a lê, ela guarda só o id da conta
-- administradora e não atrapalha nada. Se mesmo assim quiser removê-la, rode
-- à parte, só depois desta reversão:
--   drop table if exists public.analytics_excluded_users;

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

  with e as (
    select event_name, plan, coalesce(user_id::text, id::text) as person
    from public.conversion_events
    where p_since is null or created_at >= p_since
  )
  select jsonb_build_object(
    'signups',   (select count(distinct person) from e where event_name = 'signup_completed'),
    'paywall',   (select count(distinct person) from e where event_name = 'paywall_viewed'),
    'selected',  (select count(distinct person) from e where event_name = 'plan_selected'),
    'checkout',  (select count(distinct person) from e where event_name = 'checkout_started'),
    'purchased', (select count(distinct person) from e where event_name = 'purchase_completed'),
    'selected_by_plan', jsonb_build_object(
      'daily', (select count(distinct person) from e where event_name = 'plan_selected' and plan = 'daily'),
      'pro',   (select count(distinct person) from e where event_name = 'plan_selected' and plan = 'pro'),
      'ultra', (select count(distinct person) from e where event_name = 'plan_selected' and plan = 'ultra')
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_conversion_funnel(timestamptz) from public, anon;
grant execute on function public.get_conversion_funnel(timestamptz) to authenticated;

commit;
