-- Limite de consultas à API da Cakto por usuário (verificação ativa de
-- pagamento: dashboard sem plano, volta do checkout e botão "Já paguei").
--
-- Fica no banco, e não em memória, porque na Vercel cada requisição pode
-- cair numa instância diferente — um contador em memória não limitaria
-- nada. Também protege a cota da Cakto (5.000 req/hora por conta).
--
-- Requer a 0021 e a 0022. Rode o arquivo inteiro de uma vez no SQL Editor
-- do Supabase.

begin;

create table if not exists public.cakto_sync_checks (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_checked_at timestamptz not null default now()
);

alter table public.cakto_sync_checks enable row level security;
-- Sem policy nenhuma: só o service_role (rota de verificação) toca essa tabela.

-- Reivindica a vez de consultar. Retorna 0 = pode consultar agora (e já
-- marca o horário); > 0 = quantos segundos faltam para a próxima consulta.
-- O upsert condicional é atômico: duas requisições simultâneas do mesmo
-- usuário nunca passam juntas.
create or replace function public.try_claim_cakto_sync(
  p_user_id uuid,
  p_min_interval_seconds integer default 30
)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_claimed uuid;
  v_last timestamptz;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Não autorizado';
  end if;

  insert into public.cakto_sync_checks (user_id, last_checked_at)
  values (p_user_id, now())
  on conflict (user_id) do update
    set last_checked_at = now()
    where public.cakto_sync_checks.last_checked_at
      <= now() - make_interval(secs => p_min_interval_seconds)
  returning user_id into v_claimed;

  if v_claimed is not null then
    return 0;
  end if;

  select last_checked_at into v_last
  from public.cakto_sync_checks
  where user_id = p_user_id;

  return greatest(
    1,
    ceil(extract(epoch from (v_last + make_interval(secs => p_min_interval_seconds) - now())))::integer
  );
end;
$$;

revoke execute on function public.try_claim_cakto_sync(uuid, integer) from public, anon, authenticated;
grant execute on function public.try_claim_cakto_sync(uuid, integer) to service_role;

commit;
