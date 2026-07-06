-- Stop retry loops caused by the official redeem response:
-- "Claim limit reached, unable to claim."
--
-- These jobs were previously classified as retryable pending jobs. They should
-- be terminal so the daemon can move on to other work.

update public.redeem_jobs
set
  status = 'claim_limit_reached',
  last_error = 'Claim limit reached, unable to claim.',
  updated_at_ms = (extract(epoch from now()) * 1000)::bigint,
  redeemed_at_ms = null
where status in ('pending', 'running', 'failed')
  and (
    lower(coalesce(last_error, '')) like '%claim limit reached%'
    or lower(coalesce(last_error, '')) like '%unable to claim%'
    or lower(coalesce(response_json::text, '')) like '%claim limit reached%'
    or lower(coalesce(response_json::text, '')) like '%unable to claim%'
  );

select
  status,
  count(*) as count
from public.redeem_jobs
group by status
order by status;
