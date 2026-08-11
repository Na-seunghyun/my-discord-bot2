Supabase limit guard package

What changed:

1. site/auto_redeem.html
   - Adds an automatic limited-mode banner.
   - If /api/redeem/status reports Supabase overload, the page shows a notice asking users to retry later.
   - Register, bulk register, removal request, priority boost, and registry lookup buttons are temporarily disabled while limited mode is active.
   - The banner hides automatically when /api/redeem/status reports normal service again.

2. src/index.js
   - Adds a short Supabase request timeout so the Worker can respond with limited mode instead of hanging.
   - Adds a light health check before expensive status reads.
   - Uses public.redeem_queue_summary_fast when installed to reduce many queue count requests into one summary call.

3. auto_redeem_daemon.py
   - Adds automatic backoff when the Worker/Supabase read operation times out.
   - The daemon rests longer after repeated backend timeouts, then returns to normal speed after a successful loop.

4. migrations/redeem_queue_summary_fast_20260812.sql
   - Run this once in Supabase SQL Editor.
   - Adds indexes and the fast queue summary function used by the Worker.

Recommended order:
1. Upload site/auto_redeem.html, src/index.js, and auto_redeem_daemon.py to GitHub.
2. Run migrations/redeem_queue_summary_fast_20260812.sql in Supabase SQL Editor.
3. Redeploy Cloudflare Worker.
4. On PuTTY, git pull and restart the auto-redeem tmux session.

Optional existing cleanup:
- If you already uploaded redeem_performance_maintenance_20260812.sql, you can also run:
  select public.cleanup_old_redeem_jobs(45);
  This removes old terminal job rows older than 45 days.
