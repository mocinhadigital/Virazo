-- Música de fundo real: biblioteca de faixas (prontas + upload do próprio
-- usuário), seleção múltipla por série, e sorteio de uma delas a cada vídeo
-- gerado. Mesmo padrão de RLS e de bucket já usado em `videos`.
-- Rode este arquivo inteiro no SQL Editor do seu projeto Supabase.

create table if not exists public.music_tracks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  storage_path text not null,
  is_builtin boolean not null default false,
  owner_user_id uuid references auth.users (id) on delete cascade,
  duration_seconds numeric,
  created_at timestamptz not null default now()
);

alter table public.music_tracks enable row level security;

-- Faixas prontas (is_builtin) são visíveis a qualquer usuário autenticado;
-- faixas personalizadas só pro dono.
drop policy if exists "music_tracks_select" on public.music_tracks;
create policy "music_tracks_select"
  on public.music_tracks for select
  using (is_builtin = true or owner_user_id = auth.uid());

drop policy if exists "music_tracks_insert_own" on public.music_tracks;
create policy "music_tracks_insert_own"
  on public.music_tracks for insert
  with check (owner_user_id = auth.uid() and is_builtin = false);

drop policy if exists "music_tracks_delete_own" on public.music_tracks;
create policy "music_tracks_delete_own"
  on public.music_tracks for delete
  using (owner_user_id = auth.uid());

-- Séries guardam quais faixas o usuário selecionou (zero ou mais); vídeos
-- guardam qual delas foi sorteada especificamente pra aquele vídeo.
alter table public.series
  add column if not exists background_music_ids uuid[] not null default '{}';

alter table public.videos
  add column if not exists background_music_id uuid references public.music_tracks (id);

-- Bucket público, mesmo padrão do bucket "videos" (0004_add_video_generation.sql):
-- URL direta, sem signed URL. Upload do usuário isolado pela pasta {userId}/.
insert into storage.buckets (id, name, public)
values ('music', 'music', true)
on conflict (id) do update set public = true;

drop policy if exists "music_storage_insert_own" on storage.objects;
create policy "music_storage_insert_own"
  on storage.objects for insert
  with check (bucket_id = 'music' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "music_storage_read_public" on storage.objects;
create policy "music_storage_read_public"
  on storage.objects for select
  using (bucket_id = 'music');

drop policy if exists "music_storage_delete_own" on storage.objects;
create policy "music_storage_delete_own"
  on storage.objects for delete
  using (bucket_id = 'music' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- A partir daqui, roda cada BLOCO separadamente (um "Run" por bloco) —
-- mesmo cuidado de 0003_fix_create_video_function.sql: se o revoke/grant
-- do fim falhar, não pode desfazer o create-or-replace que já deu certo.
-- ============================================================

-- ============================================================
-- BLOCO 1 — adiciona p_background_music_id (default null, compatível com
-- todo código existente que já chama essa função sem esse parâmetro)
-- ============================================================
drop function if exists public.create_video_and_consume_credit(
  text, text, text, text, text, boolean, text, text, text
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
    p_captions_enabled, p_caption_style, 'Pronto', p_gradient, p_visual_style, p_background_music_id
  )
  returning * into v_video;

  return v_video;
end;
$$;

-- ============================================================
-- BLOCO 2 — só rode depois de confirmar que o Bloco 1 não deu erro
-- ============================================================
revoke all on function public.create_video_and_consume_credit(
  text, text, text, text, text, boolean, text, text, text, uuid
) from public;

grant execute on function public.create_video_and_consume_credit(
  text, text, text, text, text, boolean, text, text, text, uuid
) to authenticated;

-- ============================================================
-- BLOCO 3 — verificação: deve retornar exatamente 1 linha, com
-- assinatura de 10 parâmetros terminando em "uuid)"
-- ============================================================
select p.oid::regprocedure as signature
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'create_video_and_consume_credit';
