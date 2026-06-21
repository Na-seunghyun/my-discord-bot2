# Supabase Intel Storage Setup

This setup keeps the site on the free-friendly path:

- Supabase stores thin player search indexes.
- Supabase stores compact cached API responses only when they are small enough.
- Cloudflare Worker keeps the service role key server-side.
- Browser JavaScript never receives the Supabase service role key.

## 1. Create a Supabase project

1. Open Supabase.
2. Create a new project.
3. Choose the free plan.
4. Wait until the project is ready.

## 2. Create tables

1. Go to `SQL Editor`.
2. Open `migrations/supabase_intel_schema.sql`.
3. Paste the full SQL.
4. Run it.

## 3. Copy Supabase credentials

In Supabase project settings:

- `Project URL`
- `service_role` key

Do not use the anon key for the Worker storage writes.

## 4. Add Cloudflare variables

Cloudflare Worker > Settings > Variables and Secrets:

Plain text variable:

```text
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
```

Secret:

```text
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

Keep `SUPABASE_SERVICE_ROLE_KEY` secret. Never paste it into HTML or browser JavaScript.

## 5. Deploy and verify

Open:

```text
https://my-discord-bot2.looloo90.workers.dev/api/intel/status
```

Expected:

```json
{
  "supabase": true,
  "supabasePlayers": 0,
  "supabaseCachedResponses": 0
}
```

Numbers increase after successful intel searches and after the slow background collector runs.

## 6. Slow background collector

The Worker now includes a Cloudflare Cron Trigger:

```toml
[triggers]
crons = ["*/10 * * * *"]
```

Every 10 minutes it slowly checks the next kingdom, stores valid player summaries, and refreshes stale player details. Failed or empty upstream responses do **not** overwrite existing player data.

Optional Cloudflare plain text variables:

```text
INTEL_COLLECT_ENABLED=true
INTEL_COLLECT_MIN_KINGDOM=1
INTEL_COLLECT_MAX_KINGDOM=2000
INTEL_COLLECT_KINGDOM_BATCH=1
INTEL_COLLECT_PLAYER_DETAILS=20
INTEL_COLLECT_STALE_HOURS=72
INTEL_COLLECT_DELAY_MS=1000
```

Recommended free-plan defaults:

- Keep `INTEL_COLLECT_KINGDOM_BATCH=1`.
- Use `INTEL_COLLECT_PLAYER_DETAILS=20` if the upstream site stays stable.
- Drop to `10` temporarily if 502/503/504 errors become frequent.
- If Supabase reaches 300MB, slow the collector down.

Manual test:

```text
POST /api/intel/collect?token=YOUR_ADMIN_TOKEN
```

Status check:

```text
GET /api/intel/status
```

The status response includes `collector.nextKingdom`, `collector.runs`, and the last small run summary.

## 7. Free plan maintenance

To delete old cached API responses while keeping thin player indexes:

```text
POST /api/intel/cleanup?days=45&token=YOUR_ADMIN_TOKEN
```

Recommended free-plan behavior:

- Keep player indexes long term.
- Keep detailed cached responses 30-60 days.
- Do not store images in Supabase.
- Store avatar URLs, not avatar files.
- Avoid full 370k detailed refresh jobs.

## 8. Auto redeem storage

The same SQL file also creates:

- `redeem_players`
- `redeem_codes`
- `redeem_jobs`

These tables power the hub page:

```text
/auto_redeem.html
```

Public endpoints:

```text
POST /api/redeem/register
POST /api/redeem/register-bulk
POST /api/redeem/unregister
GET  /api/redeem/status
GET  /api/redeem/codes
```

Admin endpoints:

```text
POST /api/redeem/code?token=YOUR_ADMIN_TOKEN
POST /api/redeem/discover?token=YOUR_ADMIN_TOKEN
POST /api/redeem/run?token=YOUR_ADMIN_TOKEN
```

Optional Cloudflare plain text variables:

```text
AUTO_REDEEM_ENABLED=true
AUTO_REDEEM_BATCH_SIZE=12
AUTO_REDEEM_DELAY_MS=1200
```

Recommended free-plan behavior:

- Keep `AUTO_REDEEM_BATCH_SIZE` between `5` and `20`.
- Keep a delay of at least `1000ms`.
- If the official gift-code API asks for captcha, the job is marked `captcha_required`; the Worker does not bypass captcha.
- Registered users receive a manage token in the browser. They need that token to remove their ID later.
- Duplicate registrations never overwrite an existing manage token.
- Bulk registration validates each ID through the official player lookup, saves only valid IDs, and skips duplicates safely.
