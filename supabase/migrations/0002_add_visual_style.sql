-- Adiciona o estilo visual (Anime, Comic, Cartoon 3D, Realista, Dark Fantasy,
-- Pintura Clássica) escolhido no assistente de criação de vídeo.
-- Rode este arquivo inteiro no SQL Editor do seu projeto Supabase
-- (Dashboard → SQL Editor → New query → colar → Run).

alter table public.videos
  add column if not exists visual_style text;

-- A assinatura antiga (8 parâmetros, sem p_visual_style) precisa ser removida
-- antes de criar a nova: "create or replace" só substitui quando os tipos de
-- parâmetro são idênticos, senão o Postgres cria uma função sobrecarregada
-- separada e o "revoke/grant" no final vira ambíguo.
drop function if exists public.create_video_and_consume_credit(
  text, text, text, text, text, boolean, text, text
);

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
    p_captions_enabled, p_caption_style, 'Pronto', p_gradient, p_visual_style
  )
  returning * into v_video;

  return v_video;
end;
$$;

revoke all on function public.create_video_and_consume_credit(
  text, text, text, text, text, boolean, text, text, text
) from public;
grant execute on function public.create_video_and_consume_credit(
  text, text, text, text, text, boolean, text, text, text
) to authenticated;
