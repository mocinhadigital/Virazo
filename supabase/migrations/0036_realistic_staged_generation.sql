-- Vídeo Realista ✨ — geração em etapas + duração de 30s ou 60s.
--
-- Rode DEPOIS da 0035. Rode o arquivo inteiro de uma vez.
--
-- 1. Duração: realistic_videos.duration_seconds (30 ou 60) e credit_cost
--    (1 ou 2 créditos). O crédito segue sendo gasto só no "Animar meu vídeo"
--    e, se falhar, volta a MESMA quantidade.
-- 2. Etapas: fal_jobs (as animações enviadas à fila do fal.ai), narration
--    (voz já gerada) e stage_lock_at (trava de quem está tocando a geração).
--    A geração deixa de caber numa única chamada de 270s: ela espera o fal.ai
--    em chamadas curtas encadeadas, então 12 cenas funcionam mesmo com limite
--    baixo de vídeos simultâneos no fal.ai.
-- 3. Prazo de expiração sobe de 10 para 25 minutos (60s com fila pode levar
--    mais de 10 min), e a proteção de "2 gerando ao mesmo tempo" acompanha.

begin;

alter table public.realistic_videos
  add column if not exists duration_seconds integer not null default 30 check (duration_seconds in (30, 60)),
  add column if not exists credit_cost integer not null default 1 check (credit_cost in (1, 2)),
  add column if not exists fal_jobs jsonb,
  add column if not exists narration jsonb,
  add column if not exists stage_lock_at timestamptz;

-- Interna: marca 'Erro' e devolve os créditos gastos (credit_cost), uma vez.
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
    update public.profiles set realistic_credits = realistic_credits + v.credit_cost where id = v.user_id;
  end if;

  update public.realistic_videos
  set status = 'Erro',
      error_message = p_message,
      credit_refunded = credit_spent,
      progress_stage = null,
      progress_current = null,
      progress_total = null,
      stage_lock_at = null
  where id = p_video_id
  returning * into v;

  return v;
end;
$$;

revoke all on function public.realistic_fail_internal(uuid, text) from public, anon, authenticated, service_role;

-- Gasta 1 crédito (30s) ou 2 (60s) e começa a gerar.
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

  select count(*) into v_in_progress
  from public.realistic_videos
  where user_id = p_user_id
    and status = 'Processando'
    and reserved_at > now() - interval '25 minutes';
  if v_in_progress >= 2 then
    raise exception 'too_many_in_progress: você já tem 2 vídeos realistas sendo gerados. Aguarde um terminar.';
  end if;

  update public.profiles
  set realistic_credits = realistic_credits - v.credit_cost
  where id = p_user_id and realistic_credits >= v.credit_cost;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception 'no_realistic_credits: você precisa de % crédito(s) realista(s) para este vídeo. Compre um pacote para continuar.', v.credit_cost;
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
      fal_jobs = null,
      narration = null,
      stage_lock_at = null,
      reserved_at = now()
  where id = p_video_id
  returning * into v;

  return v;
end;
$$;

revoke all on function public.spend_realistic_credit(uuid, uuid) from public, anon, authenticated;
grant execute on function public.spend_realistic_credit(uuid, uuid) to service_role;

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
      progress_total = null,
      fal_jobs = null,
      narration = null,
      stage_lock_at = null
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
      and coalesce(reserved_at, created_at) < now() - interval '25 minutes'
      and (p_user_id is null or user_id = p_user_id)
  loop
    perform public.realistic_fail_internal(
      v_id,
      'A geração passou de 25 minutos e foi interrompida. Seus créditos realistas foram devolvidos — é só tentar de novo.'
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.expire_stale_realistic_videos(uuid) from public, anon;
grant execute on function public.expire_stale_realistic_videos(uuid) to authenticated, service_role;

commit;
