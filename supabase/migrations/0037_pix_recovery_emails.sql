-- E-mail de recuperação de Pix não pago (Resend). Uma linha por pedido da Cakto:
-- impede mandar duas vezes para o mesmo pedido e guarda o id do envio agendado
-- no Resend (para cancelar se a pessoa pagar antes dos 15 minutos).
-- Só o servidor (service_role) escreve; nenhum cliente lê.
create table if not exists public.pix_recovery_emails (
  order_id text primary key,
  email text not null,
  product_label text,
  resend_id text,
  scheduled_for timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'canceled', 'skipped', 'failed')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists pix_recovery_emails_email_idx
  on public.pix_recovery_emails (lower(email), created_at desc);

alter table public.pix_recovery_emails enable row level security;
revoke all on public.pix_recovery_emails from anon, authenticated;
