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
