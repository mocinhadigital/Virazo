-- Trava o número de chamadas TTS (ElevenLabs) simultâneas em toda a aplicação
-- num teto global — a chave de API de produção só suporta 3 requisições
-- concorrentes; hoje qualquer vídeo de 30s+ (5, 8 ou 12 cenas, cada uma com
-- sua própria chamada de narração) já estoura esse limite sozinho, e cada
-- geração/retry/preview de voz roda sem nenhum controle entre si.
--
-- Como a aplicação é serverless (várias instâncias da Vercel, sem memória
-- compartilhada), o único jeito confiável de um limite GLOBAL é uma trava no
-- banco — mesmo padrão de `claim_series_for_generation` (migration 0014):
-- UPDATE condicional atômico + expiração automática (stale-reclaim) caso uma
-- função morra no meio e nunca libere a vaga.
--
-- Desenho: N linhas fixas ("vagas"), cada uma com dono/expiração. Adquirir =
-- UPDATE que pega uma vaga livre (ou expirada) com FOR UPDATE SKIP LOCKED
-- (serializa entre instâncias via lock de linha do Postgres, sem inventar
-- nada nesta migration). Liberar só apaga a vaga SE ainda pertencer a quem
-- pediu — evita que uma liberação atrasada apague a posse de quem já
-- reivindicou a vaga por expiração.
--
-- Compartilhado por TODOS os fluxos que chamam a ElevenLabs (geração por
-- série, manual, retry E preview de voz/health-check) — nenhum tem um pool
-- separado; um único semáforo de 3 vagas modela exatamente o limite real da
-- conta, sem reservar capacidade ociosa pra um fluxo específico.
--
-- Rode este arquivo inteiro no SQL Editor do seu projeto Supabase.

-- ============================================================
-- BLOCO 1 — tabela de vagas (3 linhas fixas = limite real da conta ElevenLabs)
-- ============================================================
create table if not exists public.elevenlabs_tts_slots (
  slot_number smallint primary key,
  owner text,
  acquired_at timestamptz,
  expires_at timestamptz
);

insert into public.elevenlabs_tts_slots (slot_number)
values (1), (2), (3)
on conflict (slot_number) do nothing;

alter table public.elevenlabs_tts_slots enable row level security;

-- Sem policy nenhuma para authenticated/anon: toda leitura/escrita acontece
-- via as duas funções security definer abaixo. Não é dado de usuário (não
-- há RLS "own row" que faça sentido aqui — é um semáforo global), por isso
-- as funções não checam auth.uid()/user_id, só exigem estar autenticado ou
-- ser o service_role (cron).

-- ============================================================
-- BLOCO 2 — adquire uma vaga (ou nenhuma, se as 3 estiverem ocupadas)
-- ============================================================
create or replace function public.acquire_elevenlabs_tts_slot(
  p_owner text,
  p_ttl_seconds integer default 60
)
returns smallint
language plpgsql
security definer set search_path = public
as $$
declare
  v_slot smallint;
begin
  if auth.role() not in ('authenticated', 'service_role') then
    raise exception 'Não autorizado';
  end if;

  update public.elevenlabs_tts_slots
  set owner = p_owner,
      acquired_at = now(),
      expires_at = now() + make_interval(secs => p_ttl_seconds)
  where slot_number = (
    select slot_number
    from public.elevenlabs_tts_slots
    where acquired_at is null or expires_at < now()
    order by slot_number
    limit 1
    for update skip locked
  )
  returning slot_number into v_slot;

  return v_slot; -- null = as 3 vagas estão ocupadas agora; quem chamou espera e tenta de novo
end;
$$;

revoke all on function public.acquire_elevenlabs_tts_slot(text, integer) from public;
grant execute on function public.acquire_elevenlabs_tts_slot(text, integer) to authenticated, service_role;

-- ============================================================
-- BLOCO 3 — libera a vaga (só se ainda for do mesmo dono — ver comentário
-- do cabeçalho sobre liberação atrasada de vaga já reivindicada por expiração)
-- ============================================================
create or replace function public.release_elevenlabs_tts_slot(
  p_slot_number smallint,
  p_owner text
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() not in ('authenticated', 'service_role') then
    raise exception 'Não autorizado';
  end if;

  update public.elevenlabs_tts_slots
  set owner = null, acquired_at = null, expires_at = null
  where slot_number = p_slot_number
    and owner = p_owner;
end;
$$;

revoke all on function public.release_elevenlabs_tts_slot(smallint, text) from public;
grant execute on function public.release_elevenlabs_tts_slot(smallint, text) to authenticated, service_role;
