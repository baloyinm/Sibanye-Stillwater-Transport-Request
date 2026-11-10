# Sibanye-Stillwater-Transport-Request

Transport Hub: an application to manage transport and rotables department requests (trip requests, approval, drivers, vehicles) for EM Group on the Sibanye-Stillwater sites.

## What is in this repo
- `database/schema.mariadb.sql`: the ride-sharing tables for MariaDB (users, profiles, drivers, rides).
- `CLAUDE.md`: the shared reuse rule for the Baloyi re-usable component library.
- `.gitignore`: keeps credentials, logs, uploads and database dumps out of the repo.

## How the live site is laid out
- Front end: a React and Vite single-page app served from `public_html/`, with the usual "send every page to `index.html`, except `/api/`" rewrite in `.htaccess`.
- API: server-side scripts under `public_html/api/` talking to MariaDB; a separate Node/Express version lives under `ride-backend/`.
- Mail: sent through the company mail server over SMTP.

## What is not here, on purpose
Credentials (database, mail, token secrets), log archives, uploaded files, database dumps and real user data stay on the server and out of git. Settings are read from the server's environment or a `config.php` / `.env` that is listed in `.gitignore`.

## Still to bring in
The front-end source (only the built files exist on the server today) and the API code, once it has been reviewed and given proper sign-in and permission checks.

## Reusable parts
Generic parts built from this project live in the library `baloyinm/Re-usable-Component`:
`data/field-whitelist-update-helper` and `business/geo-distance-rule`, and the shared request flow in `data/dispatch-request-schema`.
