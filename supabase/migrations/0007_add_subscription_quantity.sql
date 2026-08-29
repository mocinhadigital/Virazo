-- Suporte a "quantas séries simultâneas" como multiplicador de quantidade
-- na assinatura (mapeia direto pro `quantity` nativo da Stripe). Cada série
-- extra multiplica preço, créditos/mês e limite de simultâneas.
-- Rode em blocos separados.

-- ============================================================
-- BLOCO 1 — coluna nova
-- ============================================================
alter table public.subscriptions
  add column if not exists quantity integer not null default 1;

-- ============================================================
-- BLOCO 2 — apply_subscription_payment passa a aceitar/gravar a quantidade
-- ============================================================
-- A assinatura antiga (8 parâmetros, sem p_quantity) precisa ser removida
-- antes: "create or replace" só substitui quando os tipos batem exatamente,
-- senão o Postgres cria uma sobrecarga nova e "revoke/grant" fica ambíguo
-- (mesma armadilha que já vimos com create_video_and_consume_credit).
drop function if exists public.apply_subscription_payment(
  uuid, text, text, text, text, text, timestamptz, integer
);

create or replace function public.apply_subscription_payment(
  p_user_id uuid,
  p_plan text,
  p_billing_interval text,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_status text,
  p_current_period_end timestamptz,
  p_credits_to_add integer,
  p_quantity integer default 1
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.subscriptions (
    user_id, plan, billing_interval, status,
    stripe_customer_id, stripe_subscription_id, current_period_end, quantity
  )
  values (
    p_user_id, p_plan, p_billing_interval, p_status,
    p_stripe_customer_id, p_stripe_subscription_id, p_current_period_end, p_quantity
  )
  on conflict (stripe_subscription_id) do update
  set plan = excluded.plan,
      billing_interval = excluded.billing_interval,
      status = excluded.status,
      current_period_end = excluded.current_period_end,
      quantity = excluded.quantity,
      updated_at = now();

  if p_credits_to_add > 0 then
    update public.profiles
    set credits = credits + p_credits_to_add
    where id = p_user_id;
  end if;
end;
$$;

revoke all on function public.apply_subscription_payment(
  uuid, text, text, text, text, text, timestamptz, integer, integer
) from public;
grant execute on function public.apply_subscription_payment(
  uuid, text, text, text, text, text, timestamptz, integer, integer
) to service_role;
