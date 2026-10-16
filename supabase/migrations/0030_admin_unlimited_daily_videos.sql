-- Contas de administrador (public.admin_users) geram vídeos sem limite diário
-- e sem exigir assinatura ativa — para testar o app. Clientes (quem NÃO está
-- em admin_users) seguem exatamente como antes: assinatura ativa obrigatória
-- e limite de 1/2/3 vídeos por dia conforme o plano.
--
-- Rode este arquivo no SQL Editor do Supabase (create or replace; a assinatura
-- e os grants são os mesmos da migration 0019, então nada mais muda).

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
      raise exception 'daily_limit_reached: limite diário de vídeos atingido para o seu plano.';
    end if;
  end if;

  insert into public.videos (
    user_id, series_id, title, topic, style, duration, voice,
    captions_enabled, caption_style, status, gradient, visual_style, background_music_id, reserved_at
  ) values (
    v_user_id, p_series_id, p_title, p_topic, p_style, p_duration, p_voice,
    p_captions_enabled, p_caption_style, 'Processando', p_gradient, p_visual_style, p_background_music_id, now()
  )
  returning * into v_video;

  return v_video;
end;
$$;

-- ============================================================
-- Administradores — contas de teste. Só grava o id do usuário. A conta precisa
-- já existir (ter feito login/cadastro uma vez); e-mail sem conta é ignorado.
-- ============================================================
insert into public.admin_users (user_id)
select id from auth.users
where lower(email) in ('mocinhadigital@gmail.com', 'italoeandreiavip33@gmail.com')
on conflict (user_id) do nothing;

-- Conferência: deve listar as contas que existem.
select u.email, a.created_at
from public.admin_users a
join auth.users u on u.id = a.user_id;
