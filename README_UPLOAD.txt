Auto redeem registry search optimization

Upload these files to the same paths in GitHub:

1. site/auto_redeem.html
   - Removes the full registered-ID list from the bottom of the page.
   - Adds a private lookup box where users search by Player ID + Kingdom.
   - New registrations are still shown immediately by filling the search box and checking the registered ID.
   - The page no longer refreshes the full registry every few minutes.

2. src/index.js
   - Adds /api/redeem/player-search.
   - The endpoint returns only the exact registered player matching Player ID + Kingdom.
   - This avoids sending the entire registered-user list to every visitor.

Included for cumulative safety from the previous optimization package:

3. site/troop_training_ui.html
   - Calculator hub connection fix.

4. migrations/redeem_performance_maintenance_20260812.sql
   - Optional Supabase performance indexes and cleanup helper.
   - No new SQL is required only for the registry search feature.

After uploading:
1. Redeploy Cloudflare Worker.
2. Open /auto_redeem.html.
3. Confirm the bottom section shows the search form, not the full kingdom list.
4. Search a known Player ID + Kingdom pair.
