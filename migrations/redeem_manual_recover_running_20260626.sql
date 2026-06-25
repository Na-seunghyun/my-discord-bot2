-- Manual recovery for stuck Auto Redeem running jobs.
-- Recommended order:
-- 1) Stop the PuTTY daemon first.
-- 2) Run this SQL in Supabase SQL Editor.
-- 3) Restart the PuTTY daemon.
--
-- This only recovers running jobs older than 5 minutes, so currently active
-- browser work is not touched unless it has already been stuck.

select status, count(*) as count
from public.redeem_jobs
group by status
order by status;

update public.redeem_jobs
set
  status = 'pending',
  updated_at_ms = (extract(epoch from now()) * 1000)::bigint,
  last_error = 'Manual recovery: stale running job returned to pending.'
where status = 'running'
  and attempts < 3
  and updated_at_ms < ((extract(epoch from now()) * 1000)::bigint - 5 * 60 * 1000);

update public.redeem_jobs
set
  status = 'failed',
  updated_at_ms = (extract(epoch from now()) * 1000)::bigint,
  last_error = 'Manual recovery: stale running job failed after max attempts.'
where status = 'running'
  and attempts >= 3
  and updated_at_ms < ((extract(epoch from now()) * 1000)::bigint - 5 * 60 * 1000);

select status, count(*) as count
from public.redeem_jobs
group by status
order by status;

