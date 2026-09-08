-- Reformulação do modelo comercial: Starter/Pro (créditos mensais) vira
-- Diário/Pro/Ultra (limite FIXO de vídeos por dia, sem conceito de
-- crédito). O Pacote Avulso é descontinuado. Nenhuma tabela de crédito
-- antiga é apagada — profiles.credits e one_time_purchases continuam no
-- banco intactos, só param de ser lidos por qualquer função nova.
--
-- Rode o arquivo inteiro de uma vez no SQL Editor do Supabase.

begin;

-- ============================================================
-- BLOCO 1 — subscriptions.plan agora aceita os 3 planos novos. Não há
-- nenhum registro existente pra migrar (subscriptions continua vazia —
-- confirmado por consulta direta em produção nesta mesma conversa).
-- ============================================================
alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions add constraint subscriptions_plan_check
  check (plan in ('diario', 'pro', 'ultra'));

-- ============================================================
-- BLOCO 2 — nova coluna: marca desde quando uma reserva ('Processando')
-- está ativa. Diferente de created_at (que não muda num retry e marca em
-- qual DIA a vaga foi usada), reserved_at é atualizado a cada retry — é o
-- que permite uma reserva órfã (função que caiu no meio) expirar sozinha
-- sem travar o usuário pra sempre, e permite um retry legítimo reativar a
-- vaga sem contar como um vídeo novo do dia.
-- ============================================================
alter table public.videos add column if not exists reserved_at timestamptz default now();

-- ============================================================
-- BLOCO 3 — reserva atômica de 1 vaga do limite diário (substitui
-- create_video_and_consume_credit E create_series_video_and_consume_credit
-- — unificada, já que a lógica de checagem é idêntica pros dois casos,
-- só muda se tem series_id ou não).
--
-- Trava por usuário via advisory lock (pg_advisory_xact_lock) — serializa
-- tentativas concorrentes da MESMA conta (clique duplo, duas abas, cron +
-- "Gerar agora" ao mesmo tempo) sem bloquear usuários diferentes entre si.
--
-- "Vídeos usados hoje" = Pronto (sucesso) + Processando fresco (reservado
-- agora, reserved_at nos últimos 10 minutos — cobre o tempo de uma geração
-- real, que tem maxDuration=300s=5min nas rotas). Uma reserva mais velha
-- que isso é tratada como órfã (função caiu) e não conta mais — libera a
-- vaga sozinha, sem precisar de nenhuma limpeza manual.
--
-- Sem assinatura ativa: rejeita ANTES de checar o limite (mensagem
-- prefixada "no_subscription:" — o backend usa esse prefixo pra decidir se
-- abre o modal de planos em vez de só mostrar erro genérico). Limite
-- atingido: mensagem prefixada "daily_limit_reached:".
-- ============================================================
create or replace function public.reserve_daily_video_slot(
  p_title text,
  p_topic text,
  p_style text,
  p_duration text,
  p_voice text,
  p_captions_enabled boolean,
  p_caption_style text,
  p_gradient text,
  p_visual_style text default null,
  p_background_music_id uuid default null,
  p_series_id uuid default null,
  p_user_id uuid default null
)
returns public.videos
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid;
  v_plan text;
  v_daily_limit integer;
  v_today_start timestamptz;
  v_today_end timestamptz;
  v_used_today integer;
  v_video public.videos;
begin
  if auth.uid() is not null then
    v_user_id := auth.uid();
  elsif auth.role() = 'service_role' then
    v_user_id := p_user_id;
  else
    raise exception 'Não autorizado';
  end if;

  if v_user_id is null then
    raise exception 'Usuário não identificado';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  select plan into v_plan
  from public.subscriptions
  where user_id = v_user_id and status = 'active'
  order by created_at desc
  limit 1;

  if v_plan is null then
    raise exception 'no_subscription: assinatura ativa necessária para gerar vídeos.';
  end if;

  v_daily_limit := case v_plan
    when 'diario' then 1
    when 'pro' then 2
    when 'ultra' then 3
    else 0
  end;

  v_today_start := date_trunc('day', now() at time zone 'America/Manaus') at time zone 'America/Manaus';
  v_today_end := v_today_start + interval '1 day';

  select count(*) into v_used_today
  from public.videos
  where user_id = v_user_id
    and created_at >= v_today_start
    and created_at < v_today_end
    and (
      status = 'Pronto'
      or (status = 'Processando' and reserved_at > now() - interval '10 minutes')
    );

  if v_used_today >= v_daily_limit then
    raise exception 'daily_limit_reached: limite diário de vídeos atingido para o seu plano.';
  end if;

  insert into public.videos (
    user_id, series_id, title, topic, style, duration, voice,
    captions_enabled, caption_style, status, gradient, visual_style, background_music_id, reserved_at
  ) values (
    v_user_id, p_series_id, p_title, p_topic, p_style, p_duration, p_voice,
    p_captions_enabled, p_caption_style, 'Processando', p_gradient, p_visual_style, p_background_music_id, now()
  )
  returning * into v_video;

  return v_video;
end;
$$;

revoke all on function public.reserve_daily_video_slot(
  text, text, text, text, text, boolean, text, text, text, uuid, uuid, uuid
) from public;
grant execute on function public.reserve_daily_video_slot(
  text, text, text, text, text, boolean, text, text, text, uuid, uuid, uuid
) to authenticated, service_role;

-- ============================================================
-- BLOCO 4 — marca falha definitiva (substitui refund_credit_and_mark_error
-- — sem devolver crédito nenhum, porque não existe mais esse conceito: a
-- vaga só é "gasta" de verdade quando o vídeo chega em 'Pronto'; falhar
-- antes disso nunca consumiu a cota do dia).
-- ============================================================
create or replace function public.mark_video_failed(
  p_video_id uuid,
  p_message text,
  p_user_id uuid default null
)
returns public.videos
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid;
  v_video public.videos;
begin
  if auth.uid() is not null then
    v_user_id := auth.uid();
  elsif auth.role() = 'service_role' then
    v_user_id := p_user_id;
  else
    raise exception 'Não autorizado';
  end if;

  update public.videos
  set status = 'Erro', error_message = p_message
  where id = p_video_id and user_id = v_user_id
  returning * into v_video;

  if v_video is null then
    raise exception 'Vídeo não encontrado';
  end if;

  return v_video;
end;
$$;

revoke all on function public.mark_video_failed(uuid, text, uuid) from public;
grant execute on function public.mark_video_failed(uuid, text, uuid) to authenticated, service_role;

-- ============================================================
-- BLOCO 5 — retry_video passa a também reativar reserved_at (mesma trava
-- atômica de hoje: só afeta linha com status='Erro' do próprio dono). Sem
-- crédito envolvido antes ou depois — nada muda nesse aspecto.
-- ============================================================
create or replace function public.retry_video(
  p_video_id uuid
)
returns public.videos
language plpgsql
security definer set search_path = public
as $$
declare
  v_video public.videos;
begin
  update public.videos
  set status = 'Processando',
      error_message = null,
      video_url = null,
      thumbnail_url = null,
      reserved_at = now()
  where id = p_video_id
    and user_id = auth.uid()
    and status = 'Erro'
  returning * into v_video;

  if v_video is null then
    raise exception 'Vídeo não encontrado ou não está com status de falha (outra tentativa já em andamento?).';
  end if;

  return v_video;
end;
$$;

revoke all on function public.retry_video(uuid) from public;
grant execute on function public.retry_video(uuid) to authenticated;

-- ============================================================
-- BLOCO 6 — aplica/atualiza o plano da assinatura, sem crédito nenhum
-- (substitui apply_subscription_credit_reset). Só service_role — mesmo
-- hardening explícito da migration 0018 (revoga de public/anon/
-- authenticated por nome, não só "from public").
-- ============================================================
create or replace function public.apply_subscription_plan(
  p_user_id uuid,
  p_plan text,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_status text,
  p_current_period_end timestamptz
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Não autorizado';
  end if;

  insert into public.subscriptions (
    user_id, plan, status, stripe_customer_id, stripe_subscription_id, current_period_end
  )
  values (
    p_user_id, p_plan, p_status, p_stripe_customer_id, p_stripe_subscription_id, p_current_period_end
  )
  on conflict (stripe_subscription_id) do update
  set plan = excluded.plan,
      status = excluded.status,
      current_period_end = excluded.current_period_end,
      updated_at = now();
end;
$$;

revoke execute on function public.apply_subscription_plan(
  uuid, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_subscription_plan(
  uuid, text, text, text, text, timestamptz
) to service_role;

commit;
