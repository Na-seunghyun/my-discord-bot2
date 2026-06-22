create table if not exists public.redeem_meta (
  key text primary key,
  value_json jsonb not null default '{}'::jsonb,
  updated_at_ms bigint not null default 0
);

alter table public.redeem_meta enable row level security;

-- The Cloudflare Worker uses the Supabase service role key server-side.
-- No public policies are required for this status row.
