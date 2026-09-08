# SR-DRIVER-WEB-001 planning decision routing

Date: 2026-09-08. Owner: Codex2. Helper reviewer: Gemini; parent reviewer: Codex.
Parent: SR-DRIVER-WEB-001. Canonical question: Q-SR-DRIVER-WEB-001 in
`PHASE1_OPEN_QUESTIONS.md`.
Inspected base after fetch/rebase: `6f4ac8c74ae3618b6109efd010014365a85d36d8`.

## Disposition

Route the missing shared-file authorization to supervisor. This is an engineering
scope blocker; the evidence does not require a new product/contract decision.
Retain full parent acceptance. No scope cut, new UI, API change, dependency upgrade
or replacement of the persistent offline queue is authorized by this helper.
The parent stays blocked pending machine-truth scope/dependency authorization.

## Evidence and source precedence

- Parent machine slice identifies owner Codex2, reviewer/waiting_for Codex and
  pushed anchor `b148247c7dac43d29e58a4da36992f94e8a318a1`, with no candidate.
  Its UAT report was inspected via `git show <anchor>:docs/04-uat/system-remediation-20260906/SR-DRIVER-WEB-001.md`;
  that report is absent on this helper's base and must not be presented as merged.
- That historical report records web export exit 1 resolving
  `./wa-sqlite/wa-sqlite.wasm` from `expo-sqlite/web/worker.ts`, despite the file
  existing. It records typecheck, five platform tests and 91 existing regressions
  passing, plus iOS/Android Hermes export exit 0. These are inherited results,
  not rerun results or native-device acceptance from this planning task.
- Current source inspection confirms `_layout.tsx` imports location heartbeat,
  which imports the offline queue, which imports `expo-sqlite`. The package
  declares `expo-sqlite ~16.0.10`. No `apps/driver-app/metro.config.js` is tracked
  at the inspected base. Adding it is outside the parent's current write scopes.
- `docs/03-runbooks/system-remediation-execution-tasks-20260906.md` rules 3–4
  require supervisor scope and dependency updates for shared writes. The parent
  runbook permits only map components, its test directory and its UAT report.
  This routing document does not amend those permissions.
- PRD §9.4 and service contracts §3.8 retain Driver App fulfillment and Driver
  Task Service state ownership. The parent's narrower web-preview repair cannot
  redefine those semantics or treat successful bundling as live SOS delivery.

## Required action and concrete continuation

1. Supervisor reviews current overlapping writers and authorizes the narrow
   addition `apps/driver-app/metro.config.js` to the parent, retaining its existing
   test/report scopes. Record reviewed scope, necessary dependency edges and
   corresponding planning/runbook digest consistently through the current
   release task-board workflow before implementation. A serial-resource label
   alone is not a file lock. Preferred route is this scope extension; if a
   separate bundler producer is required, register its owner/reviewer, exact
   scopes and acceptance in machine truth and add a parent dependency first.
   The existing parent/helper track this pending request; this note does not
   claim a new producer has been registered.
2. Codex2 resumes the parent rail from fresh `origin/dev`, checks ancestry and
   preserves the pushed map-isolation work. Reproduce the web error at that
   revision before selecting the minimal Metro fix. Distinguish worktree symlink
   resolution from product configuration; the parent's harness is diagnostic,
   not proof of a production fix. Configure actual SQLite WASM loading without
   no-op queue substitutions. Any further shared file, package/lockfile or
   hosting-header change requires an additional reviewed scope/dependency route.
3. Run `git diff --check`, `pnpm --filter @drts/driver-app typecheck`,
   `pnpm exec vitest run tests/unit/system-remediation/sr-driver-web-001/`, and
   the affected existing navigation/auth/SOS/keyboard/responsive regressions
   listed in the parent report. Export web and both iOS/Android with the actual
   candidate configuration. Inspect native source maps for native map entry
   selection and exclusion of the web entry.
4. Serve the web export and browser-check `/`, `/onboarding`, `/sos`, including
   console/worker/network errors and actual SQLite asset loading. A successful
   export alone does not establish browser compatibility. Record real commands,
   exit codes, route results, base/candidate SHA and resource IDs. Keep live SOS,
   GPS lifecycle, signed builds and physical-device checks explicitly unperformed
   unless separately executed; native Hermes export does not establish them.
5. Parent owner commits, normally pushes, opens its PR and hands off the exact
   candidate to Codex only after those gates pass. This helper's review does not
   approve the parent or satisfy its implementation/CI/merge acceptance.

## Helper validation

Planning-only change: read-only parent/anchor/source inspection and
`git diff --check` (exit 0). No application tests, exports or browser checks were
run by this helper. Delivery SHA, normal push and PR evidence are recorded in
the helper's machine-truth handoff; scope authorization remains pending.

## PR integration refresh (2026-09-08)

PR #1761 previously carried candidate `1fac2cead7f8401d8374a76c8f8d79b7eaf1c425`.
The dispatch reported a merge conflict after dev added the enterprise-search
planning question. Rebased onto `031cfc4c99320b79f6ad863996a43a5da8227edf`,
retaining both questions and all existing planning entries. Reconciled the
published task head as a merge parent so the updated candidate can be pushed
without rewriting remote history. The helper reviewer now matches dispatch
(Gemini); the parent reviewer remains Codex.

Validation: `git diff --check` and `git diff --cached --check` exit 0; the
planning diff against this dev base preserves the enterprise-search entry.
No product behavior changed or application checks rerun. Prior candidate CI
and review do not certify the replacement candidate; fresh review/CI are needed.
The parent still requires supervisor scope authorization described above.
