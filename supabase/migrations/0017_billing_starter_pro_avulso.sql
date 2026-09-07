-- Reformulação completa do billing: Starter/Pro (assinatura recorrente,
-- sem anual, sem quantity/multiplicador) + Pacote Avulso (pagamento único).
-- Substitui o modelo antigo (starter/turbo/maximo com mensal+anual e
-- quantity) ANTES de qualquer registro real existir — confirmado por
-- consulta direta ao Supabase de produção (PGRST205 "Could not find the
-- table 'public.subscriptions'") que as migrations 0006/0007 nunca foram
-- executadas: a tabela `subscriptions` e a função `apply_subscription_payment`
-- não existem em produção. Não há nenhum registro turbo/maximo pra migrar ou
-- preservar — por isso este arquivo cria o schema final direto, em vez de
-- fazer ALTER sobre algo que nunca existiu.
--
-- 0006_add_subscriptions.sql e 0007_add_subscription_quantity.sql continuam
-- no repositório como registro histórico de uma tentativa nunca aplicada —
-- não foram executadas e não serão, este arquivo as torna obsoletas.
--
-- Rode o arquivo INTEIRO de uma vez no SQL Editor do Supabase (não em blocos
-- separados desta vez) — está envolvido em BEGIN/COMMIT abaixo justamente
-- para garantir que, se qualquer statement falhar no meio, TUDO é desfeito
-- automaticamente (nenhuma tabela/função fica criada pela metade). Todos os
-- comandos aqui (CREATE TABLE, CREATE FUNCTION, CREATE POLICY, CREATE
-- TRIGGER) são DDL comum do Postgres — totalmente transacional, sem nenhum
-- comando incompatível com transação (não há CREATE INDEX CONCURRENTLY nem
-- ALTER TYPE ... ADD VALUE).

begin;

-- ============================================================
-- BLOCO 1 — tabela de assinaturas (schema final: só starter/pro, sem
-- billing_interval — não existe mais anual — e sem quantity/multiplicador)
-- ============================================================
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan text not null check (plan in ('starter', 'pro')),
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
-- acontece via service_role (dentro do webhook do Stripe).

create or replace function public.touch_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.touch_subscriptions_updated_at();

-- ============================================================
-- BLOCO 2 — idempotência genérica por event.id do Stripe. Protege TODOS os
-- eventos (não só os de billing) contra reentrega/reprocessamento — é a
-- primeira linha de defesa, chamada antes de qualquer outra lógica no
-- webhook.
-- ============================================================
create table if not exists public.stripe_processed_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table public.stripe_processed_events enable row level security;
-- Sem policy nenhuma: só o service_role (dentro do webhook) toca essa tabela.

create or replace function public.try_claim_stripe_event(
  p_event_id text,
  p_event_type text
)
returns boolean -- true = evento novo, pode processar; false = já processado, ignorar
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Não autorizado';
  end if;

  insert into public.stripe_processed_events (event_id, event_type)
  values (p_event_id, p_event_type)
  on conflict (event_id) do nothing;

  return found;
end;
$$;

revoke all on function public.try_claim_stripe_event(text, text) from public;
grant execute on function public.try_claim_stripe_event(text, text) to service_role;

-- ============================================================
-- BLOCO 3 — Starter/Pro: FIXA o saldo de créditos no valor do plano (não
-- soma com o que sobrou do ciclo anterior). Upsert por stripe_subscription_id
-- já torna a atualização da linha de assinatura idempotente por natureza;
-- o "set" de créditos também é idempotente por natureza (fixar em 30 duas
-- vezes seguidas continua sendo 30) — a defesa por event_id (bloco 2) ainda
-- se aplica por cima, como exigido.
-- ============================================================
create or replace function public.apply_subscription_credit_reset(
  p_user_id uuid,
  p_plan text,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_status text,
  p_current_period_end timestamptz,
  p_credits_fixed integer
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Não autorizado';
  end if;

  insert into public.subscriptions (
    user_id, plan, status, stripe_customer_id, stripe_subscription_id, current_period_end
  )
  values (
    p_user_id, p_plan, p_status, p_stripe_customer_id, p_stripe_subscription_id, p_current_period_end
  )
  on conflict (stripe_subscription_id) do update
  set plan = excluded.plan,
      status = excluded.status,
      current_period_end = excluded.current_period_end,
      updated_at = now();

  update public.profiles
  set credits = p_credits_fixed
  where id = p_user_id;
end;
$$;

revoke all on function public.apply_subscription_credit_reset(
  uuid, text, text, text, text, timestamptz, integer
) from public;
grant execute on function public.apply_subscription_credit_reset(
  uuid, text, text, text, text, timestamptz, integer
) to service_role;

-- ============================================================
-- BLOCO 4 — cancelamento de assinatura (inalterado em relação à tentativa
-- anterior nunca aplicada).
-- ============================================================
create or replace function public.cancel_subscription(
  p_stripe_subscription_id text
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Não autorizado';
  end if;

  update public.subscriptions
  set status = 'canceled', updated_at = now()
  where stripe_subscription_id = p_stripe_subscription_id;
end;
$$;

revoke all on function public.cancel_subscription(text) from public;
grant execute on function public.cancel_subscription(text) to service_role;

-- ============================================================
-- BLOCO 5 — Pacote Avulso: pagamento único, soma +10 (ou o valor
-- configurado) ao saldo existente, protegido por stripe_checkout_session_id
-- único — a MESMA sessão nunca credita duas vezes, mas uma nova compra
-- legítima (nova session) sempre pode.
-- ============================================================
create table if not exists public.one_time_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stripe_checkout_session_id text not null unique,
  credits_added integer not null,
  created_at timestamptz not null default now()
);

alter table public.one_time_purchases enable row level security;

drop policy if exists "one_time_purchases_select_own" on public.one_time_purchases;
create policy "one_time_purchases_select_own"
  on public.one_time_purchases for select
  using (auth.uid() = user_id);

-- Sem policy de insert/update/delete para authenticated/anon: só service_role.

create or replace function public.grant_one_time_credits(
  p_user_id uuid,
  p_stripe_checkout_session_id text,
  p_credits_to_add integer
)
returns boolean -- true = creditou agora; false = essa session já tinha sido creditada
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Não autorizado';
  end if;

  insert into public.one_time_purchases (user_id, stripe_checkout_session_id, credits_added)
  values (p_user_id, p_stripe_checkout_session_id, p_credits_to_add)
  on conflict (stripe_checkout_session_id) do nothing;

  if not found then
    return false;
  end if;

  update public.profiles
  set credits = credits + p_credits_to_add
  where id = p_user_id;

  return true;
end;
$$;

revoke all on function public.grant_one_time_credits(uuid, text, integer) from public;
grant execute on function public.grant_one_time_credits(uuid, text, integer) to service_role;

commit;
