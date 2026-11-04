-- Fecha o furo do limite diário de vídeos.
--
-- O limite diário (reserve_daily_video_slot) conta as linhas da tabela videos.
-- Mas o navegador do cliente podia, direto pela API, APAGAR os próprios vídeos,
-- EDITÁ-LOS (status, data de criação...) ou até INSERIR linhas novas — e com
-- isso liberar vagas do dia, ou gerar vídeo sem passar pela reserva. Agora:
--
-- 1) O navegador NÃO escreve mais na tabela videos (inserir, editar e apagar
--    foram retirados). Só as funções do servidor (reserva, marcar pronto/falha,
--    progresso, tentar de novo, as de série) e a chave de serviço escrevem.
-- 2) "Excluir vídeo" passa a ser ESCONDER: delete_my_video marca deleted_at. O
--    vídeo some da tela do cliente, mas a linha continua no banco e CONTINUA
--    CONTANDO no limite do dia (a regra do limite não mudou nada: ela já conta
--    todas as linhas).
-- 3) Ler continua igual, só que sem os vídeos excluídos.
--
-- Não mexe no bônus do Pro nem nos planos. Rode o arquivo inteiro de uma vez
-- no SQL Editor do Supabase.

begin;

alter table public.videos add column if not exists deleted_at timestamptz;

-- Leitura: o cliente vê só os próprios vídeos NÃO excluídos.
drop policy if exists "videos_select_own" on public.videos;
create policy "videos_select_own"
  on public.videos for select
  using (auth.uid() = user_id and deleted_at is null);

-- Escrita direta pelo navegador: removida (políticas e permissões).
drop policy if exists "videos_insert_own" on public.videos;
drop policy if exists "videos_update_own" on public.videos;
drop policy if exists "videos_delete_own" on public.videos;
revoke insert, update, delete, truncate on public.videos from anon, authenticated;

-- "Excluir": esconde o vídeo do cliente sem apagar a linha (continua contando
-- no limite do dia). Só o dono; devolve true se o vídeo é dele (inclusive se já
-- estava escondido) e false se não existe ou é de outra pessoa.
create or replace function public.delete_my_video(p_video_id uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Não autorizado';
  end if;

  update public.videos
  set deleted_at = coalesce(deleted_at, now())
  where id = p_video_id
    and user_id = auth.uid();

  return found;
end;
$$;

revoke all on function public.delete_my_video(uuid) from public, anon;
grant execute on function public.delete_my_video(uuid) to authenticated;

commit;
