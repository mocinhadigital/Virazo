-- Idempotência da liberação de plano da Cakto passa a ser pelo id do pedido
-- (data.id), independente do nome do evento.
--
-- Motivo: o webhook agora também libera o plano em subscription_created, e
-- a Cakto manda purchase_approved + subscription_created com o MESMO data.id
-- na compra inicial. Com a trava antiga (order_id, event) os dois seriam
-- aplicados. A chave nova, montada pelo webhook, é:
-- - 'activate:<data.id>'      para purchase_approved, subscription_created
--                             e subscription_renewed;
-- - '<evento>:<data.id>'      para subscription_canceled, refund e
--                             chargeback (mesmo comportamento de antes).
--
-- try_claim_cakto_event (0021) não muda: ela só marca processed_at, e quem
-- barra a duplicata é o índice único — que agora é sobre idempotency_key.
--
-- Requer a 0021. Rode o arquivo inteiro de uma vez no SQL Editor do
-- Supabase.

begin;

alter table public.cakto_events add column if not exists idempotency_key text;

-- Preenche as linhas já processadas com a chave nova. Se o mesmo pedido já
-- tiver sido aplicado por mais de um evento de liberação (ex.:
-- purchase_approved e subscription_renewed com o mesmo data.id), só a
-- primeira linha recebe a chave — as demais ficam com NULL, que não
-- participa do índice único, para a migration não falhar.
with keyed as (
  select
    id,
    case
      when event in ('purchase_approved', 'subscription_created', 'subscription_renewed')
        then 'activate:' || order_id
      else event || ':' || order_id
    end as key,
    row_number() over (
      partition by case
        when event in ('purchase_approved', 'subscription_created', 'subscription_renewed')
          then 'activate:' || order_id
        else event || ':' || order_id
      end
      order by processed_at, id
    ) as rn
  from public.cakto_events
  where processed_at is not null
    and order_id is not null
    and idempotency_key is null
)
update public.cakto_events e
set idempotency_key = keyed.key
from keyed
where e.id = keyed.id
  and keyed.rn = 1;

drop index if exists public.cakto_events_processed_once;

create unique index if not exists cakto_events_processed_once_by_key
  on public.cakto_events (idempotency_key)
  where processed_at is not null;

commit;
