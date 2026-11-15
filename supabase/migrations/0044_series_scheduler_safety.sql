-- Agendador das séries: reagendamento no horário normal, sem recuperar dias perdidos.
--
-- O que muda (nada apaga ou gera vídeo; só funções novas/ajustadas):
-- 1. next_series_slot: próximo horário "HH:MM" da série no relógio de BRASÍLIA
--    (America/Sao_Paulo). Antes o horário valia no relógio do servidor (UTC): "09:00"
--    virava 06:00 em Brasília.
-- 2. record_series_generation (versão da 0014):
--    - sucesso: a próxima geração volta ao horário normal da série (amanhã no horário da
--      série, ou daqui a N dias), e NÃO mais "agora + N dias" — assim um "Gerar agora"
--      fora de hora não desloca o horário da série para sempre;
--    - erro técnico: tenta de novo em 1h; depois de 3 erros em 24h, só no próximo horário.
-- 3. reschedule_stale_series: séries atrasadas além da tolerância (padrão 6h) pulam para o
--    próximo horário normal, SEM gerar os dias perdidos. É o que impede a "avalanche" quando
--    o agendador for ligado.
-- 4. defer_series_to_next_slot: adia uma série para o próximo horário normal (cliente sem
--    plano ou sem vídeos disponíveis no dia), sem registrar erro.
-- Rode o arquivo inteiro de uma vez no SQL Editor. Para desfazer:
-- supabase/rollbacks/0044_rollback_series_scheduler_safety.sql

begin;

create or replace function public.next_series_slot(p_horario time, p_after timestamptz default now())
returns timestamptz
language sql
stable
as $$
  select case
    when ((date_trunc('day', p_after at time zone 'America/Sao_Paulo') + p_horario) at time zone 'America/Sao_Paulo') > p_after
      then ((date_trunc('day', p_after at time zone 'America/Sao_Paulo') + p_horario) at time zone 'America/Sao_Paulo')
    else ((date_trunc('day', p_after at time zone 'America/Sao_Paulo') + interval '1 day' + p_horario) at time zone 'America/Sao_Paulo')
  end;
$$;

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
  v_recent_errors integer;
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
    -- Volta ao horário normal da série (Brasília): hoje + N dias, no horário da série.
    update public.series
    set last_generated_at = now(),
        next_generation_at = ((date_trunc('day', now() at time zone 'America/Sao_Paulo')
                               + (v_series.frequencia_dias || ' days')::interval
                               + v_series.horario) at time zone 'America/Sao_Paulo'),
        total_videos_gerados = total_videos_gerados + 1,
        generation_locked_at = null
    where id = p_series_id;
  else
    select count(*) into v_recent_errors
    from public.series_generation_logs
    where series_id = p_series_id and status = 'erro' and created_at > now() - interval '24 hours';

    update public.series
    set next_generation_at = case
          when v_recent_errors >= 3 then public.next_series_slot(v_series.horario, now())
          else now() + interval '1 hour'
        end,
        generation_locked_at = null
    where id = p_series_id;
  end if;

  return v_log;
end;
$$;

revoke all on function public.record_series_generation(uuid, uuid, text, text, uuid) from public;
grant execute on function public.record_series_generation(uuid, uuid, text, text, uuid) to authenticated, service_role;

create or replace function public.reschedule_stale_series(
  p_grace_hours integer default 6,
  p_user_ids uuid[] default null
)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Não autorizado';
  end if;

  update public.series
  set next_generation_at = public.next_series_slot(horario, now())
  where status = 'ativa'
    and next_generation_at is not null
    and next_generation_at < now() - make_interval(hours => p_grace_hours)
    and (generation_locked_at is null or generation_locked_at < now() - interval '10 minutes')
    and (p_user_ids is null or user_id = any (p_user_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.reschedule_stale_series(integer, uuid[]) from public, anon, authenticated;
grant execute on function public.reschedule_stale_series(integer, uuid[]) to service_role;

create or replace function public.defer_series_to_next_slot(p_series_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Não autorizado';
  end if;

  update public.series
  set next_generation_at = public.next_series_slot(horario, now()),
      generation_locked_at = null
  where id = p_series_id and status = 'ativa';
end;
$$;

revoke all on function public.defer_series_to_next_slot(uuid) from public, anon, authenticated;
grant execute on function public.defer_series_to_next_slot(uuid) to service_role;

commit;
