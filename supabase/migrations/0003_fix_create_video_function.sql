-- Reparo: a função de 9 parâmetros criada em 0002_add_visual_style.sql nunca
-- foi persistida de fato. O SQL Editor roda o script colado como uma única
-- transação; como a última instrução daquele arquivo (revoke/grant sem tipos)
-- falhou com "function name is not unique", o Postgres desfez a transação
-- inteira — inclusive o "create or replace function" que tinha rodado bem.
-- Resultado: só sobrou a função antiga, de 8 parâmetros (sem p_visual_style).
--
-- Este arquivo recria a função de 9 parâmetros e aplica revoke/grant já com
-- a assinatura tipada (evita a ambiguidade). Rode cada bloco separadamente
-- no SQL Editor (um "Run" por bloco) para que um erro no fim não desfaça o
-- que já deu certo antes.

-- ============================================================
-- BLOCO 1 — recria a função com os 9 parâmetros
-- ============================================================
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

-- ============================================================
-- BLOCO 2 — só rode depois de confirmar que o Bloco 1 não deu erro
-- ============================================================
revoke all on function public.create_video_and_consume_credit(
  text, text, text, text, text, boolean, text, text, text
) from public;

grant execute on function public.create_video_and_consume_credit(
  text, text, text, text, text, boolean, text, text, text
) to authenticated;

-- ============================================================
-- BLOCO 3 — verificação: deve retornar exatamente 1 linha,
-- com assinatura de 9 parâmetros terminando em "text)"
-- ============================================================
select p.oid::regprocedure as signature
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'create_video_and_consume_credit';
