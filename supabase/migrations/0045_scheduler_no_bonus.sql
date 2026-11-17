-- Bônus do Pro só em clique do cliente: o agendador automático das séries NÃO gasta o bônus.
--
-- O que muda (nada apaga nem gera vídeo):
-- 1. reserve_daily_video_slot ganha o parâmetro p_allow_bonus (padrão true = comportamento de hoje).
--    O agendador passa false: quando o limite do dia acaba, recusa com "daily_limit_reached" em vez
--    de gastar o bônus. O clique do cliente (vídeo avulso, "Gerar agora", "Tentar de novo") continua
--    podendo usar o bônus.
-- 2. A versão antiga (12 parâmetros) é APAGADA para não existir duas funções com o mesmo nome
--    (o Postgres ficaria ambíguo). O código atual continua funcionando depois desta migration,
--    pois o parâmetro novo tem valor padrão.

begin;

drop function if exists public.reserve_daily_video_slot(
  text, text, text, text, text, boolean, text, text, text, uuid, uuid, uuid
);

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
  p_user_id uuid default null,
  p_allow_bonus boolean default true
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
      -- O agendador das séries chama com p_allow_bonus = false: série automática usa SÓ o limite do dia.
      -- Só o clique do próprio cliente (p_allow_bonus = true, o padrão) pode gastar o bônus.
      if not p_allow_bonus then
        raise exception 'daily_limit_reached: limite diário de vídeos atingido para o seu plano.';
      end if;
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

revoke all on function public.reserve_daily_video_slot(
  text, text, text, text, text, boolean, text, text, text, uuid, uuid, uuid, boolean
) from public;
grant execute on function public.reserve_daily_video_slot(
  text, text, text, text, text, boolean, text, text, text, uuid, uuid, uuid, boolean
) to authenticated, service_role;

commit;
