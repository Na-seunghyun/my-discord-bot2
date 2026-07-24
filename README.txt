Kingshot official redeem changed to require Kingdom.

Changed files:
- src/index.js
- site/auto_redeem.html
- auto_redeem_daemon.py

Deploy steps:
1. Copy these files into the same paths in your GitHub repo.
2. Commit and deploy Cloudflare Worker.
3. On PuTTY server: git pull origin main, then restart auto-redeem tmux.

New behavior:
- Registration requires Player ID + Kingdom.
- Bulk registration supports either "PlayerID Kingdom" per line, or ID-only lines when the Kingdom input is filled.
- Daemon and Worker redeem requests send official fid + kid + cdk.
- Old official /api/player verification is disabled by default because it is no longer usable.
