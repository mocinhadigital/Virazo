-- E-mail de recuperação de Pix: o envio passa a ser feito por nós (não mais
-- agendado no Resend), com conferência de pagamento NA HORA de enviar.
-- Motivo: o cancelamento no Resend falhou (HTTP 401) para um cliente que já
-- tinha pago, e o e-mail saiu mesmo assim.
--
-- Rode este arquivo inteiro no SQL Editor do seu projeto Supabase.

-- BLOCO 1 — dados necessários para montar o e-mail no momento do envio, e os
-- novos estados ('sending' = reservado por uma rodada, 'sent' = enviado).
alter table public.pix_recovery_emails add column if not exists product_id text;
alter table public.pix_recovery_emails add column if not exists customer_name text;

alter table public.pix_recovery_emails drop constraint if exists pix_recovery_emails_status_check;
alter table public.pix_recovery_emails add constraint pix_recovery_emails_status_check
  check (status in ('scheduled', 'sending', 'sent', 'canceled', 'skipped', 'failed'));

-- Os e-mails que já tinham saído antes desta mudança (agendados no Resend)
-- continuam como estão; a rotina nova só trata registros sem resend_id.

-- ============================================================
-- BLOCO 2 (OPCIONAL, SEPARADO) — agendador de 1 em 1 minuto.
-- A Vercel (plano Hobby) só roda tarefas 1x por dia, então o Supabase chama a
-- rota /api/cron/pix-recovery a cada minuto. ANTES de rodar, troque:
--   SEU_DOMINIO     pelo endereço do site (ex.: https://virazo.com.br)
--   SEU_CRON_SECRET pelo valor da variável CRON_SECRET da Vercel
-- Rode este bloco separadamente, depois do Bloco 1.
-- ============================================================
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
--
-- select cron.schedule(
--   'pix-recovery-envio',
--   '* * * * *',
--   $$
--   select net.http_get(
--     url := 'https://SEU_DOMINIO/api/cron/pix-recovery',
--     headers := jsonb_build_object('Authorization', 'Bearer SEU_CRON_SECRET')
--   );
--   $$
-- );
--
-- Para desligar: select cron.unschedule('pix-recovery-envio');
