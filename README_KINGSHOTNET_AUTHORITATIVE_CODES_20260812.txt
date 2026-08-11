Kingshot.net authoritative gift-code source update
Generated: 2026-08-12 KST

What changed
- Gift-code discovery is fixed to https://kingshot.net/gift-codes only.
- Older upstream/secondary sources are disabled for gift-code discovery.
- The public active-code panel now auto-refreshes through the server with a cooldown, so users should not need to press status refresh just to see the latest trusted codes.
- Active-code counts and auto-redeem job creation now read only source = trusted-public:kingshot.net.
- If Kingshot.net no longer lists a code as active, the Worker expires it and removes pending/running jobs for that code.
- If the official redeem attempt says a code is expired/invalid, that result still overrides the source and deactivates the code.

Files to upload
- src/index.js
- migrations/redeem_kingshotnet_authoritative_only_20260812.sql

Supabase SQL
Run migrations/redeem_kingshotnet_authoritative_only_20260812.sql once in Supabase SQL Editor after uploading/deploying.
It deactivates active codes from older/manual/secondary sources and clears their waiting jobs.

Cloudflare
Redeploy the Worker after uploading src/index.js.

PuTTY
No PuTTY daemon restart is required for this source-only change. The daemon calls the Worker API and will follow the cleaned active-code list after the Worker is deployed.

Expected result
- The code panel should show only Kingshot.net-sourced codes.
- Old codes such as KS0709 should not remain active when Kingshot.net marks them expired.
- If Kingshot.net temporarily fails, the previous trusted DB values remain visible instead of saving a broken refresh as successful.
