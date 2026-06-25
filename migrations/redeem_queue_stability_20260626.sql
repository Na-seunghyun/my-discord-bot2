-- Auto Redeem queue stability patch.
-- Safe to run more than once in Supabase SQL Editor.

create index if not exists redeem_jobs_running_stale_idx
  on public.redeem_jobs using btree (status, updated_at_ms, attempts);

create index if not exists redeem_jobs_player_code_status_idx
  on public.redeem_jobs using btree (player_id, gift_code, status);

create index if not exists redeem_players_enabled_created_idx
  on public.redeem_players using btree (enabled, consent, created_at_ms);

create index if not exists redeem_codes_active_discovered_idx
  on public.redeem_codes using btree (status, is_active, discovered_at_ms desc);

-- If a daemon/browser was killed after claiming jobs, these rows can remain
-- running forever. Put retryable rows back into the queue and close exhausted
-- rows so the dashboard does not look stuck.
update public.redeem_jobs
set
  status = 'pending',
  updated_at_ms = (extract(epoch from now()) * 1000)::bigint,
  last_error = 'Recovered stale running job for retry by stability migration.'
where status = 'running'
  and attempts < 3
  and updated_at_ms < ((extract(epoch from now()) * 1000)::bigint - 12 * 60 * 1000);

update public.redeem_jobs
set
  status = 'failed',
  updated_at_ms = (extract(epoch from now()) * 1000)::bigint,
  last_error = 'Failed stale running job after max attempts by stability migration.'
where status = 'running'
  and attempts >= 3
  and updated_at_ms < ((extract(epoch from now()) * 1000)::bigint - 12 * 60 * 1000);

