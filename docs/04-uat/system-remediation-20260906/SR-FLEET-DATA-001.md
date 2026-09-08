# SR-FLEET-DATA-001 — dispatch verification, 2026-09-08

Owner: Codex. Reviewer: Codex2. Implementation remains incomplete; no review candidate is locked.

## Source and revision

- Execution: `docs/03-runbooks/system-remediation-execution-tasks-20260906.md` and its task spec.
- Traceability: source findings R10 (mixed dashboard/list data), R11 (inactive actions), R24 (filters); capabilities C013, C063, C064, C069. C013's source describes enterprise history and is not independently validated by these fleet tests.
- Current fetched/rebased base: `3b60a3757238663572f16f010c94f446f2c71eaa` (`origin/dev`). Historical September 6 observations are not current verification.
- Starting published task SHA: `98bf5563a45c021e9689b11f3a5559be2aa245c1`.
- Tested implementation anchor: `3a7e409666eac263f002983fc20261ea8efc3ba5`.
- Published progress SHA: `9a426f64e` (merge retaining the pre-rebase published history; `git diff HEAD^ HEAD --stat` returned no changes). Final evidence-only commit follows this SHA. Neither is a handoff candidate.

## Confirmed changes

Existing work wires recruitment/vehicle creation links, query-based driver/vehicle/trip filters, and trips/summary CSV routes. It removes operational dashboard fallback constants and returns empty unintegrated cases/training loaders. This dispatch adds regressions for disagreeing dashboard aggregates and partial list failures:

- Dashboard roster and completed-trip counts now derive from the same loaders as lists, even when aggregate counts disagree.
- Dispatchable count uses API `dispatchEligible`, not merely available work state.
- Partial list/aggregate errors remain visible; failed count reads show an em dash, not a successful zero. Summary export rejects an incomplete read.
- Missing aggregate money is unknown rather than fabricated NT$ 0.

No UI layout/palette changes were made in this dispatch. Inspected canonical fleet canvas (`fleet-screens.jsx`), token exports, and the existing partner theme. Existing branch UI still needs full browser/design review.

## Commands actually executed

| Command | Result |
| --- | --- |
| `git fetch origin` | exit 0 |
| `git rebase origin/dev` | exit 0, four commits replayed |
| `pnpm exec vitest run tests/unit/system-remediation/sr-fleet-data-001/` before new regressions | exit 0, 14 tests |
| same command after regression additions, before fix | exit 1, 3 failed / 13 passed |
| same command after fix, 12:19:25 UTC | exit 0, 16 tests, 576 ms |
| `pnpm --filter @drts/fleet-partner-portal-web typecheck` | exit 0; next typegen and tsc completed |
| `git diff --check origin/dev...HEAD` | exit 0 |
| `git push -u origin codex/sr-fleet-data-001` after rebase | exit 1, non-fast-forward |
| ordinary merge of published task history | two conflicts; inspected and retained current fixes in loader/test; final tree unchanged |
| `git push -u origin codex/sr-fleet-data-001` after ancestry merge | exit 0, `98bf5563a..9a426f64e` |

Unit tests mock the API seam. Resource IDs are test-only: partner `fp-test-001`, drivers `drv-01`/`drv-02`, trips `ord-001`/`ord-002`/`ord-003`. They do not prove live partner isolation, authorization, or delivery.

## Remaining work and supervisor scope request

Acceptance is not yet complete. Earlier evidence overstated the implemented behavior; this report supersedes it.

1. `app/training/page.tsx` and `app/cases/page.tsx` ignore loader `connected: false` and still render `data.fixtureNotice`. The task explicitly requires visible unintegrated states. Both pages are outside write_scopes. Supervisor must expand scope and add dependencies for overlapping case/academy lanes before editing.
2. `components/portal-tables.tsx` renders default `docs: complete` and `training: complete` as successful statuses, although the driver endpoint does not provide these fields. Neutral unknown representation requires coordinated table/type/copy changes. Request scope for this shared component and `lib/translations.ts` (and any shared fixture type consumer if required), with appropriate dependencies. Do not label unknown data complete.
3. Continue in-scope CSV edge tests: grouped numeric summary values such as `1,000` are currently joined without CSV quoting; page/export status-filter parity and default period need validation. Driver available filter should use the same eligibility semantics as dashboard. These are pending implementation, not passing acceptance.
4. Detail consistency, browser filter/navigation/download behavior, and design fidelity remain unverified. There is no trip detail route in the task's existing trips directory. Confirm intended detail surface/canvas before adding a screen.

No live API, Cloud Run, browser/E2E, physical-device, independent review, same-candidate CI, merge-to-dev, or deployment verification was performed. No `done` or `handoff` is appropriate yet.

## Resumed dispatch — 2026-09-08 15:51 UTC

- Fresh base: `f372e4a6a0dd16204ccbd660f23013601357c224` (`origin/dev`). Starting published progress: `196df659a7a3247da5a10930a162bd6b2d7dc178`.
- Rebase initially conflicted because the earlier ancestry-preserving merge includes duplicate historical patches. Aborted the first attempt; on the second, skipped already-applied historical commits `bfb0a30f9`, `3ee84f73a`, `2ebacdb5c`; Git automatically dropped duplicate `98bf5563a`. Rebase completed exit 0. The scoped application/test/evidence diff against the starting published progress was empty before new edits.
- Merged the published branch ancestry normally (exit 0, no tree changes), then ordinary push succeeded at `5ed459db9`. No force push or stash was used.
- Implementation anchor `c858642cd` was committed and normally pushed. The final evidence/test commit is a progress revision, **not a candidate**. Candidate SHA: unset; acceptance remains incomplete.

In-scope changes in this dispatch:

- CSV serializes every field with delimiter/quote/newline escaping, including grouped summary counts (`1,000`) and resource IDs.
- `loadTrips()` defaults to the current UTC month, matching dashboard; explicit periods remain passed to the authoritative API. Dashboard navigation carries the selected period to trips.
- Trips page applies the existing export status query and preserves it through tabs, search submissions and export links. Available-driver count/filter uses API `dispatchEligible`, matching dashboard.
- Layout, realm palette and typography were not changed. Read canonical `fleet-screens.jsx` and `packages/ui-tokens/src/realms.ts` before page edits. No detail screen was invented.

Commands actually executed on this resumed work:

| Command | Result |
| --- | --- |
| `git fetch origin` | exit 0; base above |
| `git rebase origin/dev` | initial duplicate-patch conflict, resolved as described above; final exit 0 |
| `git push -u origin codex/sr-fleet-data-001` | exit 0, `196df659a..5ed459db9` |
| `git push origin codex/sr-fleet-data-001` | exit 0, `5ed459db9..c858642cd` |
| `pnpm exec vitest run tests/unit/system-remediation/sr-fleet-data-001/` | exit 0; 1 file, 19 tests; 15:51:09 UTC, 620 ms |
| `pnpm --filter @drts/fleet-partner-portal-web typecheck` | exit 0; Next route type generation and TypeScript |
| `git diff --check` | exit 0 |

New unit scenarios use test-only IDs `drv-large-0` through `drv-large-999` and `ord,"quoted"`, plus the earlier partner/driver/trip IDs. API calls are mocked, including the 2026-10 UTC boundary; this is not live scope/isolation evidence. Page status-query and eligible-driver changes have typecheck and source inspection only, not browser verification.

### Remaining blocker (supersedes item 3 above)

CSV escaping and default-month defects are fixed. Shared page/table/copy scope remains unchanged in the current task slice. The merged helper `support/unblock/SR-FLEET-DATA-001/SR-FLEET-DATA-001-UNBLOCK-PLANNING-DECISION.md` and `Q-SR-FLEET-DATA-001` explicitly route scope extension, writer ordering and detail-surface choice to Supervisor/Chairman; the helper itself grants no scope. Await the four additional paths and acyclic ordering named above. Unknown documents/training presentation, truthful disconnected pages, and detail acceptance remain incomplete. Browser filter/navigation/download/design checks and live partner authorization remain unperformed. No same-candidate review, CI, merge, deployment or physical-device success is claimed.
