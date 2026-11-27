# Deployment choices (PLAN.md Q8)
The repository holds one application: a Node 22 server (`npm start`) with MariaDB in live mode. The older PHP site on omholdings.co.za is a separate codebase and is not in this repository.

| Option | When | Steps (all done by Ntsakisi or the host, never by this repo) |
|---|---|---|
| A. Node app (recommended; the only one tested here) | host can run Node 22 (VPS, or cPanel Node app) | 1. Create an empty MariaDB database. 2. Run `database/schema.mariadb.sql`, `002_request_workflow.sql`, `003_settings.sql`, `004_contact_phone.sql` in order. 3. Import people and places with `npm run import:check` then the import script. 4. Set the environment variables in `.env.example` on the server (`DATA_MODE=live`, `DB_*`, any settings). 5. Run behind HTTPS. 6. Test with `tests/e2e/ui-walk.py` against a copy first. |
| B. Keep the PHP host | host has PHP only | Not built. The business rules in `src/workflow.mjs` would need a PHP port. Raise it as a new work package. |

Rotate the database and mailbox passwords on the old server before anything is moved. Passwords never go in this repository.
