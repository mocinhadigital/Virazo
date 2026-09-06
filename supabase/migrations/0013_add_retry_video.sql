-- Bug: o botão "Tentar novamente" (Meus Vídeos) chamava o mesmo endpoint de
-- criação (POST /api/videos/generate via addVideo), que sempre faz um INSERT
-- novo em public.videos -- cada retry duplicava o vídeo na lista em vez de
-- reprocessar o registro que falhou.
--
-- Esta função faz o retry como UPDATE atômico no MESMO registro: só afeta
-- uma linha que já pertence ao usuário E já está com status = 'Erro'. Isso
-- também é a proteção de backend contra retry duplicado/paralelo: se duas
-- chamadas chegarem ao mesmo tempo, a segunda não encontra mais nenhuma
-- linha com status = 'Erro' (a primeira já mudou pra 'Processando' dentro
-- da mesma transação) e cai no "raise exception" abaixo, sem iniciar uma
-- segunda geração.
--
-- Retry é GRATUITO: o crédito da tentativa original já foi devolvido pelo
-- refund_credit_and_mark_error (migration 0004) no momento em que o vídeo
-- virou 'Erro' -- "Tentar novamente" é reprocessamento do mesmo registro,
-- não uma nova geração, então não desconta crédito nenhum aqui. Por isso a
-- função não lê nem escreve public.profiles.credits, e o nome mudou de
-- "retry_video_and_consume_credit" para "retry_video" (o nome antigo ficaria
-- incoerente sem nenhum consumo de crédito).
create or replace function public.retry_video(
  p_video_id uuid
)
returns public.videos
language plpgsql
security definer set search_path = public
as $$
declare
  v_video public.videos;
begin
  update public.videos
  set status = 'Processando',
      error_message = null,
      video_url = null,
      thumbnail_url = null
  where id = p_video_id
    and user_id = auth.uid()
    and status = 'Erro'
  returning * into v_video;

  if v_video is null then
    raise exception 'Vídeo não encontrado ou não está com status de falha (outra tentativa já em andamento?).';
  end if;

  return v_video;
end;
$$;

revoke all on function public.retry_video(uuid) from public;
grant execute on function public.retry_video(uuid) to authenticated;
