# CLAUDE.md: sibanye-stillwater-transport-request

<!-- reuse-rule:start v1.6.0 — managed by baloyinm/Re-usable-Component/rules/reuse-rule.md; update it there, not here -->
## Re-usable components: check, reuse or modify, then build (Jarvis rule)

The shared library is the private repo **baloyinm/Re-usable-Component** (`CATALOG.md` lists everything; `NAMING.md` sets names). Goal: more planning, less work. Nothing is built from scratch if a library component already does the job, or can be modified to do it.

**At the start of every session: library notices**
0. Pull `baloyinm/Re-usable-Component` and read `FIX-NOTICES.md`, `DECISIONS.md` and `WHATS-NEW.md`. For every open fix notice addressed to this project: apply the fix to this project's copy, test it here, then mark the notice done in the library (date, commit) and update this project's line in `USAGE.md`. Follow every decision ("use X, not Y"). Note new components that this project could use.

**Reuse check: required before building anything (every task, every session)**
1. Plan first: list the parts the task needs.
2. Search the library for every part: clone or pull `baloyinm/Re-usable-Component`, run `python3 tools/find.py --plan "<part one>" "<part two>" ...` (it shows the closest components for each part, strong and partial matches), and read `CATALOG.md`. Open the README of every strong or partial match.
3. Decide each part, in this order:
   - **USE**: a component already does the job. Use it as it is.
   - **MODIFY**: a component does part of the job, or would with a new option or setting. Change that component in the library (keep the projects already using it working, raise its version), then use it.
   - **BUILD**: only when nothing comes close, or when changing the closest one would break the projects using it or take more work than building new.
4. Write the reuse check into your plan before writing any code, one line per part: `part · closest component (or none) · USE / MODIFY / BUILD · why`. No building starts until it is written. For every BUILD, say why MODIFY was not possible.
5. Record what you used in the commit: `uses <name> v<version>`, and add or update this project's line in the library's `USAGE.md` (`component · version · project`), so fixes reach you.

**While building**
6. Build every BUILD part, and anything else that could be used again (a screen part, chart, template, script, connector, sync, scheduled-task prompt, business rule), as a self-contained, generic component: settings instead of hard-coded names, amounts or IDs.
6a. **UI and UX are components too (v1.4.0, 10 Nov 2026).** A project with screens must also turn its reusable UI and UX parts (app shell, navigation, forms, tables, cards, status chips, dashboards, empty, loading and error states, theme tokens, phone layouts, print pages, accessibility fixes) into `ui/` components, with `ui/white-label-ui-kit` as the base (improve it, never a parallel kit). Run `ui/ux-audit-script` and `ui/theme-contrast-test` before you publish a screen, and say in the final summary which UI components were used, modified or added.
6b. **Demo sign-in (v1.6.0, 11 Nov 2026).** A project with a sign-in and seeded demo users never writes its own demo picker: it USES `ui/demo-quick-login-panel` (server-action cards, or the 1.1.0 persona switcher for demos that only swap a mock session) so evaluators sign in with one click. Accounts and passwords stay on the server or are made up, it is switched on only on the demo deployment, and it is hidden behind `ui/test-tools-gate`. Not a Next.js app: port `src/demo-login.ts`, which is plain logic. A project with no sign-in writes `n/a` in `LIBRARY-LOG.md`.
7. Name it by `NAMING.md`: `<area>/<subject>-<what-it-is>`, for example `ui/hud-donut-chart` or `integrations/markets-price-feed`.

**When it works: commit to the library**
8. MODIFY parts: commit the change to the library as `improve <name> (from <this project>): <what changed>`, raise its version, and update its README and its `CATALOG.md` line. If old use had to break, raise the major version and say in the README what to change. Never make a parallel copy instead.
9. BUILD parts: run the duplicate check again (`python3 tools/find.py <2 to 4 words describing it>`). If anything now does the same job, even partly, treat it as MODIFY. Otherwise add it in its area folder with a `README.md` (header block from `NAMING.md`) and a small `example/`, add one line to `CATALOG.md`, run `python3 tools/find.py --check`, then commit `add <name> (from <this project>)` and push.
10. Two components that do the same job are never allowed. If you find a pair, merge them and mark the weaker one `deprecated`, pointing to the other.
11. Never put passwords, keys, tokens, client data or personal details in the library.
11a. Test before you publish: run the component's example or tests; a component that was not run end to end goes in as `status: draft`.
11b. One publisher at a time. Before any commit to the library, take the publish lock: pull, and if `.publish-lock` exists with an `expires` time still in the future and another holder, wait 5 minutes and check again (up to 6 times), then leave your components for the nightly sweep and say so. Otherwise write `.publish-lock` (`holder: <project> <session>`, `started`, `expires`: started + 60 minutes), commit `lock: <project> publishing` and push. If that push is refused because someone else pushed, pull and check the lock again. Commit your components one at a time (pull --rebase before each push), then delete `.publish-lock`, commit `unlock: <project>` and push. Never delete another holder's lock unless it has expired.
11c. If you cannot publish today, leave a line in this repo's `LIBRARY-TODO.md` (`<date> · <part> · ADD/MODIFY <name> · why`): the nightly library sweep (`automations/library-publish-sweep-prompt`) picks it up, tests it and publishes it.

11d. **Keep the log (v1.5.0, 10 Nov 2026).** Every project keeps `LIBRARY-LOG.md` in its repo root (template: `rules/library-log-template`): one line per library event (ADD, MODIFY or USE) with date, component, version, this project's commit and the library commit, plus a line under Re-audits each time it re-audits its past work. Add the line in the same commit as the change. The library's own matching log is `CONTRIBUTIONS.md`, built by `python3 tools/contrib-log.py --write` before every library commit.

**At the end of each session**
12. In your final summary, show the reuse check lines and list the components used, modified and added.

**New projects** get this section in their CLAUDE.md on day one, with the shared Jarvis token and model rules.
<!-- reuse-rule:end -->
