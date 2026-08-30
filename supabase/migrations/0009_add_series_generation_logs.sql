-- Log de auditoria de cada tentativa de geração automática/manual de uma
-- série. Escrita restrita a uma função security definer (mesmo espírito de
-- `subscriptions`: o usuário só LÊ o próprio histórico, nunca escreve direto
-- na tabela — evita que o cliente forje o próprio histórico ou pule a
-- atualização de `next_generation_at`/`total_videos_gerados`).
-- Rode em blocos separados no SQL Editor (um "Run" por bloco).

-- ============================================================
-- BLOCO 1 — tabela de logs + RLS
-- ============================================================
create table if not exists public.series_generation_logs (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  video_id uuid references public.videos (id) on delete set null,
  status text not null check (status in ('sucesso', 'erro')),
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.series_generation_logs enable row level security;

drop policy if exists "series_generation_logs_select_own" on public.series_generation_logs;
create policy "series_generation_logs_select_own"
  on public.series_generation_logs for select
  using (auth.uid() = user_id);

-- Sem policy de insert/update/delete para authenticated: toda escrita
-- acontece via record_series_generation (security definer), abaixo.

-- ============================================================
-- BLOCO 2 — registra o resultado de uma geração e avança o agendamento
-- ============================================================
create or replace function public.record_series_generation(
  p_series_id uuid,
  p_video_id uuid,
  p_status text,
  p_message text
)
returns public.series_generation_logs
language plpgsql
security definer set search_path = public
as $$
declare
  v_series public.series;
  v_log public.series_generation_logs;
begin
  select * into v_series
  from public.series
  where id = p_series_id and user_id = auth.uid()
  for update;

  if v_series is null then
    raise exception 'Série não encontrada';
  end if;

  if p_status not in ('sucesso', 'erro') then
    raise exception 'Status de geração inválido';
  end if;

  insert into public.series_generation_logs (series_id, user_id, video_id, status, error_message)
  values (p_series_id, auth.uid(), p_video_id, p_status, p_message)
  returning * into v_log;

  if p_status = 'sucesso' then
    update public.series
    set last_generated_at = now(),
        next_generation_at = now() + (v_series.frequencia_dias || ' days')::interval,
        total_videos_gerados = total_videos_gerados + 1
    where id = p_series_id;
  end if;

  return v_log;
end;
$$;

revoke all on function public.record_series_generation(uuid, uuid, text, text) from public;
grant execute on function public.record_series_generation(uuid, uuid, text, text) to authenticated;
