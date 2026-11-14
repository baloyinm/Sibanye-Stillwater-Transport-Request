# Plan: Transport Hub (request, approve, dispatch, track)

**Purpose.** Let people on the sites ask for a vehicle, let a controller approve it and send a driver, and let everyone see where the trip stands.

**Users.** Requester (asks for a trip), Controller (approves, rejects, assigns), Driver (starts and finishes trips, shares position).

**First slice (built, demo data only).** Sign in; request a trip; controller approves or rejects with a reason; controller assigns the nearest free driver; driver starts and completes; requester sees status, history and a live straight-line distance. Phone-first, light and dark.

**What is real and what is demo.** All people, places and trips are made up (`DATA_MODE=demo`, the default). Live mode is switched by `DATA_MODE=live` and refuses to start until the MariaDB store is written (see MIGRATION.md).

## Reuse check
| Part | Closest library component | Decision | Why |
|---|---|---|---|
| Sign-in, sessions, roles, rate limit | data/php-session-auth-guard 1.1.0 | USE | Node copy pinned in `lib/` |
| Distance between positions | business/geo-distance-rule 1.0.0 | USE | JavaScript port in `lib/` (library has TypeScript and PHP) |
| Request, claim, complete steps | data/dispatch-request-schema 1.0.0 | USE as design reference | Existing schema is MariaDB and kept; step rules in `src/workflow.mjs` |
| Demo or live data switch | data/secure-profile-startup-guard 1.0.0 | BUILD (small) | That one is a security profile switch; `src/config.mjs` is 10 lines. Not MODIFY: different job |
| Demo sign-in buttons | ui/demo-quick-login-panel 1.2.0 | BUILD (small) | Library part is for Next.js; this app is plain JS. Logic is a list of buttons |
| History list | ui/audit-trail-panel 1.0.0 | BUILD (small) | Same reason (framework) |
| Page shell, forms, states | ui/white-label-ui-kit | BUILD (small) | Kit is React; no front-end source here yet. Move to the kit when the front end is rebuilt |

## Questions for Ntsakisi (one per line, terms explained)
1. Who approves a trip: one controller per site, or a chain (supervisor then controller)? (Approval chain = more than one person must say yes.)
2. Do requesters pick from a fixed list of places, or type any address? (Geocoding turns an address into map coordinates and needs a map service account.)
3. Which vehicle types exist, and does a request need a cost centre (the budget code the trip is charged to)?
4. Should a driver have to accept an assignment, or is it automatic? (Built: automatic.)
5. What should the requester be told by SMS or email, and when? (Nothing is sent until you say yes.)
6. Do you want road distance and arrival time? That needs a routing service (a paid map service); today it is straight-line only.
7. How are drivers' positions shared in practice: their phone browser, or a tracker in the vehicle?
8. Should the live site run on the existing PHP and MariaDB server, or the Node app? (Today only the Node app exists in this repo.)
9. Rotables (parts) requests: same flow as people trips, or a separate form with item lists?
10. What does POPIA (the South African privacy law) require us to keep or delete for trip history, and for how long?
