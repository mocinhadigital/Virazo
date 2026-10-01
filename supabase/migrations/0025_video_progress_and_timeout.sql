-- Progresso por etapa da geração de vídeo + limite de 10 minutos.
--
-- Contexto: vídeos de 60s ficavam presos em 'Processando' ("Gerando" na
-- tela) para sempre. A geração roda numa função da Vercel limitada a 300s;
-- quando ela é encerrada no limite, nenhum código chega a marcar 'Erro'.
-- Esta migration:
-- 1. guarda em que etapa a geração está (roteiro, voz, imagens, montagem,
--    salvando) para a tela mostrar o progresso real;
-- 2. cria expire_stale_videos: todo vídeo em 'Processando' há mais de 10
--    minutos vira 'Erro' ("Falhou"), com o botão "Tentar de novo".
--
-- Sobre o limite diário ("crédito"): vídeo em 'Erro' NÃO conta no limite
-- do dia (reserve_daily_video_slot, migration 0019, só conta 'Pronto' e
-- 'Processando' recente), e "Tentar de novo" não reserva vaga nova. Ou seja,
-- marcar 'Erro' já devolve a vaga ao usuário — nada a estornar à parte.
--
-- Rode o arquivo inteiro de uma vez no SQL Editor do Supabase.

begin;

alter table public.videos add column if not exists progress_stage text;
alter table public.videos add column if not exists progress_current integer;
alter table public.videos add column if not exists progress_total integer;
alter table public.videos add column if not exists progress_updated_at timestamptz;

-- Atualiza a etapa de um vídeo em geração. Mesmo padrão de autorização de
-- mark_video_failed (0019): o dono pela sessão, ou o service_role (cron de
-- séries) informando o user_id. Só mexe em vídeo ainda 'Processando' — uma
-- atualização atrasada nunca "ressuscita" o progresso de um vídeo pronto.
create or replace function public.set_video_progress(
  p_video_id uuid,
  p_stage text,
  p_current integer default null,
  p_total integer default null,
  p_user_id uuid default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if auth.uid() is not null then
    v_user_id := auth.uid();
  elsif auth.role() = 'service_role' then
    v_user_id := p_user_id;
  else
    raise exception 'Não autorizado';
  end if;

  update public.videos
  set progress_stage = p_stage,
      progress_current = p_current,
      progress_total = p_total,
      progress_updated_at = now()
  where id = p_video_id
    and user_id = v_user_id
    and status = 'Processando';
end;
$$;

revoke all on function public.set_video_progress(uuid, text, integer, integer, uuid) from public, anon;
grant execute on function public.set_video_progress(uuid, text, integer, integer, uuid) to authenticated, service_role;

-- Marca como 'Erro' os vídeos em 'Processando' há mais de 10 minutos
-- (contados de reserved_at, que o "Tentar de novo" também renova). Usuário
-- logado: só os próprios. service_role sem p_user_id: de todos (rotina
-- agendada). Retorna quantos vídeos foram marcados.
create or replace function public.expire_stale_videos(p_user_id uuid default null)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is not null then
    p_user_id := auth.uid();
  elsif auth.role() <> 'service_role' then
    raise exception 'Não autorizado';
  end if;

  update public.videos
  set status = 'Erro',
      error_message = 'A geração passou de 10 minutos e foi interrompida. Clique em "Tentar de novo" — este vídeo não foi descontado do seu limite diário.'
  where status = 'Processando'
    and coalesce(reserved_at, created_at) < now() - interval '10 minutes'
    and (p_user_id is null or user_id = p_user_id);
  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

revoke all on function public.expire_stale_videos(uuid) from public, anon;
grant execute on function public.expire_stale_videos(uuid) to authenticated, service_role;

commit;
