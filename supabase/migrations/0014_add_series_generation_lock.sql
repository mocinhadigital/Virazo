-- Bug: a mesma série podia ser processada por mais de uma execução ao mesmo
-- tempo (cron `run-scheduled`, botão "Gerar agora", clique duplicado), e
-- cada execução criava seu próprio vídeo — resultado: vídeos duplicados com
-- o mesmo título (nome da série + data do dia). A causa raiz não era o
-- wizard "Criar série" (confirmado por teste real: 1 clique = 1 request =
-- 0 vídeos, a série só fica "devida" depois), e sim a falta de uma trava
-- atômica no início do pipeline de geração (src/lib/series/generate.ts).
--
-- Esta migration adiciona:
-- 1. Uma coluna de lock (`generation_locked_at`) em `series`.
-- 2. `claim_series_for_generation`: reivindica a série atomicamente (UPDATE
--    condicional) antes de qualquer criação de vídeo. Só uma chamada
--    concorrente consegue; as demais recebem exceção "já em processamento"
--    sem criar vídeo nem gastar crédito. Lock expira sozinho depois de
--    `p_stale_seconds` (default 600s = 10min, acima do maxDuration=300s das
--    rotas) — se o processo morrer no meio, a série não fica travada pra
--    sempre.
-- 3. `create_series_video_and_consume_credit`: cria o vídeo já com
--    `series_id` preenchido no mesmo INSERT que consome o crédito (corrige
--    o problema separado do `series_id` ficando órfão quando o UPDATE
--    posterior falhava silenciosamente) e com status inicial 'Processando'
--    (não 'Pronto' — mantém o comportamento correto já usado em
--    mark_video_ready/refund_credit_and_mark_error). É uma função NOVA,
--    dedicada à geração por série — não altera `create_video_and_consume_credit`,
--    que continua servindo só a criação manual avulsa de vídeo.
-- 4. `mark_video_ready`, `refund_credit_and_mark_error` e
--    `record_series_generation` ganham um parâmetro opcional `p_user_id`
--    (default null, 100% compatível com todas as chamadas existentes) —
--    necessário porque o cron chama essas funções com um cliente
--    service-role (sem sessão de usuário), onde `auth.uid()` é sempre nulo;
--    nesse caso a função usa `p_user_id` (confiável só quando o chamador
--    realmente é o service_role). Quando existe uma sessão de usuário real
--    (Gerar agora, retry, criação avulsa), `auth.uid()` continua sendo usado
--    e `p_user_id` é ignorado — nenhum comportamento existente muda.
-- 5. `record_series_generation` agora também libera o lock (zera
--    `generation_locked_at`) em QUALQUER status, e em caso de erro reagenda
--    `next_generation_at` para daqui a 1 hora (em vez de deixar a série
--    imediatamente "devida" de novo, o que faria o cron tentar de novo sem
--    parar a cada execução).
--
-- Rode cada bloco em sequência no SQL Editor do Supabase.

-- ============================================================
-- BLOCO 1 — coluna de lock em `series`
-- ============================================================
alter table public.series
  add column if not exists generation_locked_at timestamptz;

-- ============================================================
-- BLOCO 2 — reivindica a série atomicamente antes de gerar
-- ============================================================
create or replace function public.claim_series_for_generation(
  p_series_id uuid,
  p_user_id uuid,
  p_stale_seconds integer default 600
)
returns public.series
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid;
  v_series public.series;
begin
  if auth.uid() is not null then
    v_user_id := auth.uid();
  elsif auth.role() = 'service_role' then
    v_user_id := p_user_id;
  else
    raise exception 'Não autorizado';
  end if;

  update public.series
  set generation_locked_at = now()
  where id = p_series_id
    and user_id = v_user_id
    and status <> 'arquivada'
    and (
      generation_locked_at is null
      or generation_locked_at < now() - make_interval(secs => p_stale_seconds)
    )
  returning * into v_series;

  if v_series is null then
    raise exception 'Esta série já está gerando um vídeo (ou não está disponível).';
  end if;

  return v_series;
end;
$$;

revoke all on function public.claim_series_for_generation(uuid, uuid, integer) from public;
grant execute on function public.claim_series_for_generation(uuid, uuid, integer) to authenticated, service_role;

-- ============================================================
-- BLOCO 3 — cria o vídeo da série já com series_id, de forma atômica
-- ============================================================
create or replace function public.create_series_video_and_consume_credit(
  p_user_id uuid,
  p_series_id uuid,
  p_title text,
  p_topic text,
  p_style text,
  p_duration text,
  p_voice text,
  p_captions_enabled boolean,
  p_caption_style text,
  p_gradient text,
  p_visual_style text default null,
  p_background_music_id uuid default null
)
returns public.videos
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid;
  v_credits integer;
  v_video public.videos;
begin
  if auth.uid() is not null then
    v_user_id := auth.uid();
  elsif auth.role() = 'service_role' then
    v_user_id := p_user_id;
  else
    raise exception 'Não autorizado';
  end if;

  select credits into v_credits
  from public.profiles
  where id = v_user_id
  for update;

  if v_credits is null then
    raise exception 'Perfil não encontrado';
  end if;

  if v_credits <= 0 then
    raise exception 'Créditos insuficientes';
  end if;

  update public.profiles
  set credits = credits - 1
  where id = v_user_id;

  insert into public.videos (
    user_id, series_id, title, topic, style, duration, voice,
    captions_enabled, caption_style, status, gradient, visual_style, background_music_id
  )
  values (
    v_user_id, p_series_id, p_title, p_topic, p_style, p_duration, p_voice,
    p_captions_enabled, p_caption_style, 'Processando', p_gradient, p_visual_style, p_background_music_id
  )
  returning * into v_video;

  return v_video;
end;
$$;

revoke all on function public.create_series_video_and_consume_credit(
  uuid, uuid, text, text, text, text, text, boolean, text, text, text, uuid
) from public;
grant execute on function public.create_series_video_and_consume_credit(
  uuid, uuid, text, text, text, text, text, boolean, text, text, text, uuid
) to authenticated, service_role;

-- ============================================================
-- BLOCO 4 — mark_video_ready / refund_credit_and_mark_error passam a
-- aceitar p_user_id opcional (compatível com todas as chamadas atuais).
-- Precisa dropar a assinatura antiga primeiro: "create or replace" com uma
-- lista de parâmetros diferente cria uma SEGUNDA função (overload) em vez
-- de substituir a existente, e duas funções com o mesmo nome — uma com 3
-- parâmetros, outra com 4 (o 4º com default) — deixa qualquer chamada com
-- 3 argumentos ambígua ("function is not unique") e quebra retry/criação
-- avulsa, que sempre chamam com 3 argumentos.
-- ============================================================
drop function if exists public.mark_video_ready(uuid, text, text);

create or replace function public.mark_video_ready(
  p_video_id uuid,
  p_video_url text,
  p_thumbnail_url text,
  p_user_id uuid default null
)
returns public.videos
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid;
  v_video public.videos;
begin
  if auth.uid() is not null then
    v_user_id := auth.uid();
  elsif auth.role() = 'service_role' then
    v_user_id := p_user_id;
  else
    raise exception 'Não autorizado';
  end if;

  update public.videos
  set status = 'Pronto',
      video_url = p_video_url,
      thumbnail_url = p_thumbnail_url,
      error_message = null
  where id = p_video_id and user_id = v_user_id
  returning * into v_video;

  if v_video is null then
    raise exception 'Vídeo não encontrado';
  end if;

  return v_video;
end;
$$;

revoke all on function public.mark_video_ready(uuid, text, text, uuid) from public;
grant execute on function public.mark_video_ready(uuid, text, text, uuid) to authenticated, service_role;

drop function if exists public.refund_credit_and_mark_error(uuid, text);

create or replace function public.refund_credit_and_mark_error(
  p_video_id uuid,
  p_message text,
  p_user_id uuid default null
)
returns public.videos
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid;
  v_video public.videos;
begin
  if auth.uid() is not null then
    v_user_id := auth.uid();
  elsif auth.role() = 'service_role' then
    v_user_id := p_user_id;
  else
    raise exception 'Não autorizado';
  end if;

  update public.videos
  set status = 'Erro', error_message = p_message
  where id = p_video_id and user_id = v_user_id
  returning * into v_video;

  if v_video is null then
    raise exception 'Vídeo não encontrado';
  end if;

  update public.profiles
  set credits = credits + 1
  where id = v_user_id;

  return v_video;
end;
$$;

revoke all on function public.refund_credit_and_mark_error(uuid, text, uuid) from public;
grant execute on function public.refund_credit_and_mark_error(uuid, text, uuid) to authenticated, service_role;

-- ============================================================
-- BLOCO 5 — record_series_generation passa a liberar o lock sempre, e
-- reagenda com backoff de 1h em caso de erro
-- ============================================================
drop function if exists public.record_series_generation(uuid, uuid, text, text);

create or replace function public.record_series_generation(
  p_series_id uuid,
  p_video_id uuid,
  p_status text,
  p_message text,
  p_user_id uuid default null
)
returns public.series_generation_logs
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid;
  v_series public.series;
  v_log public.series_generation_logs;
begin
  if auth.uid() is not null then
    v_user_id := auth.uid();
  elsif auth.role() = 'service_role' then
    v_user_id := p_user_id;
  else
    raise exception 'Não autorizado';
  end if;

  select * into v_series
  from public.series
  where id = p_series_id and user_id = v_user_id
  for update;

  if v_series is null then
    raise exception 'Série não encontrada';
  end if;

  if p_status not in ('sucesso', 'erro') then
    raise exception 'Status de geração inválido';
  end if;

  insert into public.series_generation_logs (series_id, user_id, video_id, status, error_message)
  values (p_series_id, v_user_id, p_video_id, p_status, p_message)
  returning * into v_log;

  if p_status = 'sucesso' then
    update public.series
    set last_generated_at = now(),
        next_generation_at = now() + (v_series.frequencia_dias || ' days')::interval,
        total_videos_gerados = total_videos_gerados + 1,
        generation_locked_at = null
    where id = p_series_id;
  else
    update public.series
    set next_generation_at = now() + interval '1 hour',
        generation_locked_at = null
    where id = p_series_id;
  end if;

  return v_log;
end;
$$;

revoke all on function public.record_series_generation(uuid, uuid, text, text, uuid) from public;
grant execute on function public.record_series_generation(uuid, uuid, text, text, uuid) to authenticated, service_role;
