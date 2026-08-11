-- Auto Redeem queue summary optimization.
-- Safe to run more than once in Supabase SQL Editor.

create index if not exists redeem_jobs_status_attempts_idx
  on public.redeem_jobs (status, attempts, updated_at_ms);

create index if not exists redeem_priority_boosts_active_idx
  on public.redeem_priority_boosts (expires_at_ms, player_id);

create or replace function public.redeem_queue_summary_fast(
  p_stale_cutoff bigint,
  p_now_ms bigint,
  p_vip_ids text[] default array[]::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_summary jsonb;
  v_priority_active bigint := 0;
  v_active_vip_boosts bigint := 0;
begin
  select jsonb_build_object(
    'pending', count(*) filter (where status = 'pending'),
    'retryPending', count(*) filter (where status = 'pending' and attempts > 0),
    'running', count(*) filter (where status = 'running'),
    'staleRunning', count(*) filter (where status = 'running' and updated_at_ms < p_stale_cutoff),
    'deferred', count(*) filter (where status = 'deferred'),
    'browserReview', count(*) filter (where status = 'browser_review'),
    'success', count(*) filter (where status = 'success'),
    'failedTerminal', count(*) filter (
      where status in (
        'failed',
        'invalid_code',
        'expired',
        'already_claimed',
        'time_window_closed',
        'player_not_found',
        'not_logged_in',
        'captcha_required',
        'claim_limit_reached',
        'deferred',
        'official_blocked'
      )
    )
  )
  into v_summary
  from public.redeem_jobs
  where status in (
    'pending',
    'running',
    'deferred',
    'browser_review',
    'success',
    'failed',
    'invalid_code',
    'expired',
    'already_claimed',
    'time_window_closed',
    'player_not_found',
    'not_logged_in',
    'captcha_required',
    'claim_limit_reached',
    'official_blocked'
  );

  select count(*)
    into v_priority_active
  from public.redeem_priority_boosts
  where expires_at_ms >= p_now_ms;

  if coalesce(array_length(p_vip_ids, 1), 0) > 0 then
    select count(*)
      into v_active_vip_boosts
    from public.redeem_priority_boosts
    where expires_at_ms >= p_now_ms
      and player_id = any(p_vip_ids);
  end if;

  return v_summary || jsonb_build_object(
    'priorityActive', coalesce(v_priority_active, 0),
    'activeVipBoosts', coalesce(v_active_vip_boosts, 0)
  );
end;
$$;

grant execute on function public.redeem_queue_summary_fast(bigint, bigint, text[]) to service_role;
