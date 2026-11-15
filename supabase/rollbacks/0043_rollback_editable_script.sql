-- Desfaz a 0043. Apaga a tabela de pedidos de roteiro e os roteiros de próximo
-- episódio guardados nas séries; os vídeos já gerados não são afetados.
begin;
drop table if exists public.script_requests;
alter table public.series drop column if exists next_script;
alter table public.videos drop column if exists script_locked;
commit;
