-- Desfaz a 0044: volta record_series_generation à versão da 0014 e remove as funções novas.
begin;

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

drop function if exists public.reschedule_stale_series(integer, uuid[]);
drop function if exists public.defer_series_to_next_slot(uuid);
drop function if exists public.next_series_slot(time, timestamptz);

commit;
