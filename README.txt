Kingshot official redeem changed to require Kingdom.

Changed files:
- src/index.js
- site/auto_redeem.html
- auto_redeem_daemon.py

Extra UI update:
- Bulk registration now has its own Kingdom field.
- If Bulk kingdom is filled, pasted ID-only lines are registered to that kingdom.
- If Bulk kingdom is empty, it falls back to the single registration Kingdom field.

Deploy steps:
1. Copy these files into the same paths in your GitHub repo.
2. Commit and deploy Cloudflare Worker.
3. On PuTTY server: git pull origin main, then restart auto-redeem tmux.
