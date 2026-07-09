create index if not exists redeem_jobs_priority_fair_claim_idx
  on public.redeem_jobs (
    status,
    priority_score desc,
    priority_boosted_at_ms asc,
    created_at_ms asc
  );

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
declare
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  update public.redeem_jobs r
  set
    priority_score = 0,
    priority_boosted_at_ms = 0,
    priority_until_ms = 0
  where
    r.priority_score > 0
    and r.priority_until_ms > 0
    and r.priority_until_ms < v_now;

  return query
  with picked as (
    select r.job_key
    from public.redeem_jobs r
    left join lateral (
      select b.boost_score, b.boosted_at_ms
      from public.redeem_priority_boosts b
      where b.player_id = r.player_id
        and b.expires_at_ms >= v_now
      order by b.boosted_at_ms desc
      limit 1
    ) active_boost on true
    where r.status = 'pending'
    order by
      greatest(coalesce(active_boost.boost_score, 0), coalesce(r.priority_score, 0)) desc,
      greatest(coalesce(active_boost.boosted_at_ms, 0), coalesce(r.priority_boosted_at_ms, 0)) asc,
      r.created_at_ms asc
    limit greatest(1, least(coalesce(p_limit, 40), 120))
    for update of r skip locked
  ),
  updated as (
    update public.redeem_jobs r
    set
      status = 'running',
      attempts = coalesce(r.attempts, 0) + 1,
      updated_at_ms = v_now,
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
