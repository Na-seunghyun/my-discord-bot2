# Kingshot Intel Source Research

## Confirmed Public Source

The official Kingshot gift-code site uses this browser API:

- Site: `https://ks-giftcode.centurygame.com/`
- API base: `https://kingshot-giftcode.centurygame.com/api`
- Player lookup endpoint: `POST /player`
- Other visible endpoints: `POST /gift_code`, `POST /captcha`, `POST /gift_code_config`

The player lookup accepts a player ID as `fid` plus a timestamp and public frontend signature.

Confirmed `/player` response fields include:

- `fid`
- `nickname`
- `kid`
- `stove_lv`
- `stove_lv_content`
- `avatar_image`
- `total_recharge_amount`

This is enough for an independent basic profile source:

- player ID
- nickname
- kingdom
- town center / stove level display
- profile image

## Not Found In The Official Gift-Code Frontend

The official gift-code frontend does not expose hero, gear, alliance power, VIP, rankings, KvK history, or loadout endpoints.

Those richer fields on `kingshot.jeab.dev` appear to come from that site's own server-side collector and database. Its frontend only calls same-origin `/api/...` routes and does not reveal the deeper upstream source.

## Code Added

`outputs/src/index.js` now has an official gift-code fallback source.

When `kingshot.jeab.dev` fails:

- `/kingshot/players/{id}` can fall back to the official gift-code `/player` endpoint.
- `/kingshot/players/search?q={numericId}` can fall back to the official endpoint.
- The collector can save official basic profiles when a rich upstream player-detail request fails.

This does not replace rich hero/gear data. It prevents total failure for known player IDs and steadily improves the independent local database with official basic data.

## Auto-Redeem Implementation Added

The Worker now includes an auto-redeem backend:

- `POST /api/redeem/register`
- `POST /api/redeem/unregister`
- `GET /api/redeem/codes`
- `POST /api/redeem/code` with `ADMIN_TOKEN`
- `POST /api/redeem/discover` with `ADMIN_TOKEN`
- `POST /api/redeem/run` with `ADMIN_TOKEN`

The scheduled Worker cycle also runs:

- source code discovery from the upstream code/recent-redemption APIs
- job creation for registered opt-in players
- slow batched redemption jobs through the official gift-code API

The public page `site/auto_redeem.html` lets users register a player ID and receive a manage token for unregistering later.

## Auto-Redeem Direction

An auto-redeem feature is a good next independent-data strategy because users voluntarily submit their player IDs.

Recommended data model:

- `redeem_players`: player ID, nickname, kingdom, language, opt-in status, created/updated time
- `redeem_codes`: code, source, status, discovered time
- `redeem_jobs`: player ID, code, status, attempts, last error, redeemed time
- `redeem_logs`: minimal audit history

Important rules:

- Show clear consent text before saving any player ID.
- Provide a delete/unsubscribe button.
- Use Supabase for registrations and logs, not Workers KV, to avoid KV write limits.
- Throttle redemption jobs slowly.
- Never overwrite a stored player with blank or failed responses.
- Expect captcha/rate-limit cases and mark them as pending/manual instead of retrying aggressively.

## Practical Conclusion

The fully independent path can start now with official basic profile collection and voluntary auto-redeem registration.

Rich hero/gear independence still needs a separate source. The public gift-code code does not reveal that source.
