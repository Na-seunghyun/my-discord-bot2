Active gift-code visibility fallback
Generated: 2026-08-12 KST

What changed
- Kingshot.net remains the only trusted gift-code source.
- The Worker now keeps active codes from Kingshot.net discovery even if Supabase row writes fail temporarily.
- /api/redeem/codes now falls back to the live Kingshot.net discovery result when trusted DB rows are empty.
- If live discovery is skipped by cooldown or temporarily unavailable, the API falls back to the last successful Kingshot.net refresh stored in redeem_meta.
- The active-code count also uses the cached trusted source when redeem_codes rows are temporarily empty.
- The Auto Redeem page stores the last successful code panel in the browser for a few hours, so a short API failure does not show an empty active-code panel.

Files to upload
- src/index.js
- site/auto_redeem.html

Supabase SQL
- No SQL is required for this fix.

PuTTY
- No PuTTY restart is required. This is a Worker/UI visibility fix.

Cloudflare
- Redeploy the Worker after uploading these files.
