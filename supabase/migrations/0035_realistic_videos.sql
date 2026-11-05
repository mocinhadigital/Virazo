-- Vídeo Realista ✨ — produto avulso, separado dos planos Diário/Pro/Ultra.
--
-- O que esta migration cria (nada do que já existe muda de comportamento):
-- 1. profiles.realistic_credits: saldo de "créditos realistas" (sem validade).
--    O cliente NÃO consegue editar o saldo pelo navegador (gatilho abaixo).
-- 2. series.realistic: marca a série cujos episódios são vídeos realistas.
-- 3. realistic_videos: um registro por vídeo realista (rascunho -> gerando ->
--    pronto/erro). Tabela PRÓPRIA: não entra na contagem do limite diário
--    (reserve_daily_video_slot só olha public.videos) nem na trava de gerações
--    simultâneas do plano.
-- 4. Funções do saldo, todas atômicas e só para o servidor (service_role):
--    - spend_realistic_credit: desconta 1 crédito e põe o vídeo em
--      'Processando' (só no clique em "Animar meu vídeo");
--    - fail_realistic_video: marca 'Erro' e DEVOLVE o crédito, uma única vez;
--    - mark_realistic_ready: marca 'Pronto';
--    - add_realistic_credits / remove_realistic_credits: compra / reembolso.
-- 5. expire_stale_realistic_videos: vídeo 'Processando' há mais de 10 minutos
--    vira 'Erro' e o crédito volta (rede de segurança se o servidor cair).
-- 6. cakto_pending_purchases passa a aceitar a ação 'credits' (compra feita
--    antes de a conta existir) e claim_cakto_pending_purchases a aplica.
--
-- Rode o arquivo inteiro de uma vez no SQL Editor do Supabase.

begin;

-- ============================================================
-- BLOCO 1 — saldo de créditos realistas
-- ============================================================
alter table public.profiles
  add column if not exists realistic_credits integer not null default 0 check (realistic_credits >= 0);

-- O navegador (authenticated/anon) nunca altera o saldo; só funções do
-- servidor (security definer / service_role).
create or replace function public.protect_profile_realistic_credits()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.realistic_credits := old.realistic_credits;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_realistic_credits on public.profiles;
create trigger profiles_protect_realistic_credits
  before update on public.profiles
  for each row execute function public.protect_profile_realistic_credits();

-- ============================================================
-- BLOCO 2 — série realista
-- ============================================================
alter table public.series add column if not exists realistic boolean not null default false;

-- ============================================================
-- BLOCO 3 — vídeos realistas
-- ============================================================
create table if not exists public.realistic_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  series_id uuid references public.series (id) on delete set null,
  mode text not null default 'guided' check (mode in ('guided', 'free', 'series')),
  title text not null,
  topic text not null,
  language text not null default 'pt' check (language in ('pt', 'en', 'es')),
  realistic_style text not null,
  voice text,
  captions_enabled boolean not null default true,
  caption_style text,
  background_music_id uuid,
  -- Roteiro: { title, scenes: [{ narration, imagePrompt, motionPrompt }] }
  script jsonb,
  -- Caminhos (bucket "videos") das 6 imagens da prévia, na ordem das cenas.
  scene_images jsonb,
  script_generations integer not null default 0,
  swaps_used integer not null default 0,
  status text not null default 'Rascunho' check (status in ('Rascunho', 'Processando', 'Pronto', 'Erro')),
  credit_spent boolean not null default false,
  credit_refunded boolean not null default false,
  video_url text,
  thumbnail_url text,
  error_message text,
  progress_stage text,
  progress_current integer,
  progress_total integer,
  reserved_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists realistic_videos_user_idx
  on public.realistic_videos (user_id, created_at desc);

alter table public.realistic_videos enable row level security;

-- Leitura: só os próprios vídeos não excluídos. Escrita: nenhuma pelo
-- navegador — tudo passa pelo servidor.
drop policy if exists "realistic_videos_select_own" on public.realistic_videos;
create policy "realistic_videos_select_own"
  on public.realistic_videos for select
  using (auth.uid() = user_id and deleted_at is null);

revoke insert, update, delete, truncate on public.realistic_videos from anon, authenticated;

-- ============================================================
-- BLOCO 4 — funções do saldo
-- ============================================================

-- Interna (sem checagem de papel; ninguém tem permissão de executar): marca
-- 'Erro' e devolve o crédito UMA vez. Só age em vídeo 'Processando'.
create or replace function public.realistic_fail_internal(p_video_id uuid, p_message text)
returns public.realistic_videos
language plpgsql
security definer set search_path = public
as $$
declare
  v public.realistic_videos;
begin
  select * into v from public.realistic_videos where id = p_video_id for update;
  if v.id is null then
    raise exception 'Vídeo realista não encontrado';
  end if;
  if v.status <> 'Processando' then
    return v;
  end if;

  if v.credit_spent and not v.credit_refunded then
    update public.profiles set realistic_credits = realistic_credits + 1 where id = v.user_id;
  end if;

  update public.realistic_videos
  set status = 'Erro',
      error_message = p_message,
      credit_refunded = credit_spent,
      progress_stage = null,
      progress_current = null,
      progress_total = null
  where id = p_video_id
  returning * into v;

  return v;
end;
$$;

revoke all on function public.realistic_fail_internal(uuid, text) from public, anon, authenticated, service_role;

-- Gasta 1 crédito e começa a gerar. Atômica: trava por usuário (clique
-- duplo / duas abas não gastam duas vezes) e o saldo nunca fica negativo.
create or replace function public.spend_realistic_credit(p_video_id uuid, p_user_id uuid)
returns public.realistic_videos
language plpgsql
security definer set search_path = public
as $$
declare
  v public.realistic_videos;
  v_rows integer;
  v_in_progress integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Não autorizado';
  end if;

  perform pg_advisory_xact_lock(hashtext('realistic:' || p_user_id::text));

  select * into v
  from public.realistic_videos
  where id = p_video_id and user_id = p_user_id and deleted_at is null
  for update;

  if v.id is null then
    raise exception 'Vídeo realista não encontrado';
  end if;

  if v.status not in ('Rascunho', 'Erro') or (v.credit_spent and not v.credit_refunded) then
    raise exception 'already_started: este vídeo já está sendo gerado ou já foi concluído.';
  end if;

  -- Proteção de custo: no máximo 2 vídeos realistas gerando ao mesmo tempo
  -- por usuário (reservas antigas, de servidor que caiu, não contam).
  select count(*) into v_in_progress
  from public.realistic_videos
  where user_id = p_user_id
    and status = 'Processando'
    and reserved_at > now() - interval '10 minutes';
  if v_in_progress >= 2 then
    raise exception 'too_many_in_progress: você já tem 2 vídeos realistas sendo gerados. Aguarde um terminar.';
  end if;

  update public.profiles
  set realistic_credits = realistic_credits - 1
  where id = p_user_id and realistic_credits > 0;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception 'no_realistic_credits: você não tem créditos realistas. Compre um pacote para continuar.';
  end if;

  update public.realistic_videos
  set status = 'Processando',
      credit_spent = true,
      credit_refunded = false,
      error_message = null,
      video_url = null,
      thumbnail_url = null,
      progress_stage = null,
      progress_current = null,
      progress_total = null,
      reserved_at = now()
  where id = p_video_id
  returning * into v;

  return v;
end;
$$;

revoke all on function public.spend_realistic_credit(uuid, uuid) from public, anon, authenticated;
grant execute on function public.spend_realistic_credit(uuid, uuid) to service_role;

create or replace function public.fail_realistic_video(p_video_id uuid, p_message text)
returns public.realistic_videos
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Não autorizado';
  end if;
  return public.realistic_fail_internal(p_video_id, p_message);
end;
$$;

revoke all on function public.fail_realistic_video(uuid, text) from public, anon, authenticated;
grant execute on function public.fail_realistic_video(uuid, text) to service_role;

create or replace function public.mark_realistic_ready(
  p_video_id uuid,
  p_video_url text,
  p_thumbnail_url text
)
returns public.realistic_videos
language plpgsql
security definer set search_path = public
as $$
declare
  v public.realistic_videos;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Não autorizado';
  end if;

  update public.realistic_videos
  set status = 'Pronto',
      video_url = p_video_url,
      thumbnail_url = p_thumbnail_url,
      error_message = null,
      progress_stage = null,
      progress_current = null,
      progress_total = null
  where id = p_video_id and status = 'Processando'
  returning * into v;

  if v.id is null then
    raise exception 'Vídeo realista não está mais em geração (expirou?)';
  end if;
  return v;
end;
$$;

revoke all on function public.mark_realistic_ready(uuid, text, text) from public, anon, authenticated;
grant execute on function public.mark_realistic_ready(uuid, text, text) to service_role;

-- Compra aprovada: soma créditos (devolve o saldo novo).
create or replace function public.add_realistic_credits(p_user_id uuid, p_amount integer)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_balance integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Não autorizado';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Quantidade inválida';
  end if;

  update public.profiles
  set realistic_credits = realistic_credits + p_amount
  where id = p_user_id
  returning realistic_credits into v_balance;

  if v_balance is null then
    raise exception 'Perfil não encontrado';
  end if;
  return v_balance;
end;
$$;

revoke all on function public.add_realistic_credits(uuid, integer) from public, anon, authenticated;
grant execute on function public.add_realistic_credits(uuid, integer) to service_role;

-- Reembolso de pacote: tira os créditos (nunca abaixo de zero).
create or replace function public.remove_realistic_credits(p_user_id uuid, p_amount integer)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_balance integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Não autorizado';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Quantidade inválida';
  end if;

  update public.profiles
  set realistic_credits = greatest(realistic_credits - p_amount, 0)
  where id = p_user_id
  returning realistic_credits into v_balance;

  return coalesce(v_balance, 0);
end;
$$;

revoke all on function public.remove_realistic_credits(uuid, integer) from public, anon, authenticated;
grant execute on function public.remove_realistic_credits(uuid, integer) to service_role;

-- ============================================================
-- BLOCO 5 — rede de segurança: geração travada há mais de 10 minutos
-- ============================================================
create or replace function public.expire_stale_realistic_videos(p_user_id uuid default null)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  if auth.uid() is not null then
    p_user_id := auth.uid();
  elsif auth.role() <> 'service_role' then
    raise exception 'Não autorizado';
  end if;

  for v_id in
    select id
    from public.realistic_videos
    where status = 'Processando'
      and coalesce(reserved_at, created_at) < now() - interval '10 minutes'
      and (p_user_id is null or user_id = p_user_id)
  loop
    perform public.realistic_fail_internal(
      v_id,
      'A geração passou de 10 minutos e foi interrompida. Seu crédito realista foi devolvido — é só tentar de novo.'
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.expire_stale_realistic_videos(uuid) from public, anon;
grant execute on function public.expire_stale_realistic_videos(uuid) to authenticated, service_role;

-- "Excluir" só esconde o vídeo da tela do cliente.
create or replace function public.delete_my_realistic_video(p_video_id uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Não autorizado';
  end if;

  update public.realistic_videos
  set deleted_at = coalesce(deleted_at, now())
  where id = p_video_id
    and user_id = auth.uid()
    and status <> 'Processando';

  return found;
end;
$$;

revoke all on function public.delete_my_realistic_video(uuid) from public, anon;
grant execute on function public.delete_my_realistic_video(uuid) to authenticated;

-- ============================================================
-- BLOCO 6 — compras de créditos feitas antes de a conta existir
-- ============================================================
alter table public.cakto_pending_purchases add column if not exists credits integer;

do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.cakto_pending_purchases'::regclass
      and contype = 'c'
  loop
    execute format('alter table public.cakto_pending_purchases drop constraint %I', r.conname);
  end loop;
end;
$$;

alter table public.cakto_pending_purchases
  add constraint cakto_pending_purchases_action_check
  check (action in ('activate', 'deactivate', 'credits'));

alter table public.cakto_pending_purchases
  add constraint cakto_pending_purchases_plan_check
  check (plan is null or plan in ('diario', 'pro', 'ultra'));

alter table public.cakto_pending_purchases
  add constraint cakto_pending_purchases_shape_check
  check (
    (action = 'activate' and plan is not null)
    or action = 'deactivate'
    or (action = 'credits' and credits is not null and credits > 0)
  );

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
    elsif v_row.action = 'credits' then
      perform public.add_realistic_credits(p_user_id, v_row.credits);
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
