-- Auto Redeem database load relief.
-- Safe to run more than once in Supabase SQL Editor.
-- Best time: after Supabase CPU/Disk IO has calmed down.

create index if not exists redeem_jobs_pending_claim_fast_idx
  on public.redeem_jobs (
    priority_score desc,
    priority_boosted_at_ms asc,
    created_at_ms asc
  )
  where status = 'pending';

create index if not exists redeem_jobs_running_stale_fast_idx
  on public.redeem_jobs (updated_at_ms, attempts)
  where status = 'running';

create index if not exists redeem_jobs_success_recent_fast_idx
  on public.redeem_jobs (redeemed_at_ms desc, updated_at_ms desc)
  where status = 'success';

create index if not exists redeem_codes_trusted_active_fast_idx
  on public.redeem_codes (source, status, is_active, updated_at_ms desc);

create index if not exists redeem_players_enabled_consent_fast_idx
  on public.redeem_players (enabled, consent);

create or replace function public.cleanup_old_redeem_jobs(
  p_keep_days integer default 30
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
  v_cutoff bigint;
begin
  v_cutoff := floor(
    extract(epoch from (now() - make_interval(days => greatest(p_keep_days, 7)))) * 1000
  )::bigint;

  delete from public.redeem_jobs
  where status in (
    'success',
    'failed',
    'invalid_code',
    'expired',
    'already_claimed',
    'time_window_closed',
    'player_not_found',
    'kingdom_check_required',
    'not_logged_in',
    'captcha_required',
    'claim_limit_reached',
    'official_blocked'
  )
  and updated_at_ms < v_cutoff;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

grant execute on function public.cleanup_old_redeem_jobs(integer) to service_role;

-- Run these manually after checking the project is not already at 100% CPU/IO:
-- select public.cleanup_old_redeem_jobs(30);
-- analyze public.redeem_jobs;
-- analyze public.redeem_players;
-- analyze public.redeem_codes;
