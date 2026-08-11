-- Auto Redeem kingdom-change guard.
-- Safe to run more than once in Supabase SQL Editor.

create index if not exists redeem_jobs_kingdom_check_requeue_idx
  on public.redeem_jobs (player_id, gift_code, status, updated_at_ms)
  where status in ('kingdom_check_required', 'player_not_found', 'not_logged_in');

create index if not exists redeem_players_state_refresh_idx
  on public.redeem_players (id, state, enabled, consent);

-- Optional check after deployment:
-- select status, count(*)
-- from public.redeem_jobs
-- where status in ('kingdom_check_required', 'player_not_found', 'not_logged_in')
-- group by status
-- order by status;
