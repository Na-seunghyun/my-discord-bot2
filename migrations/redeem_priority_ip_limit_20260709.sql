alter table public.redeem_priority_boosts
  add column if not exists ip_hash text;

create unique index if not exists redeem_priority_boosts_day_ip_idx
  on public.redeem_priority_boosts (boost_day, ip_hash)
  where ip_hash is not null;
