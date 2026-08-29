-- Suporte a assinaturas pagas (Stripe): tabela de assinaturas + funções que
-- creditam o saldo mensal e atualizam o plano ativo do usuário. Rode este
-- arquivo em blocos separados no SQL Editor (um "Run" por bloco).

-- ============================================================
-- BLOCO 1 — tabela de assinaturas + RLS
-- ============================================================
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan text not null check (plan in ('starter', 'turbo', 'maximo')),
  billing_interval text not null check (billing_interval in ('monthly', 'yearly')),
  status text not null default 'active' check (status in ('active', 'canceled', 'past_due', 'incomplete')),
  stripe_customer_id text,
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Sem policy de insert/update/delete para authenticated/anon: toda escrita
-- acontece via service_role (dentro do webhook do Stripe), que ignora RLS.
-- Isso impede um usuário de forjar a própria assinatura via API direta.

-- ============================================================
-- BLOCO 2 — aplica pagamento (checkout inicial ou renovação mensal)
-- ============================================================
create or replace function public.apply_subscription_payment(
  p_user_id uuid,
  p_plan text,
  p_billing_interval text,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_status text,
  p_current_period_end timestamptz,
  p_credits_to_add integer
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.subscriptions (
    user_id, plan, billing_interval, status,
    stripe_customer_id, stripe_subscription_id, current_period_end
  )
  values (
    p_user_id, p_plan, p_billing_interval, p_status,
    p_stripe_customer_id, p_stripe_subscription_id, p_current_period_end
  )
  on conflict (stripe_subscription_id) do update
  set plan = excluded.plan,
      billing_interval = excluded.billing_interval,
      status = excluded.status,
      current_period_end = excluded.current_period_end,
      updated_at = now();

  if p_credits_to_add > 0 then
    update public.profiles
    set credits = credits + p_credits_to_add
    where id = p_user_id;
  end if;
end;
$$;

revoke all on function public.apply_subscription_payment(
  uuid, text, text, text, text, text, timestamptz, integer
) from public;
grant execute on function public.apply_subscription_payment(
  uuid, text, text, text, text, text, timestamptz, integer
) to service_role;

-- ============================================================
-- BLOCO 3 — cancelamento de assinatura
-- ============================================================
create or replace function public.cancel_subscription(
  p_stripe_subscription_id text
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.subscriptions
  set status = 'canceled', updated_at = now()
  where stripe_subscription_id = p_stripe_subscription_id;
end;
$$;

revoke all on function public.cancel_subscription(text) from public;
grant execute on function public.cancel_subscription(text) to service_role;
