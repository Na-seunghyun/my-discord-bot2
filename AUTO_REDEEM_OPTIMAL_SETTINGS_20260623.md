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
```

Why:

- Cloudflare scheduled runs discover new public codes and process a small safe batch.
- PuTTY/Oracle daemon processes redeem jobs faster without re-checking public pages every cycle.
- The protected upstream code source is disabled by default, so `session 403` warnings do not affect health status.
- Player IDs are already verified during registration, so redeem jobs skip the extra player profile lookup.
- Retryable failures such as timeout, network error, server busy, or rate limit stay pending until max attempts.

PuTTY daemon interval:

```text
AUTO_REDEEM_DAEMON_INTERVAL=300
```

Manual discovery:

```bash
curl -X POST "https://my-discord-bot2.looloo90.workers.dev/api/redeem/discover?token=ADMIN_TOKEN"
```

Manual run:

```bash
curl -X POST "https://my-discord-bot2.looloo90.workers.dev/api/redeem/run?token=ADMIN_TOKEN" \
  -H "X-Auto-Redeem-Runner: NashshAutoRedeem"
```
