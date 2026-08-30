-- Liga vídeos gerados automaticamente à série de origem. Nullable e
-- `on delete set null`: apagar uma série NUNCA apaga os vídeos já gerados
-- por ela, só desvincula (preserva o que já foi entregue ao usuário).
-- Rode este arquivo inteiro no SQL Editor do seu projeto Supabase.

alter table public.videos
  add column if not exists series_id uuid references public.series (id) on delete set null;

create index if not exists videos_series_id_idx on public.videos (series_id);
