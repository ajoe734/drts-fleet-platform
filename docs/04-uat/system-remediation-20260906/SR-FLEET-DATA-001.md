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
