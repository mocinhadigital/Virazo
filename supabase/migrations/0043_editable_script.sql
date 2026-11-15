-- Roteiro editável (vídeo normal e séries). Não mexe em preços, Cakto, Vídeo
-- Realista, limites de vídeo nem em nenhuma função existente — só acrescenta:
--
-- 1. videos.script_locked: o cliente aprovou/editou o roteiro antes de gerar. O
--    "Tentar de novo" de um vídeo assim REUSA o roteiro guardado em videos.script
--    (em vez de escrever outro e perder a edição).
-- 2. series.next_script: roteiro do PRÓXIMO episódio, já escrito (e talvez editado
--    pelo cliente). Quem gera o episódio (agendador ou "Gerar agora") usa esse
--    roteiro uma vez; se não houver, escreve sozinho como sempre.
-- 3. script_requests: um registro por pedido de roteiro (escrever, refazer, dividir
--    a história), só para o teto diário por conta (cada pedido custa ~R$ 0,06 de
--    IA). Sem acesso pelo navegador: somente o servidor (service_role).
--
-- Rode o arquivo inteiro de uma vez no SQL Editor do Supabase. Para desfazer:
-- supabase/rollbacks/0043_rollback_editable_script.sql

begin;

alter table public.videos add column if not exists script_locked boolean not null default false;

alter table public.series add column if not exists next_script jsonb;

create table if not exists public.script_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('video', 'split', 'series')),
  created_at timestamptz not null default now()
);

create index if not exists script_requests_user_idx
  on public.script_requests (user_id, created_at desc);

alter table public.script_requests enable row level security;
-- Sem policy nenhuma: só o service_role lê e escreve.
revoke all on public.script_requests from anon, authenticated;

commit;
