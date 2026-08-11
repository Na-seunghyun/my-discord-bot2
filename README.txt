Metric zero flicker fix - 2026-08-12

What changed:
- Auto Redeem live numbers no longer fall back to 0 when Supabase is slow or partially unavailable.
- Registered IDs, active code count, success count, code dock count, queue badge, and daemon badge keep the last reliable value.
- Worker status APIs now return null instead of false 0 values when counts are temporarily unavailable.
- Active gift code count uses the trusted kingshot.net cache when Supabase count queries fail.

Files to upload/replace:
- src/index.js
- site/auto_redeem.html

Deployment:
- No Supabase SQL is required.
- No PuTTY daemon restart is required for this display fix.
- Redeploy the Cloudflare Worker/static assets after replacing the files.

Expected result:
- Registered IDs should stay around the last real value instead of flashing 0.
- Active codes should not flash 0 when a refresh request fails.
- Temporary Supabase pressure should show a partial/limited notice without erasing live numbers.
