# Library log

## Events
| Date | Component | Action | Version | This project's commit | Library commit |
|---|---|---|---|---|---|
| 2026-11-14 | data/php-session-auth-guard | USE (Node copy in `lib/`) | 1.1.0 | see git log | ed556b6 |
| 2026-11-14 | business/geo-distance-rule | USE (JavaScript port in `lib/`) | 1.0.0 | see git log | ed556b6 |
| 2026-11-14 | data/dispatch-request-schema | USE (design reference) | 1.0.0 | see git log | ed556b6 |

## Re-audits
| Date | Found | USE | MODIFY | ADD | Notes |
|---|---|---|---|---|---|
| 2026-11-14 | first audit | 3 | 0 | 0 | Small parts built here because library parts are PHP/TypeScript/React; see PLAN.md |

## Waiting for the nightly sweep
- 2026-11-14 · JavaScript build of geo-distance-rule and a plain-JS demo/live data switch · ADD/MODIFY · candidates for the library; not published (no lock taken, other repos not touched in this session)

## Other
- Demo sign-in: ui/demo-quick-login-panel not used (not a Next.js app); plain buttons built, shown only in demo mode.
- Jarvis hub (H1 to H4): BLOCKED: not done in this session (no access to baloyinm/jarvis requested; other repos untouched). Status line and learning note still owed.
- UX gate: `ux_audit.py`, `ux_render_check.mjs`, `theme-contrast-test`: NOT RUN. Manual check at 390 px wide: no sideways scroll, no script errors (Playwright).
