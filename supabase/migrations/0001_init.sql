-- Virazo — fundação de dados: perfis, vídeos e créditos.
-- Rode este arquivo inteiro no SQL Editor do seu projeto Supabase
-- (Dashboard → SQL Editor → New query → colar → Run).

-- Perfis: um registro por usuário autenticado, guarda o saldo de créditos.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  credits integer not null default 10,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

-- Vídeos: um registro por vídeo gerado.
create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  topic text not null,
  style text not null,
  duration text not null,
  voice text,
  captions_enabled boolean not null default true,
  caption_style text,
  status text not null default 'Pronto' check (status in ('Pronto', 'Processando', 'Rascunho')),
  gradient text not null default 'from-violet-500 via-fuchsia-500 to-orange-400',
  created_at timestamptz not null default now()
);

alter table public.videos enable row level security;

drop policy if exists "videos_select_own" on public.videos;
create policy "videos_select_own"
  on public.videos for select
  using (auth.uid() = user_id);

drop policy if exists "videos_insert_own" on public.videos;
create policy "videos_insert_own"
  on public.videos for insert
  with check (auth.uid() = user_id);

drop policy if exists "videos_update_own" on public.videos;
create policy "videos_update_own"
  on public.videos for update
  using (auth.uid() = user_id);

drop policy if exists "videos_delete_own" on public.videos;
create policy "videos_delete_own"
  on public.videos for delete
  using (auth.uid() = user_id);

-- Cria automaticamente um perfil (com créditos iniciais) para todo novo usuário,
-- não importa se o cadastro foi por e-mail/senha ou por Google.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Preenche o perfil de usuários que já existiam antes desta migração.
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- Cria um vídeo e consome 1 crédito de forma atômica (evita créditos negativos
-- em caso de cliques duplos ou requisições concorrentes).
create or replace function public.create_video_and_consume_credit(
  p_title text,
  p_topic text,
  p_style text,
  p_duration text,
  p_voice text,
  p_captions_enabled boolean,
  p_caption_style text,
  p_gradient text
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
    captions_enabled, caption_style, status, gradient
  )
  values (
    auth.uid(), p_title, p_topic, p_style, p_duration, p_voice,
    p_captions_enabled, p_caption_style, 'Pronto', p_gradient
  )
  returning * into v_video;

  return v_video;
end;
$$;

revoke all on function public.create_video_and_consume_credit from public;
grant execute on function public.create_video_and_consume_credit to authenticated;
