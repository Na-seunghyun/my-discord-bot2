-- Kingshot Intel cache for Supabase Free Plan.
-- Run this in Supabase SQL Editor.
-- Keep writes modest: store thin player indexes and compact cached responses.

create table if not exists public.intel_players (
  id text primary key,
  username text,
  username_lc text,
  state integer,
  alliance_name text,
  alliance_abbr text,
  power bigint,
  town_hall_level integer,
  avatar_url text,
  last_refreshed_at text,
  updated_at_ms bigint not null default 0,
  summary_json jsonb not null default '{}'::jsonb
);

create index if not exists intel_players_username_lc_idx
  on public.intel_players using btree (username_lc);

create index if not exists intel_players_state_idx
  on public.intel_players using btree (state);

create index if not exists intel_players_updated_at_idx
  on public.intel_players using btree (updated_at_ms desc);

create table if not exists public.intel_cache (
  cache_key text primary key,
  api_path text,
  response_json jsonb not null,
  updated_at_ms bigint not null default 0,
  byte_size integer not null default 0
);

create index if not exists intel_cache_api_path_idx
  on public.intel_cache using btree (api_path);

create index if not exists intel_cache_updated_at_idx
  on public.intel_cache using btree (updated_at_ms desc);

alter table public.intel_players enable row level security;
alter table public.intel_cache enable row level security;

-- No public policies are required because the Cloudflare Worker uses the
-- Supabase service role key server-side. Do not expose the service role key
-- in browser JavaScript.

