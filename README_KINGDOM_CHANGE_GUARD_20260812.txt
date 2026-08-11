Kingshot Auto Redeem - Kingdom Change Guard

What changed
- Server transfer / kingdom move cases are no longer treated as a plain invalid-player delete case.
- Official redeem messages such as "double check player" or kingdom/player mismatch are classified as kingdom_check_required.
- Re-registering the same Player ID with a new Kingdom updates the saved kingdom.
- When the kingdom is updated, active-code jobs previously stuck as kingdom_check_required/player_not_found/not_logged_in are moved back to pending.
- The Auto Redeem page now shows a kingdom-change notice and a translated kingdom-check status badge.

Files to upload to GitHub
- auto_redeem_daemon.py
- src/index.js
- site/auto_redeem.html
- migrations/redeem_kingdom_change_guard_20260812.sql
- migrations/redeem_queue_summary_fast_20260812.sql
- migrations/redeem_performance_maintenance_20260812.sql

Supabase SQL
1. Run migrations/redeem_kingdom_change_guard_20260812.sql
2. Re-run migrations/redeem_queue_summary_fast_20260812.sql
3. Optional: re-run migrations/redeem_performance_maintenance_20260812.sql

After deploy
- Deploy the Worker on Cloudflare.
- On PuTTY, pull the latest GitHub code and restart only the auto-redeem tmux session.
- Keep your discordbot3 tmux session untouched.

Expected behavior
- Existing users keep working.
- If a user moved kingdoms, they can enter the same Player ID with the new Kingdom.
- The saved kingdom updates without deleting the user.
- Future auto redeem jobs use the new kingdom.
