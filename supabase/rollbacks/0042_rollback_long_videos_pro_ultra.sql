-- Desfaz a 0042: volta reserve_daily_video_slot e mark_video_caption_failed (versões
-- da 0041), sync_video_bonus (versão da 0033) e retry_video (versão da 0019), e remove
-- as funções de peso. A coluna videos.bonus_cost fica (inofensiva).
-- ATENÇÃO: depois de desfazer, um vídeo de 60s volta a contar como 1 no limite do dia.
-- Desligue LONG_VIDEOS_ENABLED na Vercel ANTES de rodar este arquivo.

begin;

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

    v_today_start := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
    v_today_end := v_today_start + interval '1 day';

    select count(*) into v_used_today
    from public.videos
    where user_id = v_user_id
      and created_at >= v_today_start
      and created_at < v_today_end
      and not caption_failed
      and (
        status = 'Pronto'
        or (status = 'Processando' and reserved_at > now() - interval '10 minutes')
      );

    if v_used_today >= v_daily_limit then
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
    update public.profiles set bonus_videos = bonus_videos + 1 where id = v.user_id;
  end if;
end;
$$;

create or replace function public.retry_video(
  p_video_id uuid
)
returns public.videos
language plpgsql
security definer set search_path = public
as $$
declare
  v_video public.videos;
begin
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

drop function if exists public.video_slot_cost(text);
drop function if exists public.video_is_long(text);

commit;
