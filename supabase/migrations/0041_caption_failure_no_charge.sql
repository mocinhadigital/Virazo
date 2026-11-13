-- Vídeo que sai SEM LEGENDA por falha da Groq não pode ser cobrado do cliente.
--
-- Quando a Groq (legendas) continua falhando depois de várias tentativas, o vídeo
-- é entregue sem legenda. Para o cliente não pagar por isso:
--  - videos.caption_failed marca o vídeo. reserve_daily_video_slot passa a
--    IGNORAR esses vídeos na contagem do dia (a vaga volta) — igual à 0040, só
--    com "and not caption_failed".
--  - mark_video_caption_failed (só servidor): marca o vídeo e, se ele tinha gasto
--    1 vídeo de bônus, devolve o bônus (uma vez só).
--  - mark_realistic_caption_failed (só servidor): idem para vídeo realista,
--    devolvendo os créditos realistas (credit_cost) uma vez.
--  - alert_throttle: guarda quando o último aviso por e-mail foi enviado, para o
--    admin receber no máximo 1 por hora do mesmo tipo (claim_alert).
-- Não altera nenhum vídeo existente. Rode o arquivo inteiro de uma vez no SQL
-- Editor do Supabase.

begin;

alter table public.videos add column if not exists caption_failed boolean not null default false;
alter table public.realistic_videos add column if not exists caption_failed boolean not null default false;

-- ============================================================
-- BLOCO 1 — vaga do dia: ignora vídeos que saíram sem legenda por falha da Groq
-- (versão da 0040 + "and not caption_failed"; assinatura e permissões iguais)
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

    v_today_start := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
    v_today_end := v_today_start + interval '1 day';

    select count(*) into v_used_today
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

-- ============================================================
-- BLOCO 2 — marcar vídeo normal sem legenda: libera a vaga e devolve o bônus
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

  -- Só marca (a vaga volta pela contagem). Se o vídeo gastou 1 de bônus, devolve.
  update public.videos
  set caption_failed = true,
      bonus_refunded = case when v.used_bonus then true else v.bonus_refunded end
  where id = p_video_id;

  if v.used_bonus and not v.bonus_refunded then
    update public.profiles set bonus_videos = bonus_videos + 1 where id = v.user_id;
  end if;
end;
$$;

revoke all on function public.mark_video_caption_failed(uuid) from public, anon, authenticated;
grant execute on function public.mark_video_caption_failed(uuid) to service_role;

-- ============================================================
-- BLOCO 3 — vídeo realista sem legenda: devolve os créditos realistas
-- ============================================================
create or replace function public.mark_realistic_caption_failed(p_video_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v public.realistic_videos;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Não autorizado';
  end if;

  select * into v from public.realistic_videos where id = p_video_id for update;
  if v.id is null or v.caption_failed then
    return;
  end if;

  if v.credit_spent and not v.credit_refunded then
    update public.profiles set realistic_credits = realistic_credits + v.credit_cost where id = v.user_id;
  end if;

  update public.realistic_videos
  set caption_failed = true,
      credit_refunded = credit_spent
  where id = p_video_id;
end;
$$;

revoke all on function public.mark_realistic_caption_failed(uuid) from public, anon, authenticated;
grant execute on function public.mark_realistic_caption_failed(uuid) to service_role;

-- ============================================================
-- BLOCO 4 — aviso ao admin sem repetir e-mail: 1 por hora por tipo
-- ============================================================
create table if not exists public.alert_throttle (
  key text primary key,
  last_at timestamptz not null default now()
);
alter table public.alert_throttle enable row level security;
revoke all on public.alert_throttle from anon, authenticated;

-- true = pode enviar agora (e já registra o envio); false = já avisou há pouco.
create or replace function public.claim_alert(p_key text, p_cooldown_minutes integer default 60)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_rows integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Não autorizado';
  end if;

  insert into public.alert_throttle (key, last_at) values (p_key, now())
  on conflict (key) do update set last_at = now()
    where public.alert_throttle.last_at < now() - make_interval(mins => p_cooldown_minutes);
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function public.claim_alert(text, integer) from public, anon, authenticated;
grant execute on function public.claim_alert(text, integer) to service_role;

commit;
