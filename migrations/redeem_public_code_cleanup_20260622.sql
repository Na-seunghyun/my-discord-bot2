-- Safe cleanup for false gift-code candidates collected from public pages.
-- Run this once in Supabase SQL Editor after deploying the Worker update.

with bad_codes as (
  select code
  from public.redeem_codes
  where
    code in (
      'CALCULATORS',
      'CHANGE',
      'LANGUAGE',
      'TOGGLE',
      'QUICK',
      'THEME',
      'MASTER',
      'HISTORY',
      'TRACKER',
      'ACTIVE',
      'COPY',
      'REGISTER',
      'PROFILE',
      'PLAYER',
      'SIGN',
      'SHARE',
      'LINK',
      'VIEW',
      'MORE',
      'BLOG',
      'CONTACT',
      'CONTRIBUTORS',
      'ANNOUNCEMENTS',
      'RESOURCES',
      'POPULAR',
      'GUIDES',
      'GUIDE',
      'PLANNER',
      'SIMULATOR',
      'TEMPLATES',
      'CALENDAR',
      'TRANSFER',
      'KINGDOM',
      'KINGDOMS',
      'RANKING',
      'RANKINGS',
      'COMPARE',
      'COMPARISON',
      'SCOUT',
      'SCOUTING',
      'DIRECTORY',
      'AMBASSADOR',
      'NETWORK',
      'COLONIES',
      'RECRUIT',
      'RECRUITING',
      'RESULTS',
      'MATCHUPS',
      'COUNTDOWN',
      'ANALYTICS',
      'ANALYSIS',
      'PERFORMANCE',
      'TREES',
      'TOTAL',
      'SPECIFIED',
      'YET'
    )
    or (
      coalesce(source, '') like 'public:%'
      and code !~ '[0-9]'
    )
)
update public.redeem_jobs
set
  status = 'invalid_code',
  last_error = 'Filtered false public-page gift-code candidate.',
  updated_at_ms = (extract(epoch from now()) * 1000)::bigint
where gift_code in (select code from bad_codes)
  and status in ('pending', 'running', 'failed');

update public.redeem_codes
set
  status = 'invalid_code',
  is_active = false,
  updated_at_ms = (extract(epoch from now()) * 1000)::bigint,
  raw_json = coalesce(raw_json, '{}'::jsonb) || jsonb_build_object('cleanup_reason', 'false_public_page_candidate')
where
  code in (
    'CALCULATORS',
    'CHANGE',
    'LANGUAGE',
    'TOGGLE',
    'QUICK',
    'THEME',
    'MASTER',
    'HISTORY',
    'TRACKER',
    'ACTIVE',
    'COPY',
    'REGISTER',
    'PROFILE',
    'PLAYER',
    'SIGN',
    'SHARE',
    'LINK',
    'VIEW',
    'MORE',
    'BLOG',
    'CONTACT',
    'CONTRIBUTORS',
    'ANNOUNCEMENTS',
    'RESOURCES',
    'POPULAR',
    'GUIDES',
    'GUIDE',
    'PLANNER',
    'SIMULATOR',
    'TEMPLATES',
    'CALENDAR',
    'TRANSFER',
    'KINGDOM',
    'KINGDOMS',
    'RANKING',
    'RANKINGS',
    'COMPARE',
    'COMPARISON',
    'SCOUT',
    'SCOUTING',
    'DIRECTORY',
    'AMBASSADOR',
    'NETWORK',
    'COLONIES',
    'RECRUIT',
    'RECRUITING',
    'RESULTS',
    'MATCHUPS',
    'COUNTDOWN',
    'ANALYTICS',
    'ANALYSIS',
    'PERFORMANCE',
    'TREES',
    'TOTAL',
    'SPECIFIED',
    'YET'
  )
  or (
    coalesce(source, '') like 'public:%'
    and code !~ '[0-9]'
  );
