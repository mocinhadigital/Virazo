-- Bug: create_video_and_consume_credit inseria o literal 'Pronto' na coluna
-- status, ignorando o default 'Processando' definido em 0004 (o default só
-- vale quando a coluna é omitida do INSERT; aqui ela era informada
-- explicitamente). Resultado: todo vídeo nascia "Pronto" antes de qualquer
-- geração real acontecer. Esta migration corrige a função para inserir
-- 'Processando', que é atualizado para 'Pronto'/'Erro' só depois do pipeline
-- real terminar (via mark_video_ready / refund_credit_and_mark_error).

create or replace function public.create_video_and_consume_credit(
  p_title text,
  p_topic text,
  p_style text,
  p_duration text,
  p_voice text,
  p_captions_enabled boolean,
  p_caption_style text,
  p_gradient text,
  p_visual_style text default null
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
    captions_enabled, caption_style, status, gradient, visual_style
  )
  values (
    auth.uid(), p_title, p_topic, p_style, p_duration, p_voice,
    p_captions_enabled, p_caption_style, 'Processando', p_gradient, p_visual_style
  )
  returning * into v_video;

  return v_video;
end;
$$;
