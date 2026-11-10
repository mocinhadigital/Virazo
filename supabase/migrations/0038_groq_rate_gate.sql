-- Espaça as chamadas de transcrição do Groq (legendas) em TODA a aplicação.
-- O limite do Groq é por MINUTO (20 requisições/min), não por simultaneidade,
-- então em vez de vagas (como a ElevenLabs, 0016) usamos uma "fila de horários":
-- uma única linha guarda o próximo horário livre; cada chamada reserva um
-- horário (anterior + intervalo) e recebe quantos ms deve esperar até ele.
-- O UPDATE da linha serializa as instâncias da Vercel entre si.
--
-- Rode este arquivo inteiro no SQL Editor do seu projeto Supabase.

create table if not exists public.groq_rate_gate (
  id smallint primary key,
  next_slot_at timestamptz not null default now()
);

insert into public.groq_rate_gate (id) values (1) on conflict (id) do nothing;

alter table public.groq_rate_gate enable row level security;
revoke all on public.groq_rate_gate from anon, authenticated;

create or replace function public.claim_groq_slot(p_interval_ms integer default 3300)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_slot timestamptz;
begin
  -- Horário reservado = o maior entre "agora" e o próximo livre; o próximo
  -- livre passa a ser esse horário + intervalo.
  update public.groq_rate_gate
     set next_slot_at = greatest(next_slot_at, v_now) + make_interval(secs => p_interval_ms / 1000.0)
   where id = 1
  returning greatest(next_slot_at - make_interval(secs => p_interval_ms / 1000.0), v_now) into v_slot;

  return greatest(0, ceil(extract(epoch from (v_slot - v_now)) * 1000))::integer;
end;
$$;

revoke all on function public.claim_groq_slot(integer) from public, anon, authenticated;
grant execute on function public.claim_groq_slot(integer) to service_role;
