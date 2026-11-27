# Document and message inventory

Every document and message this project produces, its family and what builds it. Rules: `rules/reuse-rule` D1 to D5 (documents) and E1 to E4 (messages). Kept current in the same commit as any change. This repository is public: Org settings in the repo are made-up placeholders; the real details are in the server-side file named by `ORG_FILE`.

## Documents

| Code | Document | Builder | Formats | Recipient | Personal info | Classification | Checker |
|---|---|---|---|---|---|---|---|
| JOB | Trip sheet / Parts transport sheet (`GET /api/rides/:id/sheet`) | `email/document-style-kit` 1.18.0 `buildJobCard` + `renderHtml` (`src/documents.mjs`) | Print HTML (real text, real tables; the browser prints it to PDF) | Requester, controller, supervisor, assigned driver (same rule as the trip itself) | Yes (names, addresses) | Internal | `email/document-standard-checker` 1.4.0 on the rendered file, run in `tests/documents.test.mjs` when `LIBRARY` is set; result in LIBRARY-LOG.md |
| CSV | Trips export (`/api/reports/trips.csv`) | `src/reports.mjs` | CSV | Controller | Names already visible to the controller | Internal | n/a (data file) |
| Guide | User guide pack, 13 documents | `rules/user-guide-template` 2.2.0 | PDF, DOCX | Anyone using the app | No (made-up demo data) | Public | the pack builder, `--strict` |

`templates/*.csv` are import templates (data files, not documents).

## Messages

| Type | Template | Channels | Trigger | Delivery |
|---|---|---|---|---|
| Trip update (notification) | `email/message-channels-kit` 1.2.0 `notification` | email (every user), SMS (only a user with a phone number), in-app | every workflow step that tells the requester or driver (`src/app.mjs` notify) | `integrations/email-sms-messaging` 1.6.0 delivery mode, `COMMS_MODE` default `redirect` (test inbox only); blocked when no test inbox is set; `live` refused outside production; no provider is connected, the base sender only records |

Checkers (`assertMessageOk`) run before every send and in `tests/messaging.test.mjs`. Controllers see the log of attempts (no bodies, no addresses) under Reports, "Messages sent". Marketing messages: none, so no opt-out link is needed. Setting: `NOTIFY=messages`.
