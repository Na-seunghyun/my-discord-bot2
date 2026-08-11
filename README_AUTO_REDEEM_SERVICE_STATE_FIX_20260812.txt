Auto Redeem service-state display fix
Generated: 2026-08-12 KST

What changed
- The Worker now separates real Supabase limited mode from partial status-panel delays.
- If the basic Supabase connection fails, service.state remains "limited" and the page shows the strong limited-mode warning.
- If only one of the secondary status panels fails, service.state becomes "partial" with partial: true.
- The Auto Redeem page now shows a softer "some status panels are delayed" banner for partial status.
- Partial status no longer disables registration, bulk registration, delete request, priority boost, or registry search buttons.
- The large limited-mode behavior is kept only for a real limited state or a full status API failure.

Files to upload
- src/index.js
- site/auto_redeem.html

Supabase SQL
- No SQL is required for this fix.

PuTTY
- No PuTTY restart is required. This is a Worker/UI display fix.

Cloudflare
- Redeploy the Worker after uploading these files.
