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

create table if not exists public.redeem_players (
  id text primary key,
  nickname text,
  state integer,
  town_hall_level integer,
  avatar_url text,
  lang text,
  enabled boolean not null default true,
  consent boolean not null default true,
  manage_token_hash text,
  created_at_ms bigint not null default 0,
  updated_at_ms bigint not null default 0,
  profile_json jsonb not null default '{}'::jsonb
);

create index if not exists redeem_players_enabled_idx
  on public.redeem_players using btree (enabled, consent);

create table if not exists public.redeem_codes (
  code text primary key,
  source text,
  status text not null default 'active',
  is_active boolean,
  last_redeem_status text,
  last_redeemed_at_ms bigint,
  discovered_at_ms bigint not null default 0,
  updated_at_ms bigint not null default 0,
  raw_json jsonb not null default '{}'::jsonb
);

alter table public.redeem_codes
  add column if not exists is_active boolean;

alter table public.redeem_codes
  add column if not exists last_redeem_status text;

alter table public.redeem_codes
  add column if not exists last_redeemed_at_ms bigint;

create index if not exists redeem_codes_discovered_idx
  on public.redeem_codes using btree (discovered_at_ms desc);

create table if not exists public.redeem_jobs (
  job_key text primary key,
  player_id text not null,
  gift_code text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  response_json jsonb not null default '{}'::jsonb,
  created_at_ms bigint not null default 0,
  updated_at_ms bigint not null default 0,
  redeemed_at_ms bigint
);

create index if not exists redeem_jobs_status_idx
  on public.redeem_jobs using btree (status, created_at_ms);

create index if not exists redeem_jobs_player_idx
  on public.redeem_jobs using btree (player_id);

create table if not exists public.redeem_meta (
  key text primary key,
  value_json jsonb not null default '{}'::jsonb,
  updated_at_ms bigint not null default 0
);

alter table public.redeem_players enable row level security;
alter table public.redeem_codes enable row level security;
alter table public.redeem_jobs enable row level security;
alter table public.redeem_meta enable row level security;

-- No public policies are required because the Cloudflare Worker uses the
-- Supabase service role key server-side. Do not expose the service role key
-- in browser JavaScript.
