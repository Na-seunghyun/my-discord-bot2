# Auto Redeem Public Code Source Setup

Primary public code source:

```text
https://kingshot.net/gift-codes
```

The Worker now has a dedicated parser for the page's `Active Gift Codes` and `Expired Gift Codes` sections.

Recommended Cloudflare variables:

```text
AUTO_REDEEM_ENABLED=true
AUTO_REDEEM_BATCH_SIZE=16
AUTO_REDEEM_CLOUDFLARE_BATCH_SIZE=6
AUTO_REDEEM_DELAY_MS=700
AUTO_REDEEM_MAX_ATTEMPTS=4
AUTO_REDEEM_VERIFY_PLAYER=false
AUTO_REDEEM_DAEMON_DISCOVER=false
AUTO_REDEEM_UPSTREAM_CODES_ENABLED=false
AUTO_REDEEM_WORKER_REDEEM_ENABLED=false
```

Why:

- Cloudflare scheduled runs discover new public codes and process a small safe batch.
- PuTTY/Oracle daemon claims redeem jobs, opens the official redeem page with Playwright, and reports results back.
- The protected upstream code source is disabled by default, so `session 403` warnings do not affect health status.
- Worker-side direct redeem is disabled by default because the official API can return `NOT LOGIN` without a browser session.
- Retryable failures such as timeout, network error, server busy, or rate limit stay pending until max attempts.

PuTTY daemon interval:

```text
AUTO_REDEEM_DAEMON_INTERVAL=300
AUTO_REDEEM_DAEMON_BATCH_SIZE=12
AUTO_REDEEM_DAEMON_TIMEOUT_MS=2500
```

Manual discovery:

```bash
curl -X POST "https://my-discord-bot2.looloo90.workers.dev/api/redeem/discover?token=ADMIN_TOKEN"
```

Manual run:

```bash
curl -X POST "https://my-discord-bot2.looloo90.workers.dev/api/redeem/discover?token=ADMIN_TOKEN"
```

Claim a batch for the PuTTY browser daemon:

```bash
curl -X POST "https://my-discord-bot2.looloo90.workers.dev/api/redeem/claim?token=ADMIN_TOKEN" \
  -H "X-Auto-Redeem-Runner: NashshAutoRedeem"
```

PuTTY setup:

```bash
cd ~/my-discord-bot2
pip install -r requirements.txt
python3 -m playwright install chromium

export HUB_BASE_URL="https://my-discord-bot2.looloo90.workers.dev"
export ADMIN_TOKEN="YOUR_ADMIN_TOKEN"
export AUTO_REDEEM_DAEMON_INTERVAL="300"
export AUTO_REDEEM_DAEMON_BATCH_SIZE="12"

tmux new -s auto-redeem
python3 auto_redeem_daemon.py
```

After it starts, detach from tmux with `Ctrl+B`, then `D`.
