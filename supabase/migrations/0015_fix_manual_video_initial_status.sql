-- Bug encontrado durante a auditoria da migration 0014 (trava de geração de
-- série): create_video_and_consume_credit -- usada pela criação MANUAL/avulsa
-- de vídeo (POST /api/videos/generate, sem relação com séries) -- insere o
-- vídeo já com status = 'Pronto' em vez de 'Processando'. Isso é uma
-- regressão: a migration 0005 já tinha corrigido exatamente esse mesmo bug,
-- mas a migration 0012 (que adicionou p_background_music_id) recriou a
-- função a partir de uma versão anterior à correção e reintroduziu o
-- literal 'Pronto'.
--
-- Efeito do bug: todo vídeo criado manualmente nasce marcado "Pronto" na
-- tela antes de qualquer geração real acontecer, e o contador de
-- concorrência (checkConcurrencyLimit, que conta vídeos com
-- status = 'Processando') nunca enxergava essas gerações em andamento.
--
-- Esta migration SÓ troca o literal 'Pronto' por 'Processando' no INSERT.
-- A assinatura da função (mesmos 10 parâmetros, mesma ordem, mesmos
-- defaults) fica idêntica à atual -- "create or replace" aqui SUBSTITUI a
-- função existente de verdade (não cria uma segunda/overload). Créditos,
-- grants e todo o resto do corpo da função ficam exatamente iguais.
--
-- Nenhuma coluna, tabela ou vídeo já existente é alterado ou lido por esta
-- migration -- ela só muda o valor inicial de vídeos criados DEPOIS que
-- rodar. Vídeos antigos mantêm o status que já têm hoje. O restante do
-- fluxo (mark_video_ready marca 'Pronto' no final da geração real,
-- refund_credit_and_mark_error marca 'Erro' em falha) já funciona
-- corretamente hoje e não precisa de nenhuma mudança.

create or replace function public.create_video_and_consume_credit(
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
  v_credits integer;
  v_video public.videos;
begin
  select credits into v_credits
  from public.profiles
  where id = auth.uid()
  for update;

  if v_credits is null then
    raise exception 'Perfil não encontrado';
  end if;

  if v_credits <= 0 then
    raise exception 'Créditos insuficientes';
  end if;

  update public.profiles
  set credits = credits - 1
  where id = auth.uid();

  insert into public.videos (
    user_id, title, topic, style, duration, voice,
    captions_enabled, caption_style, status, gradient, visual_style, background_music_id
  )
  values (
    auth.uid(), p_title, p_topic, p_style, p_duration, p_voice,
    p_captions_enabled, p_caption_style, 'Processando', p_gradient, p_visual_style, p_background_music_id
  )
  returning * into v_video;

  return v_video;
end;
$$;

revoke all on function public.create_video_and_consume_credit(
  text, text, text, text, text, boolean, text, text, text, uuid
) from public;

grant execute on function public.create_video_and_consume_credit(
  text, text, text, text, text, boolean, text, text, text, uuid
) to authenticated;
