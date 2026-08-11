Supabase load relief patch - 2026-08-12

What changed:
- Auto Redeem status, activity, and gift-code APIs now use short Worker/KV cache.
- The page no longer refreshes every live panel every 60 seconds.
- Refresh intervals are split:
  - status: 2 minutes
  - recent activity: 3 minutes
  - priority strip: 5 minutes
  - gift codes: 15 minutes
- Hidden browser tabs do not keep refreshing live data.
- Cached values are reused if Supabase is temporarily slow.

Files to upload/replace:
- src/index.js
- site/auto_redeem.html

Supabase SQL:
- migrations/redeem_db_load_relief_20260812.sql

Recommended order:
1. Keep the PuTTY auto-redeem daemon stopped until Supabase CPU/Disk IO calms down.
2. Upload/replace the two code files and redeploy Cloudflare.
3. When Supabase is usable again, run migrations/redeem_db_load_relief_20260812.sql.
4. After indexes are created, optionally run:
   select public.cleanup_old_redeem_jobs(30);
   analyze public.redeem_jobs;
   analyze public.redeem_players;
   analyze public.redeem_codes;

Notes:
- No new Cloudflare variable is required.
- The Worker uses the existing VISITS or FEEDBACK KV binding for lightweight status cache.
- Live numbers may update a little slower, but Supabase load should drop sharply.
