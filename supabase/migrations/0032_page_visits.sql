-- Visitas à página inicial (topo do funil do admin: "Visitaram a página").
-- Uma linha por PESSOA POR DIA (dia de Manaus): o navegador guarda um
-- visitor_id aleatório e o banco recusa a segunda visita do mesmo visitor_id
-- no mesmo dia. Guarda também utm_source, utm_campaign, fbclid e referrer.
--
-- Não altera nenhuma tabela nem função existente (get_conversion_funnel
-- continua igual): só cria 1 tabela e 1 função de leitura nova para o painel.
-- A tabela não tem acesso para o navegador; quem grava é o servidor
-- (/api/analytics/visit, com service_role) e quem lê é só o administrador,
-- pela função get_visit_stats.
-- Rode o arquivo inteiro de uma vez no SQL Editor do Supabase.

begin;

create table if not exists public.page_visits (
  id bigint generated always as identity primary key,
  visitor_id uuid not null,
  created_at timestamptz not null default now(),
  utm_source text,
  utm_campaign text,
  fbclid text,
  referrer text
);

-- 1 visita por pessoa por dia, no fuso de Manaus (o mesmo do funil).
create unique index if not exists page_visits_visitor_day_idx
  on public.page_visits (visitor_id, ((created_at at time zone 'America/Manaus')::date));

create index if not exists page_visits_created_at_idx
  on public.page_visits (created_at);

alter table public.page_visits enable row level security;
revoke all on public.page_visits from anon, authenticated;
-- Sem policy nenhuma: só o service_role (servidor) grava, e só a função
-- abaixo (security definer) lê para o painel.

-- Números do painel: pessoas distintas que visitaram no período e quantas
-- vieram do Facebook/Instagram (utm_source de anúncio, fbclid, ou referrer
-- do Facebook/Instagram). Só administradores (admin_users) — igual ao funil.
create or replace function public.get_visit_stats(p_since timestamptz default null)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not exists (select 1 from public.admin_users where user_id = auth.uid()) then
    raise exception 'Não autorizado';
  end if;

  select jsonb_build_object(
    'visitors', count(distinct visitor_id),
    'from_meta', count(distinct visitor_id) filter (
      where lower(coalesce(utm_source, '')) in ('facebook', 'fb', 'ig', 'instagram', 'meta', 'facebook_ads', 'instagram_ads')
         or fbclid is not null
         or coalesce(referrer, '') ~* '^https?://([a-z0-9-]+\.)*(facebook|instagram|fb)\.(com|me)([/:?#]|$)'
    ),
    'first_visit_at', min(created_at)
  )
  into v_result
  from public.page_visits
  where p_since is null or created_at >= p_since;

  return v_result;
end;
$$;

revoke all on function public.get_visit_stats(timestamptz) from public, anon;
grant execute on function public.get_visit_stats(timestamptz) to authenticated;

commit;
