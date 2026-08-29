-- Suporte a geração real de vídeo: colunas novas em `videos`, bucket de
-- Storage, e funções que controlam status/crédito com segurança (mesmo
-- padrão de security definer já usado em create_video_and_consume_credit).
-- Rode este arquivo inteiro no SQL Editor do seu projeto Supabase.

alter table public.videos
  add column if not exists video_url text,
  add column if not exists thumbnail_url text,
  add column if not exists error_message text,
  add column if not exists script jsonb;

alter table public.videos drop constraint if exists videos_status_check;
alter table public.videos add constraint videos_status_check
  check (status in ('Processando', 'Pronto', 'Erro', 'Rascunho'));

alter table public.videos alter column status set default 'Processando';

-- Bucket público (mais simples para começar: URL direta, sem lidar com
-- expiração de signed URL). Reavaliar para privado + signed URL se a
-- privacidade dos vídeos virar requisito.
insert into storage.buckets (id, name, public)
values ('videos', 'videos', true)
on conflict (id) do update set public = true;

drop policy if exists "videos_storage_insert_own" on storage.objects;
create policy "videos_storage_insert_own"
  on storage.objects for insert
  with check (bucket_id = 'videos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "videos_storage_read_public" on storage.objects;
create policy "videos_storage_read_public"
  on storage.objects for select
  using (bucket_id = 'videos');

-- Marca o vídeo como pronto (chamada no fim do pipeline, quando o .mp4 já
-- está no Storage). Security definer para manter a escrita de `status`
-- centralizada em funções controladas, no mesmo espírito da função de
-- criação de vídeo.
create or replace function public.mark_video_ready(
  p_video_id uuid,
  p_video_url text,
  p_thumbnail_url text
)
returns public.videos
language plpgsql
security definer set search_path = public
as $$
declare
  v_video public.videos;
begin
  update public.videos
  set status = 'Pronto',
      video_url = p_video_url,
      thumbnail_url = p_thumbnail_url,
      error_message = null
  where id = p_video_id and user_id = auth.uid()
  returning * into v_video;

  if v_video is null then
    raise exception 'Vídeo não encontrado';
  end if;

  return v_video;
end;
$$;

revoke all on function public.mark_video_ready(uuid, text, text) from public;
grant execute on function public.mark_video_ready(uuid, text, text) to authenticated;

-- Marca erro e devolve o crédito consumido na criação, atomicamente.
create or replace function public.refund_credit_and_mark_error(
  p_video_id uuid,
  p_message text
)
returns public.videos
language plpgsql
security definer set search_path = public
as $$
declare
  v_video public.videos;
begin
  update public.videos
  set status = 'Erro', error_message = p_message
  where id = p_video_id and user_id = auth.uid()
  returning * into v_video;

  if v_video is null then
    raise exception 'Vídeo não encontrado';
  end if;

  update public.profiles
  set credits = credits + 1
  where id = auth.uid();

  return v_video;
end;
$$;

revoke all on function public.refund_credit_and_mark_error(uuid, text) from public;
grant execute on function public.refund_credit_and_mark_error(uuid, text) to authenticated;
