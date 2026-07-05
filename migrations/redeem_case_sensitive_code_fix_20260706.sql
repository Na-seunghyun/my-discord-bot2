-- Fix a case-sensitive gift code that was previously normalized to uppercase.
-- This keeps the incorrect uppercase code inactive and queues the exact code
-- for every enabled auto-redeem player.

with clock as (
  select (extract(epoch from now()) * 1000)::bigint as now_ms
)
insert into public.redeem_codes (
  code,
  source,
  status,
  is_active,
  discovered_at_ms,
  updated_at_ms,
  raw_json
)
select
  '3wQYbxQw3',
  'manual-case-correction',
  'active',
  true,
  now_ms,
  now_ms,
  jsonb_build_object(
    'source',
    'manual-case-correction',
    'reason',
    'Gift codes are case-sensitive.'
  )
from clock
on conflict (code) do update
set
  source = excluded.source,
  status = 'active',
  is_active = true,
  updated_at_ms = excluded.updated_at_ms,
  raw_json = coalesce(public.redeem_codes.raw_json, '{}'::jsonb) || excluded.raw_json;

with clock as (
  select (extract(epoch from now()) * 1000)::bigint as now_ms
)
update public.redeem_codes
set
  status = 'invalid_code',
  is_active = false,
  updated_at_ms = (select now_ms from clock),
  raw_json = coalesce(raw_json, '{}'::jsonb) || jsonb_build_object(
    'superseded_by',
    '3wQYbxQw3',
    'reason',
    'Uppercase normalization broke a case-sensitive code.'
  )
where code = '3WQYBXQW3';

with clock as (
  select (extract(epoch from now()) * 1000)::bigint as now_ms
)
insert into public.redeem_jobs (
  job_key,
  player_id,
  gift_code,
  status,
  attempts,
  last_error,
  response_json,
  created_at_ms,
  updated_at_ms,
  redeemed_at_ms
)
select
  '3wQYbxQw3:' || id,
  id,
  '3wQYbxQw3',
  'pending',
  0,
  'Retry queued after case-sensitive code correction.',
  jsonb_build_object('source', 'case-sensitive-code-fix'),
  now_ms,
  now_ms,
  null
from public.redeem_players, clock
where enabled = true
  and consent = true
on conflict (job_key) do update
set
  status = 'pending',
  attempts = 0,
  last_error = 'Retry queued after case-sensitive code correction.',
  updated_at_ms = excluded.updated_at_ms,
  redeemed_at_ms = null
where public.redeem_jobs.status not in ('success', 'already_claimed', 'expired');

with clock as (
  select (extract(epoch from now()) * 1000)::bigint as now_ms
)
update public.redeem_jobs
set
  status = 'invalid_code',
  last_error = 'Superseded by case-sensitive code 3wQYbxQw3.',
  updated_at_ms = (select now_ms from clock)
where gift_code = '3WQYBXQW3'
  and status not in ('success', 'already_claimed');
