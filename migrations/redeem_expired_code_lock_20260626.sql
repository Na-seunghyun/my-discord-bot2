-- Lock gift codes as expired when the official redeem flow has observed an
-- expired result. This fixes rows that still show active while the latest
-- redeem status already says expired.

update public.redeem_codes
set
  status = 'expired',
  is_active = false,
  updated_at_ms = (extract(epoch from now()) * 1000)::bigint,
  raw_json = coalesce(raw_json, '{}'::jsonb) || jsonb_build_object(
    'expired_lock_reason',
    'Official redeem result reported expired.'
  )
where lower(coalesce(status, '')) = 'expired'
   or lower(coalesce(last_redeem_status, '')) = 'expired'
   or is_active = false;
