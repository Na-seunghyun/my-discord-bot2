begin;

-- Kingshot.net Gift Codes is now the only authoritative public gift-code source.
-- This cleanup removes active codes that came from older/manual/secondary sources,
-- so the public code panel and new auto-redeem jobs cannot keep using stale codes.
update public.redeem_codes
   set status = 'expired',
       is_active = false,
       last_redeem_status = coalesce(last_redeem_status, 'expired'),
       last_redeemed_at_ms = coalesce(last_redeemed_at_ms, floor(extract(epoch from clock_timestamp()) * 1000)::bigint),
       updated_at_ms = floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
       raw_json = coalesce(raw_json, '{}'::jsonb) || jsonb_build_object(
         'authoritative_source', 'https://kingshot.net/gift-codes',
         'authoritative_cleanup_at_ms', floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
         'authoritative_cleanup_reason', 'Only trusted-public:kingshot.net remains active.'
       )
 where status = 'active'
   and coalesce(lower(source), '') <> 'trusted-public:kingshot.net';

update public.redeem_jobs j
   set status = 'expired',
       last_error = 'Code removed from active queue: Kingshot.net Gift Codes is the only trusted active source.',
       updated_at_ms = floor(extract(epoch from clock_timestamp()) * 1000)::bigint
 where j.status in ('pending', 'running', 'deferred', 'browser_review', 'reviewing', 'unverified')
   and exists (
     select 1
       from public.redeem_codes c
      where lower(c.code) = lower(j.gift_code)
        and coalesce(lower(c.source), '') <> 'trusted-public:kingshot.net'
   );

-- Optional sanity check after running:
-- select code, status, is_active, source, updated_at_ms
--   from public.redeem_codes
--  where status = 'active'
--  order by updated_at_ms desc;

commit;
