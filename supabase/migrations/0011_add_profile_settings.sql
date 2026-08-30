-- Suporte à página Configurações: nome de exibição e idioma padrão do
-- usuário. Aditivo — não mexe em créditos nem em nenhuma coluna existente.
-- RLS já cobre isso: profiles_select_own/profiles_update_own (migration
-- 0001) já permitem que o próprio usuário leia e edite essas colunas novas.
-- Rode este arquivo inteiro no SQL Editor do seu projeto Supabase.

alter table public.profiles
  add column if not exists full_name text,
  add column if not exists preferred_language text not null default 'pt';

alter table public.profiles drop constraint if exists profiles_preferred_language_check;
alter table public.profiles add constraint profiles_preferred_language_check
  check (preferred_language in ('pt', 'en', 'es'));
