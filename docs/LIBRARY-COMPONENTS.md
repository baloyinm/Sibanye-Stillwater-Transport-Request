# Library components used by this project

Shared library: private repo `baloyinm/Re-usable-Component` (see its `CATALOG.md`).

| Component | Version | Status here | Use |
|---|---|---|---|
| `data/php-session-auth-guard` | 1.0.0 | planned for the PHP API | Server sessions, role and owner checks, sign-in rate limit, hashed passwords |
| `data/field-whitelist-update-helper` | 1.0.0 | planned for the Node server | Update only the columns a role may change |
| `business/geo-distance-rule` | 1.0.0 | planned (PHP and TypeScript copies) | Trip distance from coordinates (PHP `geo_distance.php`) |
| `data/dispatch-request-schema` | 1.0.0 | design reference | Safe accept / start / complete steps for a ride or trip request |
| `ui/synth-sound-cues-helper` | 1.0.0 | optional | Short alert sounds for new requests |

Rules for this project: no secrets or exports in the repo (see `.gitignore`); database changes go in `database/` as numbered files; each library component keeps its own README and tests in the library.

## Next steps
1. Move the PHP API's sign-in to `data/php-session-auth-guard` and test it against a copy of the database.
2. Add role and ownership checks to every API action.
3. Keep the Node server and the PHP API behaving the same, or retire one.
