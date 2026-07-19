-- Kingshot.net authoritative gift-code cleanup
-- Current source of truth checked on 2026-07-20:
--   HAPPYEMOJIDAY, Kingshot888, VIP777
--
-- Run this after deploying the Worker change when you want the auto-redeem
-- center to keep only Kingshot.net "Active Gift Codes" as active jobs.

begin;

with authoritative_active(code) as (
  values
    ('HAPPYEMOJIDAY'),
    ('Kingshot888'),
    ('VIP777')
),
deactivated_codes as (
  update public.redeem_codes c
     set status = 'expired',
         is_active = false,
         last_redeem_status = coalesce(c.last_redeem_status, 'expired'),
         updated_at_ms = (extract(epoch from now()) * 1000)::bigint,
         raw_json = coalesce(c.raw_json, '{}'::jsonb)
           || jsonb_build_object(
                'authoritative_cleanup', 'kingshot.net active list',
                'cleanup_at', now(),
                'cleanup_reason', 'Code is not listed in Kingshot.net Active Gift Codes.'
              )
   where c.status = 'active'
     and not exists (
       select 1
         from authoritative_active a
        where lower(a.code) = lower(c.code)
     )
  returning c.code
)
update public.redeem_jobs j
   set status = 'expired',
       last_error = 'Gift code is not listed in Kingshot.net Active Gift Codes.',
       updated_at_ms = (extract(epoch from now()) * 1000)::bigint
 where exists (
   select 1
     from deactivated_codes d
    where lower(d.code) = lower(j.gift_code)
 )
   and j.status in ('pending', 'running', 'deferred', 'browser_review', 'reviewing', 'unverified');

with authoritative_active(code) as (
  values
    ('HAPPYEMOJIDAY'),
    ('Kingshot888'),
    ('VIP777')
),
now_ms(value) as (
  select (extract(epoch from now()) * 1000)::bigint
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
  a.code,
  'trusted-public:kingshot.net',
  'active',
  true,
  n.value,
  n.value,
  jsonb_build_object(
    'authoritative_source', 'https://kingshot.net/gift-codes',
    'authoritative_confirmed_at', now()
  )
from authoritative_active a
cross join now_ms n
on conflict (code) do update
   set status = 'active',
       is_active = true,
       source = 'trusted-public:kingshot.net',
       updated_at_ms = excluded.updated_at_ms,
       raw_json = coalesce(public.redeem_codes.raw_json, '{}'::jsonb)
         || excluded.raw_json;

commit;
