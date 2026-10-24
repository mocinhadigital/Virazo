-- Pagamentos aprovados na Cakto cujo e-mail do comprador NÃO tem conta no
-- Virazo (public.profiles). O webhook continua guardando a compra em
-- cakto_pending_purchases como sempre (se a pessoa criar conta com ESSE
-- e-mail, o plano é liberado sozinho). Esta tabela é um registro à parte,
-- feito para você conferir e ativar manualmente quando o comprador pagou com
-- um e-mail diferente do da conta — e é a base do aviso por e-mail.
--
-- Não altera nenhuma tabela nem função existente. Só cria uma tabela nova,
-- sem acesso para o navegador (somente o servidor, via service_role).
-- Rode o arquivo inteiro de uma vez no SQL Editor do Supabase.

begin;

create table if not exists public.cakto_unmatched_payments (
  id bigint generated always as identity primary key,
  -- Um registro por pedido: reenvios do mesmo aviso não duplicam.
  order_id text not null unique,
  event text not null,
  email text not null,
  customer_name text,
  customer_phone text,
  plan text,
  product_name text,
  ref_id text,
  amount numeric,
  cakto_event_id bigint references public.cakto_events (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Quando o aviso por e-mail foi enviado (null = não enviado) e o motivo se falhou.
  notified_at timestamptz,
  notify_error text,
  -- Preencha quando ativar manualmente (ou quando a pessoa criar a conta).
  resolved_at timestamptz,
  resolved_note text
);

create index if not exists cakto_unmatched_payments_open_idx
  on public.cakto_unmatched_payments (created_at)
  where resolved_at is null;

alter table public.cakto_unmatched_payments enable row level security;
revoke all on public.cakto_unmatched_payments from anon, authenticated;
-- Sem policy nenhuma: só o service_role (servidor) lê e escreve.

commit;
