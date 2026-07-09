# Auto Redeem Daily Priority Boost

## What changed

- Adds a daily priority boost button to `site/auto_redeem.html`.
- Adds public priority APIs to `src/index.js`.
- Adds `redeem_priority_boosts` and priority-aware `claim_redeem_jobs` to Supabase.
- Boosts reset at the next Korea-time midnight by default.
- Only pending jobs are moved up. Running, success, and terminal failed jobs are not changed.
- Boosted players are handled fairly: boosted jobs are processed before normal jobs, and boosted players are ordered by the time they pressed the daily boost button.
- Adds a fixed VIP priority group. These IDs stay inside the top priority ribbon after reset, but are mixed into the top 30 instead of always appearing as ranks 1-6.
- Adds a dedicated priority player ID input, so bulk registrants can choose which registered ID gets boosted.
- Limits priority boosting to one player ID per network per day. The IP is stored only as a daily hash, not as the raw IP address.

## Apply order

1. Supabase SQL Editor
   - Run `migrations/redeem_priority_boost_20260709.sql` once.
   - Then run `migrations/redeem_priority_fair_queue_20260709.sql` once.
   - Then run `migrations/redeem_priority_vip_queue_20260709.sql` once.
   - Then run `migrations/redeem_priority_ip_limit_20260709.sql` once.
   - If you already ran the previous priority files before this IP-limit patch, just run the IP-limit file now.

2. GitHub
   - Upload/replace:
     - `src/index.js`
     - `site/auto_redeem.html`
     - `migrations/redeem_priority_boost_20260709.sql`
     - `migrations/redeem_priority_fair_queue_20260709.sql`
     - `migrations/redeem_priority_vip_queue_20260709.sql`
     - `migrations/redeem_priority_ip_limit_20260709.sql`

3. Cloudflare
   - Rebuild/redeploy the Worker after GitHub is updated.

4. PuTTY
   - A restart is not required for priority ordering because the daemon already calls `/api/redeem/claim`.
   - If you want a clean restart, only restart the `auto-redeem` tmux session. Do not stop `discordbot3`.

## Optional environment variables

- `AUTO_REDEEM_PRIORITY_ENABLED=true`
- `AUTO_REDEEM_PRIORITY_DAYS=1`
- `AUTO_REDEEM_PRIORITY_SCORE=100000`
- `AUTO_REDEEM_PRIORITY_VIP_SCORE=99999`
- `AUTO_REDEEM_PRIORITY_VIP_IDS=132400657,130500207,132498752,131598020,133662121,132891924`
- `AUTO_REDEEM_PRIORITY_TOP_LIMIT=30`
- `AUTO_REDEEM_PRIORITY_CHALLENGE_TTL_SECONDS=300`

Default behavior is daily reset. Use `AUTO_REDEEM_PRIORITY_DAYS=2` or `3` only if you want boosts to last longer.
