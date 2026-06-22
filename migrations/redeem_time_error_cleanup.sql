update public.redeem_jobs
set
  status = 'time_window_closed',
  updated_at_ms = (extract(epoch from now()) * 1000)::bigint
where status in ('pending', 'running', 'failed')
  and (
    lower(coalesce(last_error, '')) like '%time error%'
    or lower(coalesce(last_error, '')) like '%redemption time%'
    or lower(coalesce(last_error, '')) like '%exchange time%'
    or lower(coalesce(response_json::text, '')) like '%time error%'
    or lower(coalesce(response_json::text, '')) like '%redemption time%'
    or lower(coalesce(response_json::text, '')) like '%exchange time%'
  );
