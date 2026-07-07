create or replace function public.claim_redeem_jobs(
  p_limit integer default 40,
  p_runner text default 'putty-daemon'
)
returns table (
  job_key text,
  player_id text,
  gift_code text,
  attempts integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select r.job_key
    from public.redeem_jobs r
    where r.status = 'pending'
    order by r.created_at_ms asc
    limit greatest(1, least(coalesce(p_limit, 40), 120))
    for update skip locked
  ),
  updated as (
    update public.redeem_jobs r
    set
      status = 'running',
      attempts = coalesce(r.attempts, 0) + 1,
      updated_at_ms = (extract(epoch from now()) * 1000)::bigint,
      last_error = 'Claimed by ' || coalesce(nullif(p_runner, ''), 'putty-daemon') || '.'
    from picked
    where r.job_key = picked.job_key
    returning r.job_key, r.player_id, r.gift_code, r.attempts
  )
  select
    updated.job_key,
    updated.player_id,
    updated.gift_code,
    updated.attempts
  from updated;
end;
$$;

grant execute on function public.claim_redeem_jobs(integer, text) to anon;
grant execute on function public.claim_redeem_jobs(integer, text) to authenticated;
grant execute on function public.claim_redeem_jobs(integer, text) to service_role;
