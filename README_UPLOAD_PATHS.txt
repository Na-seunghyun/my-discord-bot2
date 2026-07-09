Upload/replace these files in the GitHub repository with the same paths:

Important Safe Browsing fix:
- wrangler.toml now uses [assets] directory = "./site" so Cloudflare uploads only public site files.
- This prevents .git, .wrangler, source files, logs, maps, and other private repo files from being uploaded as static assets.

After deploy, check these URLs:
- https://my-discord-bot2.looloo90.workers.dev/security.html
- https://my-discord-bot2.looloo90.workers.dev/privacy.html
- https://my-discord-bot2.looloo90.workers.dev/.well-known/security.txt
- https://my-discord-bot2.looloo90.workers.dev/robots.txt
- https://my-discord-bot2.looloo90.workers.dev/sitemap.xml

Then request review in Google Search Console / Safe Browsing.

wrangler.toml
src/index.js
site/index.html
site/auto_redeem.html
site/feedback.html
site/fort_sanc.html
site/kingshot_lookup.html
site/troop_training_ui.html
site/building_calculator.html
site/war_academy_calculator.html
site/traplace/index.html
site/static/legend-ui.css
site/security.html
site/privacy.html
site/robots.txt
site/sitemap.xml
site/.well-known/security.txt
