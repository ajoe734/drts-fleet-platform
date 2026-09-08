# SR-DRIVER-WEB-001 manual unblock diagnosis

Inspected 2026-09-08. Owner Codex2; reviewer Codex.
Disposition: remaining scope blocker documented; parent implementation is not unblocked.

## Evidence

- Assigned helper branch: `codex2/sr-driver-web-001-unblock-manual-unblock`.
  Fetch and rebase exited 0; inspected base `origin/dev` is
  `2a093872d05a7d0344adf9bb58f9e5c4c99861d1`.
- Parent machine slice was `todo`, last updated `2026-09-08T17:47:51Z`,
  resumed by Chairman because history-repair had completed. It still has no
  dependencies and only the original map-component, test-directory and UAT scopes.
- History helper PR [#1781](https://github.com/ajoe734/drts-fleet-platform/pull/1781)
  is MERGED: candidate `56a12033830128e9dfbdc5d3dcf5313dcc4b8be8`, merge
  `890548b4f357542968c8b14f33f23e0685be007a` (GitHub lookup exit 0).
  Its committed report explicitly says the Metro scope blocker remains and
  merging that helper does not authorize implementation. Completion of this
  helper likewise must not be interpreted as resolving the parent scope gate.
- Current `origin/dev` has no tracked `apps/driver-app/metro.config.js`
  (`git ls-tree origin/dev apps/driver-app/metro.config.js`: exit 0, empty).
  `_layout.tsx` still imports location heartbeat, which imports the offline
  queue, which imports `expo-sqlite`. Package requirement remains `~16.0.10`.
- Published parent head is `d5e947acb255f568b69956a3e92897ae22e572a1`.
  Its UAT report's 16:43 recheck records web export exit 1 resolving
  `./wa-sqlite/wa-sqlite.wasm` from `expo-sqlite/web/worker.ts` after history
  repair merged. These are historical reproduction results, not a new run.
- The parent runbook and execution rules 3–4 still require supervisor scope
  and necessary dependency changes before shared-file writes. The planning
  and history helper reports both route this exact action to supervisor.

## Diagnosis and concrete next step

The dependency-ready status reflects an empty dependency list, not authorization
to repair the bundler. The recorded resume reason conflates history-helper
completion with clearance of the separately documented Metro scope gate.
No additional branch repair or UI change is needed in this helper.

Supervisor must review overlapping writers and add the narrow
`apps/driver-app/metro.config.js` scope, necessary dependencies and consistent
runbook/planning digest through the current task-board workflow. Alternatively,
register a bundler producer and make the parent depend on it. This helper does
not grant that authorization or alter shared task manifests.

After authorization, redispatch the existing parent rail to Codex2. Preserve
published history following the history-repair report; reproduce against fresh
dev before selecting a fix. Keep the persistent queue and existing map split.
Run parent typecheck and scoped regressions, real web/iOS/Android exports, and
browser checks of `/`, `/onboarding`, `/sos` including SQLite asset/worker loading.
Record fresh base/candidate and actual command results; normally push and hand
off the parent candidate to Codex. Export success is not live/device acceptance.

## State and validation

The parent blocker and the above supervisor next step were written using the
current release `ai-status.sh blocker ... Codex`, routing to the registered
reviewer to coordinate supervisor authorization (`Supervisor` is not a valid
agent identifier in this release). Do not automatically
resume the parent solely when this documentation candidate merges.

This helper changes only this support artifact. `git diff --check` is the scoped
documentation check. No UI, runtime, tests or configuration were changed, and
no application export, browser, live SOS or device check was executed here.
Candidate SHA, normal push and PR evidence are recorded in the helper handoff.
Independent review/CI/merge remain required; the parent scope gate remains open.
