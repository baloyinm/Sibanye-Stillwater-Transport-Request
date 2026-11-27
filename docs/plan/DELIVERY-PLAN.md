# Delivery plan (26 Nov 2026). Demo data only; nothing is deployed or sent.

Status key: BUILT = in repo and proven by a test; NEW = built in this delivery; DECISION = needs Ntsakisi (PLAN.md questions); NOT BUILT.

## Processes and what each still needs
| # | Process | Exists | Still needed | Acceptance test | Status |
|---|---|---|---|---|---|
| P1 | Sign-in, roles, rate limit | sessions, scrypt, throttle | none | tests/app.test.mjs sign-in | BUILT |
| P2 | Request a trip | form, validation, places | none for first slice | whole-flow, validation tests | BUILT |
| P3 | Approve or reject (reason) | actions | none | reject-needs-reason test | BUILT |
| P4 | Assign driver and vehicle | nearest-free list, busy check | none | double-book test | BUILT |
| P5 | Trip: start, complete, driver position | actions, tracking | none | whole-flow test | BUILT |
| P6 | Cancel / unassign | actions | none | workflow table test | BUILT |
| P7 | Workflow rules proven | covered indirectly | direct tests of every transition by role | tests/workflow.test.mjs | NEW |
| P8 | Reports for the controller | none | summary by status, vehicle, period; CSV export (no personal data beyond names already visible to controller) | tests/reports.test.mjs | NEW |
| P9 | Places management | read-only list | controller adds, edits, deactivates places | tests/places.test.mjs | NEW |
| P10 | POPIA retention | none | script that lists (dry run) or anonymises finished trips older than RETENTION_DAYS | tests/retention.test.mjs | NEW |
| P11 | Pipeline and secrets | none | CI, gitleaks, .env.example | CI run green | NEW (done) |
| P12 | Documents and messages | none generated | notice outbox only (no sending) | DOCUMENT-INVENTORY.md | DECISION (Q5) |
| P13 | Cost centre, approval chain, road distance, rotables, SMS/email, driver accept, geocoding | none | need answers to PLAN.md Q1 to Q10 | n/a | DECISION |
| P14 | Live MariaDB store | written, one integration test | run test against a real MariaDB | tests/live-store.test.mjs (skipped without DB) | NOT VERIFIED |
| P15 | User guide pack (13 documents, screenshots) | none | needs library pack build and walker | n/a | NOT BUILT (library access needed) |
| P16 | Server hardening of the old PHP site | n/a | passwords and debug scripts on the live server | n/a | Ntsakisi on the server |

## Reuse check
| Part | Closest library component | Decision | Why |
|---|---|---|---|
| Reports CSV | none found in repo notes (library not read this session) | BUILD small | candidate: data/csv-export-helper, see LIBRARY-TODO.md |
| Places CRUD | data/field-whitelist-update-helper | USE as design (explicit field list) | plain JS |
| Retention | none | BUILD, candidate component | LIBRARY-TODO.md |

## Delivery result (26 Nov 2026)
P7, P8, P9, P10, P11 built and proven: `npm test` 17 pass, 0 fail, 1 skipped (live MariaDB test needs a database). Browser walk of Reports and Places at 390 and 1280 px passed. New screens have not been through the three UX gate checks (NOT RUN). Live store SQL for places and retention is NOT VERIFIED (no MariaDB here). Retention is never run automatically: `RETENTION_DAYS=730 node scripts/retention.mjs` is a dry run, `--apply` changes data; the period is Ntsakisi's decision (PLAN.md Q10).

## Round 2 (26 Nov 2026): the ten questions, each behind a setting
All settings are in `src/settings.mjs` and `.env.example`; defaults are the simple choice, so his answer is one line. Each is proven by `tests/settings.test.mjs` (demo store) and, for the data paths, by `tests/live-store.test.mjs` on a real MariaDB 10.11 (run locally with a socket: PASS), plus the browser walk `tests/e2e/ui-walk.py` (390 and 1280 px, light and dark, every setting on: PASS).
| Q | Setting | Built |
|---|---|---|
| 1 approval chain | APPROVAL_CHAIN=single|two (new role `supervisor`) | yes |
| 2 places | PLACES_MODE=list|free | yes (free mode stores no map position, so no distance) |
| 3 vehicle types, cost centre | VEHICLE_TYPES, COST_CENTRE=off|optional|required | yes |
| 4 driver accepts | DRIVER_ACCEPT=auto|accept (status `offered`, actions accept and decline) | yes |
| 5 messages | NOTIFY=off|inapp | in-app only; SMS and email are NOT built and nothing is sent (needs his yes and the messaging kit) |
| 6 road distance and time | ROUTING=road + ROUTING_URL (OSRM-compatible) | yes, proven against a local fake service; falls back to straight line; NOT VERIFIED against a real routing service |
| 7 positions | TRACKING=phone|tracker + TRACKER_TOKEN | yes (tracker posts to /api/tracker/position) |
| 8 PHP or Node | docs/DEPLOYMENT.md | documented; PHP port NOT BUILT |
| 9 parts requests | ROTABLES=off|on (kind parts, item list) | yes |
| 10 retention | RETENTION_DAYS (default 730) | yes; legal review of the period still needed |
Database: `database/003_settings.sql` (needed for supervisor, new statuses, cost centre, parts, notices).

## User guide pack (round 2)
`docs/guides/pack/` holds the 13-document pack (rules/user-guide-template 2.2.0, read-only library clone), built to `out/pdf-docx/` as PDF and DOCX. Build: 0 PROBLEM, 3 WARN (S-02 step 3 is information only; no COST-MODEL.md, an internal tool, rule C5). Four scenarios (S-01 trip, S-02 reject, S-03 reports and places, S-04 two-step approval and driver accept), walked in a real browser by `tests/e2e/guide-walk.py` (19 steps, 0 failures, 19 screenshots, which fill the slots). The library's `ui/guide-steps-test-runner` was NOT used: it signs in once per scenario and these scenarios cross roles; the Python walker does the same checks. The brand on the cover is the library's placeholder (known issue K-05). An in-app "User guide" page with downloads is NOT BUILT.

## Round 3 (27 Nov 2026)
| Item | Built | Proof |
|---|---|---|
| Messages (Q5) email and SMS through `email/message-channels-kit` and the delivery-mode guard | yes: `NOTIFY=messages`, default redirect, blocked with no test inbox, outbox log for the controller, optional phone per user (`database/004_contact_phone.sql`). NO real provider is connected and nothing is sent. | `tests/messaging.test.mjs` (5), live MariaDB `contactOf`, browser walk |
| Documents | yes: trip sheet and parts transport sheet (print HTML) with `email/document-style-kit` | `tests/documents.test.mjs`, document checker |
| Driver accept, road routing, rotables, tracker | already built in round 2; re-proven by the browser walk and tests | `tests/settings.test.mjs`, `tests/e2e/ui-walk.py` |
