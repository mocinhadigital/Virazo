-- Funil de conversão: cadastro → viu os planos → escolheu plano → iniciou
-- checkout → pagamento aprovado.
--
-- - conversion_events: um registro por evento. RLS ligado e SEM policy:
--   usuário comum não lê, não cria, não altera e não apaga nada direto.
-- - Eventos do navegador (paywall_viewed, plan_selected, checkout_started)
--   entram só por track_conversion_event, que recusa qualquer outro nome.
-- - signup_completed e purchase_completed são gravados por gatilhos no
--   banco — nunca pelo navegador. Os gatilhos só ACRESCENTAM um registro e
--   engolem qualquer erro próprio: rastreamento nunca bloqueia cadastro nem
--   liberação de plano. Nenhuma função de assinatura existente é alterada.
-- - admin_users + get_conversion_funnel: números do painel, só para
--   administradores.
--
-- Rode o arquivo inteiro de uma vez no SQL Editor do Supabase, trocando
-- SEU_EMAIL_AQUI (bloco 7) pelo e-mail de login da administradora. O e-mail
-- real NÃO deve ser gravado neste arquivo (ele vai para o GitHub).

begin;

-- ============================================================
-- BLOCO 1 — tabela de eventos
-- ============================================================
create table if not exists public.conversion_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  event_name text not null check (event_name in (
    'signup_completed', 'paywall_viewed', 'plan_selected', 'checkout_started', 'purchase_completed'
  )),
  plan text check (plan in ('daily', 'pro', 'ultra')),
  metadata jsonb not null default '{}'::jsonb,
  -- Preenchida só nos eventos que não podem repetir: 'signup:<user_id>' e
  -- 'purchase:<id da transação>'.
  idempotency_key text unique,
  created_at timestamptz not null default now()
);

create index if not exists conversion_events_name_created_idx
  on public.conversion_events (event_name, created_at);
create index if not exists conversion_events_user_idx
  on public.conversion_events (user_id);

alter table public.conversion_events enable row level security;
revoke all on public.conversion_events from anon, authenticated;

-- ============================================================
-- BLOCO 2 — administradores do painel (guarda só o id do usuário)
-- ============================================================
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;

-- ============================================================
-- BLOCO 3 — eventos vindos do navegador (via /api/analytics/track). Só os
-- 3 não críticos; signup_completed e purchase_completed são recusados.
-- ============================================================
create or replace function public.track_conversion_event(
  p_event_name text,
  p_plan text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Não autorizado';
  end if;
  if p_event_name not in ('paywall_viewed', 'plan_selected', 'checkout_started') then
    raise exception 'Evento não permitido';
  end if;
  if p_plan is not null and p_plan not in ('daily', 'pro', 'ultra') then
    raise exception 'Plano inválido';
  end if;
  if p_event_name in ('plan_selected', 'checkout_started') and p_plan is null then
    raise exception 'Plano obrigatório';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' or length(p_metadata::text) > 2000 then
    p_metadata := '{}'::jsonb;
  end if;

  -- Mesmo evento (e plano) do mesmo usuário em menos de 5s = duplicata
  -- (re-renderização, clique duplo).
  if exists (
    select 1 from public.conversion_events
    where user_id = v_user_id
      and event_name = p_event_name
      and plan is not distinct from p_plan
      and created_at > now() - interval '5 seconds'
  ) then
    return;
  end if;

  insert into public.conversion_events (user_id, event_name, plan, metadata)
  values (v_user_id, p_event_name, p_plan, p_metadata);
end;
$$;

revoke all on function public.track_conversion_event(text, text, jsonb) from public, anon;
grant execute on function public.track_conversion_event(text, text, jsonb) to authenticated;

-- ============================================================
-- BLOCO 4 — signup_completed: quando a conta passa a ter e-mail
-- confirmado (Google já nasce confirmado). Login não mexe em
-- email_confirmed_at, então não dispara; e a chave 'signup:<id>' garante
-- no máximo 1 registro por usuário.
--
-- TUDO (inclusive a condição) fica dentro do bloco com "exception": um
-- erro aqui só deixa de registrar o evento, nunca bloqueia o cadastro. O
-- valor antigo (old) só é lido em UPDATE — em INSERT ele não existe.
-- ============================================================
create or replace function public.track_signup_completed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_should_track boolean;
begin
  begin
    if tg_op = 'INSERT' then
      v_should_track := new.email_confirmed_at is not null;
    else
      v_should_track := new.email_confirmed_at is not null and old.email_confirmed_at is null;
    end if;

    if v_should_track then
      insert into public.conversion_events (user_id, event_name, metadata, idempotency_key)
      values (
        new.id,
        'signup_completed',
        jsonb_build_object('provider', coalesce(new.raw_app_meta_data ->> 'provider', 'email')),
        'signup:' || new.id::text
      )
      on conflict (idempotency_key) do nothing;
    end if;
  exception when others then
    raise warning 'track_signup_completed falhou: %', sqlerrm;
  end;
  return new;
end;
$$;

-- Função de gatilho: ninguém precisa chamá-la diretamente.
revoke all on function public.track_signup_completed() from public, anon, authenticated;

drop trigger if exists track_signup_completed on auth.users;
create trigger track_signup_completed
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.track_signup_completed();

-- ============================================================
-- BLOCO 5 — purchase_completed: quando uma assinatura fica ativa. Todos os
-- caminhos de liberação (webhook da Cakto, consulta à API da Cakto, compra
-- pendente, Stripe) terminam em apply_subscription_plan gravando em
-- subscriptions — este gatilho observa esse único ponto. Renovação
-- atualiza a mesma linha sem mudar o status, então não conta como compra
-- nova; a chave 'purchase:<id da transação>' impede duplicata.
--
-- TUDO (inclusive a condição) fica dentro do bloco com "exception": um
-- erro aqui só deixa de registrar o evento, nunca bloqueia a liberação do
-- plano. O valor antigo (old) só é lido em UPDATE.
-- ============================================================
create or replace function public.track_purchase_completed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_should_track boolean;
begin
  begin
    if tg_op = 'INSERT' then
      v_should_track := new.status = 'active';
    else
      v_should_track := new.status = 'active' and old.status is distinct from 'active';
    end if;

    if v_should_track then
      insert into public.conversion_events (user_id, event_name, plan, metadata, idempotency_key)
      values (
        new.user_id,
        'purchase_completed',
        case new.plan when 'diario' then 'daily' when 'pro' then 'pro' when 'ultra' then 'ultra' end,
        jsonb_build_object(
          'provider', case when new.stripe_subscription_id like 'cakto\_%' then 'cakto' else 'stripe' end,
          'transaction_id', new.stripe_subscription_id,
          'subscription_row_id', new.id
        ),
        'purchase:' || coalesce(new.stripe_subscription_id, new.id::text)
      )
      on conflict (idempotency_key) do nothing;
    end if;
  exception when others then
    raise warning 'track_purchase_completed falhou: %', sqlerrm;
  end;
  return new;
end;
$$;

-- Função de gatilho: ninguém precisa chamá-la diretamente.
revoke all on function public.track_purchase_completed() from public, anon, authenticated;

drop trigger if exists track_purchase_completed on public.subscriptions;
create trigger track_purchase_completed
  after insert or update of status on public.subscriptions
  for each row execute function public.track_purchase_completed();

-- ============================================================
-- BLOCO 6 — números do painel, só para administradores. Conta PESSOAS
-- únicas por etapa dentro do período (p_since nulo = todo o período).
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

-- ============================================================
-- BLOCO 7 — administradora. Troque SEU_EMAIL_AQUI pelo e-mail de login
-- SÓ na cópia colada no SQL Editor. Grava apenas o id do usuário.
-- ============================================================
insert into public.admin_users (user_id)
select id from auth.users where lower(email) = lower('SEU_EMAIL_AQUI')
on conflict (user_id) do nothing;

commit;
