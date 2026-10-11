-- Recuperação de checkout: registro de quem já foi contatado, para a lista
-- de recuperação (/dashboard/admin/recuperacao) não repetir a mesma pessoa.
--
-- - Guarda só o HASH (sha256) do e-mail, nunca o e-mail — basta para
--   reconhecer a pessoa de novo, sem guardar mais um dado pessoal.
-- - RLS ligado e SEM policy: usuário comum não lê nem escreve. Só o
--   servidor (service_role), depois de confirmar que quem pede é
--   administradora, grava e consulta.
-- - Não toca em nenhuma tabela, função ou gatilho existente.
--
-- Rode o arquivo inteiro de uma vez no SQL Editor do Supabase.

begin;

create table if not exists public.recovery_contacts (
  id bigint generated always as identity primary key,
  email_hash text not null,
  contacted_at timestamptz not null default now(),
  contacted_by uuid references auth.users (id) on delete set null
);

create index if not exists recovery_contacts_hash_idx
  on public.recovery_contacts (email_hash, contacted_at);

alter table public.recovery_contacts enable row level security;
revoke all on public.recovery_contacts from anon, authenticated;

commit;
