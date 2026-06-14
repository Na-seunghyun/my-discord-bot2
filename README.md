# KingShot Gift Code Discord Bot

Discord bot for registering KingShot player IDs and redeeming gift codes on all registered IDs.

## Features

- `/add-id` registers one KingShot ID.
- `/bulk-add` registers many IDs from comma, space, or newline separated text.
- `/delete-id` removes one ID.
- `/list-ids` shows registered IDs.
- `/redeem` redeems one gift code for every registered ID.
- Automatically watches channel `1422359547393347685` for messages or embeds containing `Gift Code: CODE`.

## Setup

1. Create a virtual environment.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. Install dependencies.

```powershell
pip install -r requirements.txt
python -m playwright install chromium
```

3. Create `.env`.

```powershell
Copy-Item .env.example .env
```

4. Put your Discord bot token in `.env`.

5. Enable these Discord Developer Portal bot settings:

- `MESSAGE CONTENT INTENT`
- `SERVER MEMBERS INTENT`

6. Run the bot.

```powershell
python bot.py
```

## Configuration

The `.env.example` file includes the default watch channel:

```text
WATCH_CHANNEL_ID=1422359547393347685
```

If `ADMIN_ROLE_IDS` is empty, Discord server administrators can use the management commands. To allow specific roles instead, set comma-separated role IDs:

```text
ADMIN_ROLE_IDS=111111111111111111,222222222222222222
```

## Auto Redeem

The bot scans normal messages and embed content in the watch channel. It extracts codes from text such as:

```text
Gift Code: PROTECTNATURE
```

or:

```text
🎁 Gift Code: PROTECTNATURE
```

Already detected codes are stored in SQLite so the bot does not redeem the same gift code twice.

## Notes

The redemption automation uses a real browser because the gift-code page is JavaScript-based. It intentionally waits between accounts to reduce request bursts. If the website changes its labels or flow, update `kingshot_redeemer.py`.

