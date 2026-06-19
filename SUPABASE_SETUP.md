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

Numbers increase after successful intel searches while the upstream data source is alive.

## 6. Free plan maintenance

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

