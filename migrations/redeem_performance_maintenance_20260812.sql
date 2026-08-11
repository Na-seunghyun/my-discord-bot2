-- Auto redeem performance maintenance.
-- Safe to run more than once in Supabase SQL Editor.

create index if not exists redeem_players_registry_fast_idx
  on public.redeem_players (enabled, consent, state, created_at_ms desc);

create index if not exists redeem_jobs_recent_player_fast_idx
  on public.redeem_jobs (updated_at_ms desc, player_id);

create index if not exists redeem_jobs_terminal_cleanup_idx
  on public.redeem_jobs (status, updated_at_ms);

create or replace function public.cleanup_old_redeem_jobs(
  p_keep_days integer default 45
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

-- Optional manual cleanup after checking your data:
-- select public.cleanup_old_redeem_jobs(45);
