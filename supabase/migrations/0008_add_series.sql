-- Séries: automação de geração recorrente de vídeos por nicho/estilo/voz.
-- Mesmo padrão de RLS já usado em `videos` (dono do registro lê/escreve o
-- próprio, sem exceção). Nenhuma coluna aqui mexe em crédito, então não
-- precisa de função security definer para o CRUD básico.
-- Rode este arquivo inteiro no SQL Editor do seu projeto Supabase.

create table if not exists public.series (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  nicho text not null,
  tom_de_voz text not null,
  idioma text not null default 'pt' check (idioma in ('pt', 'en', 'es')),
  visual_style text not null,
  voice text,
  duration text not null,
  captions_enabled boolean not null default true,
  caption_style text,
  frequencia_dias integer not null default 1 check (frequencia_dias > 0),
  horario time not null default '09:00:00',
  status text not null default 'ativa' check (status in ('ativa', 'pausada', 'arquivada')),
  next_generation_at timestamptz,
  last_generated_at timestamptz,
  total_videos_gerados integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.series enable row level security;

drop policy if exists "series_select_own" on public.series;
create policy "series_select_own"
  on public.series for select
  using (auth.uid() = user_id);

drop policy if exists "series_insert_own" on public.series;
create policy "series_insert_own"
  on public.series for insert
  with check (auth.uid() = user_id);

drop policy if exists "series_update_own" on public.series;
create policy "series_update_own"
  on public.series for update
  using (auth.uid() = user_id);

drop policy if exists "series_delete_own" on public.series;
create policy "series_delete_own"
  on public.series for delete
  using (auth.uid() = user_id);

-- Mantém updated_at em dia a cada edição, sem depender de o app lembrar de setar.
create or replace function public.touch_series_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists series_set_updated_at on public.series;
create trigger series_set_updated_at
  before update on public.series
  for each row execute function public.touch_series_updated_at();
