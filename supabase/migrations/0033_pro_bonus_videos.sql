-- Bônus do plano Pro: +10 vídeos, UMA vez por usuário.
--
-- Como funciona (o app não gasta crédito por vídeo desde a 0019: o acesso é
-- assinatura ativa + limite diário do plano; profiles.credits é só resquício):
-- - profiles.bonus_videos: saldo de vídeos de bônus (começa em 0; o Pro ganha 10).
-- - profiles.bonus_pro_recebido: já recebeu o bônus? (nunca recebe de novo, nem
--   em renovação, nem cancelando e assinando outra vez).
-- - O bônus é usado QUANDO O LIMITE DIÁRIO JÁ ACABOU: o vídeo seguinte é gerado
--   gastando 1 do saldo (reserve_daily_video_slot). Sem prazo de validade.
-- - Se um vídeo de bônus FALHAR, o saldo volta (e é gasto de novo se ele for
--   refeito) — igual à vaga diária, que também só conta vídeo pronto.
-- - A entrega do bônus é um gatilho em subscriptions: vale para qualquer caminho
--   que ative o Pro (webhook da Cakto, verificação de pagamento, compra
--   pendente aplicada depois, upgrade do Diário para o Pro).
--
-- Diário e Ultra não mudam: quem tem saldo 0 segue exatamente a regra de antes.
-- Rode o arquivo inteiro de uma vez no SQL Editor do Supabase.

begin;

-- ============================================================
-- BLOCO 1 — colunas novas
-- ============================================================
alter table public.profiles
  add column if not exists bonus_pro_recebido boolean not null default false,
  add column if not exists bonus_videos integer not null default 0 check (bonus_videos >= 0);

alter table public.videos
  add column if not exists used_bonus boolean not null default false,
  add column if not exists bonus_refunded boolean not null default false;

-- Quem JÁ tem (ou já teve) uma assinatura Pro assinou antes da promoção: fica
-- marcado como "já recebeu" e NÃO ganha o bônus numa renovação. (Para dar o
-- bônus a algum deles, é só zerar bonus_pro_recebido e somar 10 em bonus_videos
-- daquela conta.)
update public.profiles
set bonus_pro_recebido = true
where id in (select user_id from public.subscriptions where plan = 'pro');

-- ============================================================
-- BLOCO 2 — entrega do bônus (gatilho em subscriptions)
-- Dispara quando uma assinatura vira Pro+ativa: criação, troca de plano
-- (Diário -> Pro) ou reativação. Renovação (mesmo plano e status) não dispara.
-- O "where bonus_pro_recebido = false" torna a entrega atômica: dois avisos
-- ao mesmo tempo não entregam duas vezes.
-- ============================================================
create or replace function public.grant_pro_bonus()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.plan = 'pro'
     and new.status = 'active'
     and (tg_op = 'INSERT' or old.plan is distinct from new.plan or old.status is distinct from new.status)
  then
    update public.profiles
    set bonus_videos = bonus_videos + 10,
        bonus_pro_recebido = true
    where id = new.user_id
      and bonus_pro_recebido = false;
  end if;
  return null;
end;
$$;

revoke all on function public.grant_pro_bonus() from public, anon, authenticated;

drop trigger if exists subscriptions_grant_pro_bonus on public.subscriptions;
create trigger subscriptions_grant_pro_bonus
  after insert or update of plan, status on public.subscriptions
  for each row execute function public.grant_pro_bonus();

-- ============================================================
-- BLOCO 3 — o usuário NÃO pode editar o saldo nem as marcas do bônus
-- (hoje ele consegue atualizar o próprio perfil e os próprios vídeos direto
-- pela API; estas colunas só mudam por funções do servidor).
-- Dentro das funções "security definer" o current_user é o dono do banco, por
-- isso elas passam; um UPDATE vindo do navegador (authenticated/anon) não.
-- ============================================================
create or replace function public.protect_profile_bonus()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.bonus_videos := old.bonus_videos;
    new.bonus_pro_recebido := old.bonus_pro_recebido;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_bonus on public.profiles;
create trigger profiles_protect_bonus
  before update on public.profiles
  for each row execute function public.protect_profile_bonus();

-- Vídeo: devolve o saldo quando o servidor marca a geração como falha e gasta
-- de novo quando ela é refeita. Edição vinda do navegador nunca mexe nisso.
-- (Sem "security definer" de propósito: assim o current_user é quem fez o
-- UPDATE — o navegador, ou uma função do servidor que roda como dono.)
create or replace function public.sync_video_bonus()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_client boolean := current_user in ('authenticated', 'anon');
begin
  if v_client then
    new.used_bonus := old.used_bonus;
    new.bonus_refunded := old.bonus_refunded;
    return new;
  end if;

  if old.used_bonus then
    if new.status = 'Erro' and old.status is distinct from 'Erro' and not old.bonus_refunded then
      update public.profiles set bonus_videos = bonus_videos + 1 where id = new.user_id;
      new.bonus_refunded := true;
    elsif old.status = 'Erro' and new.status is distinct from 'Erro' and old.bonus_refunded then
      update public.profiles set bonus_videos = greatest(bonus_videos - 1, 0) where id = new.user_id;
      new.bonus_refunded := false;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_video_bonus() from public, anon, authenticated;

drop trigger if exists videos_sync_bonus on public.videos;
create trigger videos_sync_bonus
  before update on public.videos
  for each row execute function public.sync_video_bonus();

-- ============================================================
-- BLOCO 4 — reserva da vaga: usa o bônus quando o limite diário acabou.
-- É a versão da 0030 (admin sem limite) + o ramo do bônus. Assinatura e
-- permissões idênticas.
-- ============================================================
create or replace function public.reserve_daily_video_slot(
  p_title text,
  p_topic text,
  p_style text,
  p_duration text,
  p_voice text,
  p_captions_enabled boolean,
  p_caption_style text,
  p_gradient text,
  p_visual_style text default null,
  p_background_music_id uuid default null,
  p_series_id uuid default null,
  p_user_id uuid default null
)
returns public.videos
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid;
  v_is_admin boolean;
  v_plan text;
  v_daily_limit integer;
  v_today_start timestamptz;
  v_today_end timestamptz;
  v_used_today integer;
  v_use_bonus boolean := false;
  v_bonus_rows integer;
  v_video public.videos;
begin
  if auth.uid() is not null then
    v_user_id := auth.uid();
  elsif auth.role() = 'service_role' then
    v_user_id := p_user_id;
  else
    raise exception 'Não autorizado';
  end if;

  if v_user_id is null then
    raise exception 'Usuário não identificado';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  select exists (select 1 from public.admin_users where user_id = v_user_id)
  into v_is_admin;

  if not v_is_admin then
    select plan into v_plan
    from public.subscriptions
    where user_id = v_user_id and status = 'active'
    order by created_at desc
    limit 1;

    if v_plan is null then
      raise exception 'no_subscription: assinatura ativa necessária para gerar vídeos.';
    end if;

    v_daily_limit := case v_plan
      when 'diario' then 1
      when 'pro' then 2
      when 'ultra' then 3
      else 0
    end;

    v_today_start := date_trunc('day', now() at time zone 'America/Manaus') at time zone 'America/Manaus';
    v_today_end := v_today_start + interval '1 day';

    select count(*) into v_used_today
    from public.videos
    where user_id = v_user_id
      and created_at >= v_today_start
      and created_at < v_today_end
      and (
        status = 'Pronto'
        or (status = 'Processando' and reserved_at > now() - interval '10 minutes')
      );

    if v_used_today >= v_daily_limit then
      -- Limite do dia acabou: usa 1 vídeo de bônus, se houver saldo.
      update public.profiles
      set bonus_videos = bonus_videos - 1
      where id = v_user_id and bonus_videos > 0;
      get diagnostics v_bonus_rows = row_count;

      if v_bonus_rows = 0 then
        raise exception 'daily_limit_reached: limite diário de vídeos atingido para o seu plano.';
      end if;
      v_use_bonus := true;
    end if;
  end if;

  insert into public.videos (
    user_id, series_id, title, topic, style, duration, voice,
    captions_enabled, caption_style, status, gradient, visual_style, background_music_id, reserved_at,
    used_bonus
  ) values (
    v_user_id, p_series_id, p_title, p_topic, p_style, p_duration, p_voice,
    p_captions_enabled, p_caption_style, 'Processando', p_gradient, p_visual_style, p_background_music_id, now(),
    v_use_bonus
  )
  returning * into v_video;

  return v_video;
end;
$$;

commit;
