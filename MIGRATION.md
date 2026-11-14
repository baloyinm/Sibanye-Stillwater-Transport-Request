# Moving from demo data to real data

The app runs on made-up data by default (`DATA_MODE=demo`). Real data goes in only through the steps below. Real data never goes in git (`data/import/` and `out/` are ignored).

1. **Check the people list.** Copy `templates/people.csv` to `data/import/people.csv`, fill in one row per person (user = requester, admin = controller, driver), then run `node scripts/import.mjs --check`. It names each bad row.
2. **Create the live database.** On the MariaDB server run `database/schema.mariadb.sql`, then `database/002_request_workflow.sql`. Use a database account that may only touch these tables.
3. **Build the import.** Places (the pickup list) come from `data/import/places.csv` (template `templates/places.csv`); a requester cannot choose a place until some are loaded. Run `node scripts/import.mjs`. It writes `data/import/out/import-people.sql` (password hashes, no passwords) and `temp-passwords.csv`. Load the SQL into the live database. Give each person their temporary password privately, then delete `out/`.
4. **Live store (written, tested on a throwaway MariaDB).** `src/live-store.mjs` has the same methods as the demo store. Test it on your own empty test database with `LIVE_TEST_DB=... LIVE_TEST_HOST=... LIVE_TEST_USER=... LIVE_TEST_PASSWORD=... npm test` (it drops and recreates the app tables, so never point it at real data). Run `npm ci` first (one package: `mariadb`).
5. **Set the server environment** (never in the repo): `DATA_MODE=live`, `DB_HOST`, `DB_PORT` (optional), `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `ALLOWED_ORIGINS` if the site has more than one address.
6. **Old trips** (history from the previous system) are not covered by a template yet: tell us the format first.
