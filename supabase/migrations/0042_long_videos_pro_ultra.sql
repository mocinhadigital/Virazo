-- Vídeos de 60 segundos só para os planos Pro e Ultra, SEM mudar preços.
--
-- Regras (todas aplicadas aqui, no banco, para não dar para burlar pela tela):
-- 1. Vídeo de 60s conta como 2 vídeos do limite do dia; 30s e 15s contam 1.
--    (90s, que o app não oferece, contaria 3 e também exige Pro/Ultra.)
-- 2. Plano Diário pedindo 60s é recusado:
--      long_video_not_allowed: Vídeos de 60s disponíveis nos planos Pro e Ultra.
-- 3. Sobrando só 1 vídeo no dia, o 60s é recusado:
--      not_enough_slots: Você precisa de 2 vídeos disponíveis para gerar um de 60s.
-- 4. Bônus do Pro: quando o limite do dia já acabou, o 60s gasta 2 do saldo
--    (1 vídeo de 30s continua gastando 1). Se o vídeo falhar, devolve o que gastou.
--    Para isso, videos.bonus_cost guarda quanto cada vídeo gastou de bônus.
-- 5. "Tentar de novo" num vídeo de 60s exige plano Pro/Ultra e 2 vagas livres no
--    dia (quando o vídeo não foi pago com bônus). Para 30s nada muda.
-- 6. Vídeo que sai sem legenda por falha da Groq devolve o bônus que gastou
--    (1 ou 2) e libera as vagas do dia (já era assim, agora respeitando o peso).
-- Admin continua sem limite e sem plano. Preços, Cakto e Vídeo Realista não são
-- tocados.
--
-- Não apaga nem altera nenhum vídeo: só preenche bonus_cost = 1 nos vídeos que
-- já tinham gastado 1 de bônus. Rode o arquivo inteiro de uma vez no SQL Editor
-- do Supabase ANTES de ligar LONG_VIDEOS_ENABLED. Para desfazer: rode
-- supabase/rollbacks/0042_rollback_long_videos_pro_ultra.sql.

begin;

-- ============================================================
-- BLOCO 1 — quanto cada vídeo gastou de bônus
-- ============================================================
alter table public.videos add column if not exists bonus_cost integer not null default 0;

update public.videos set bonus_cost = 1 where used_bonus and bonus_cost = 0;

-- O usuário não edita isso pelo navegador (mesma proteção das outras marcas do
-- bônus; a migration 0034 já impede escrita direta em videos, e este gatilho
-- cobre também o bonus_cost). Reescreve sync_video_bonus (versão da 0033) para
-- devolver / gastar bonus_cost em vez de sempre 1.
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
    new.bonus_cost := old.bonus_cost;
    return new;
  end if;

  if old.used_bonus then
    if new.status = 'Erro' and old.status is distinct from 'Erro' and not old.bonus_refunded then
      update public.profiles set bonus_videos = bonus_videos + greatest(old.bonus_cost, 1) where id = new.user_id;
      new.bonus_refunded := true;
    elsif old.status = 'Erro' and new.status is distinct from 'Erro' and old.bonus_refunded then
      update public.profiles set bonus_videos = greatest(bonus_videos - greatest(old.bonus_cost, 1), 0) where id = new.user_id;
      new.bonus_refunded := false;
    end if;
  end if;
  return new;
end;
$$;

-- ============================================================
-- BLOCO 2 — peso de cada duração no limite do dia
-- ============================================================
create or replace function public.video_slot_cost(p_duration text)
returns integer
language sql
immutable
as $$
  select case p_duration when '60s' then 2 when '90s' then 3 else 1 end;
$$;

create or replace function public.video_is_long(p_duration text)
returns boolean
language sql
immutable
as $$
  select p_duration in ('60s', '90s');
$$;

-- ============================================================
-- BLOCO 3 — reserva da vaga (versão da 0041 + peso + regra do 60s)
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
  v_cost integer := public.video_slot_cost(p_duration);
  v_use_bonus boolean := false;
  v_bonus_rows integer;
  v_bonus_balance integer;
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

    if public.video_is_long(p_duration) and v_plan not in ('pro', 'ultra') then
      raise exception 'long_video_not_allowed: Vídeos de 60s disponíveis nos planos Pro e Ultra.';
    end if;

    v_daily_limit := case v_plan
      when 'diario' then 1
      when 'pro' then 2
      when 'ultra' then 3
      else 0
    end;

    v_today_start := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
    v_today_end := v_today_start + interval '1 day';

    select coalesce(sum(public.video_slot_cost(duration)), 0) into v_used_today
    from public.videos
    where user_id = v_user_id
      and created_at >= v_today_start
      and created_at < v_today_end
      and not caption_failed -- vídeo que saiu sem legenda por falha da Groq não gasta a vaga do dia
      and (
        status = 'Pronto'
        or (status = 'Processando' and reserved_at > now() - interval '10 minutes')
      );

    if v_used_today >= v_daily_limit then
      -- Limite do dia acabou: usa o bônus (1 por vídeo de 30s, 2 por vídeo de 60s).
      update public.profiles
      set bonus_videos = bonus_videos - v_cost
      where id = v_user_id and bonus_videos >= v_cost;
      get diagnostics v_bonus_rows = row_count;

      if v_bonus_rows = 0 then
        select bonus_videos into v_bonus_balance from public.profiles where id = v_user_id;
        if v_cost > 1 and coalesce(v_bonus_balance, 0) > 0 then
          raise exception 'not_enough_slots: Você precisa de 2 vídeos disponíveis para gerar um de 60s.';
        end if;
        raise exception 'daily_limit_reached: limite diário de vídeos atingido para o seu plano.';
      end if;
      v_use_bonus := true;
    elsif v_used_today + v_cost > v_daily_limit then
      -- Sobra menos vagas do que o vídeo precisa (só acontece com o 60s).
      raise exception 'not_enough_slots: Você precisa de 2 vídeos disponíveis para gerar um de 60s.';
    end if;
  end if;

  insert into public.videos (
    user_id, series_id, title, topic, style, duration, voice,
    captions_enabled, caption_style, status, gradient, visual_style, background_music_id, reserved_at,
    used_bonus, bonus_cost
  ) values (
    v_user_id, p_series_id, p_title, p_topic, p_style, p_duration, p_voice,
    p_captions_enabled, p_caption_style, 'Processando', p_gradient, p_visual_style, p_background_music_id, now(),
    v_use_bonus, case when v_use_bonus then v_cost else 0 end
  )
  returning * into v_video;

  return v_video;
end;
$$;

-- ============================================================
-- BLOCO 4 — vídeo sem legenda por falha da Groq devolve o bônus gasto
-- (versão da 0041; só muda "+ 1" para "+ bonus_cost")
-- ============================================================
create or replace function public.mark_video_caption_failed(p_video_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v public.videos;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Não autorizado';
  end if;

  select * into v from public.videos where id = p_video_id for update;
  if v.id is null or v.caption_failed then
    return;
  end if;

  update public.videos
  set caption_failed = true,
      bonus_refunded = case when v.used_bonus then true else v.bonus_refunded end
  where id = p_video_id;

  if v.used_bonus and not v.bonus_refunded then
    update public.profiles set bonus_videos = bonus_videos + greatest(v.bonus_cost, 1) where id = v.user_id;
  end if;
end;
$$;

-- ============================================================
-- BLOCO 5 — "Tentar de novo": 60s exige Pro/Ultra e 2 vagas livres
-- (versão da 0019 + checagem só para vídeo longo; 30s/15s idênticos a antes)
-- ============================================================
create or replace function public.retry_video(
  p_video_id uuid
)
returns public.videos
language plpgsql
security definer set search_path = public
as $$
declare
  v_video public.videos;
  v_existing public.videos;
  v_plan text;
  v_daily_limit integer;
  v_today_start timestamptz;
  v_today_end timestamptz;
  v_used_today integer;
begin
  select * into v_existing
  from public.videos
  where id = p_video_id and user_id = auth.uid() and status = 'Erro'
  for update;

  if v_existing.id is null then
    raise exception 'Vídeo não encontrado ou não está com status de falha (outra tentativa já em andamento?).';
  end if;

  if public.video_is_long(v_existing.duration)
     and not exists (select 1 from public.admin_users where user_id = auth.uid()) then
    select plan into v_plan
    from public.subscriptions
    where user_id = auth.uid() and status = 'active'
    order by created_at desc
    limit 1;

    if v_plan is null then
      raise exception 'no_subscription: assinatura ativa necessária para gerar vídeos.';
    end if;
    if v_plan not in ('pro', 'ultra') then
      raise exception 'long_video_not_allowed: Vídeos de 60s disponíveis nos planos Pro e Ultra.';
    end if;

    -- Pago com bônus: o gatilho sync_video_bonus gasta o bônus de novo. Pago com
    -- o limite do dia: precisa de 2 vagas livres hoje (o vídeo com falha não conta).
    if not v_existing.used_bonus then
      v_daily_limit := case v_plan when 'pro' then 2 when 'ultra' then 3 else 0 end;
      v_today_start := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
      v_today_end := v_today_start + interval '1 day';

      perform pg_advisory_xact_lock(hashtext(auth.uid()::text));

      select coalesce(sum(public.video_slot_cost(duration)), 0) into v_used_today
      from public.videos
      where user_id = auth.uid()
        and created_at >= v_today_start
        and created_at < v_today_end
        and not caption_failed
        and (
          status = 'Pronto'
          or (status = 'Processando' and reserved_at > now() - interval '10 minutes')
        );

      if v_used_today + public.video_slot_cost(v_existing.duration) > v_daily_limit then
        raise exception 'not_enough_slots: Você precisa de 2 vídeos disponíveis para gerar um de 60s.';
      end if;
    end if;
  end if;

  update public.videos
  set status = 'Processando',
      error_message = null,
      video_url = null,
      thumbnail_url = null,
      reserved_at = now()
  where id = p_video_id
    and user_id = auth.uid()
    and status = 'Erro'
  returning * into v_video;

  if v_video is null then
    raise exception 'Vídeo não encontrado ou não está com status de falha (outra tentativa já em andamento?).';
  end if;

  return v_video;
end;
$$;

revoke all on function public.retry_video(uuid) from public;
grant execute on function public.retry_video(uuid) to authenticated;

commit;
