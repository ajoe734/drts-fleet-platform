# SR-FLEET-DATA-001 planning decision routing

Date: 2026-09-08. Helper/parent owner: Codex. Reviewer: Codex2.
Integration base inspected: `031cfc4c99320b79f6ad863996a43a5da8227edf`.
Parent published progress inspected: `196df659a7a3247da5a10930a162bd6b2d7dc178`.

## Decision and authority

Route `Q-SR-FLEET-DATA-001` to Supervisor/Chairman for a narrow scope extension
and explicit shared-writer ordering. Preserve all parent acceptance. This
planning helper does not grant write scopes, replace API contracts, or approve
a product scope cut. Keep the parent blocked until authorization is recorded
using the current-release task-board commands.

The primary blocker is ownership/scope, not an unanswered permission to show
fabricated data. The parent [execution prompt](../../../docs/03-runbooks/system-remediation-20260906/SR-FLEET-DATA-001.md)
already requires training/cases to visibly report unintegrated state and
prohibits fixtures as completion. PRD §9.6.2 requires driver training records
and ties required credentials to eligibility; service contracts' Regulatory
Registry source-of-truth and `add_training_record` command assign that truth
to the regulatory service. Missing fields cannot establish completion.
The L2 glossary §0.2 gives page skeletons lower authority than these contracts.

## Evidence and overlaps

- The parent machine slice is blocked, waiting_for Gemini, with seven existing
  write scopes. Its published UAT report lists CSV/filter/detail/browser work
  still incomplete and explicitly requests the four scopes below. Its reported
  16 unit tests and typecheck success are inherited evidence, not rerun here.
- At the inspected integration base, `app/training/page.tsx` and
  `app/cases/page.tsx` still render `data.fixtureNotice`;
  `components/portal-tables.tsx` renders successful document/training badges
  when values are `complete`. The parent report identifies unsupported default
  completion values. UI must distinguish unknown, unintegrated, failed, and
  successful empty data without asserting regulatory qualification.
- `SR-FLEET-CASE-001` owns `app/cases/` and the shared loader, and already
  depends on `SR-FLEET-DATA-001` and `SR-CONTRACT-001`. Do not introduce the
  reverse dependency and deadlock both tasks.
- `SR-ACADEMY-FE-001` currently belongs to Claude with reviewer Codex2; its
  scope includes `app/training/` and `lib/academy-data.server.ts`. Its execution
  prompt requires a separate academy adapter and explicitly leaves shared
  fleet-loader governance to FLEET-DATA. Do not reconnect academy to fixtures.

## Concrete supervisor follow-up

1. Review current overlapping writers, then authorize only these additional
   parent paths for truthful disconnected/unknown presentation:
   `apps/fleet-partner-portal-web/app/training/page.tsx`,
   `apps/fleet-partner-portal-web/app/cases/page.tsx`,
   `apps/fleet-partner-portal-web/components/portal-tables.tsx`, and
   `apps/fleet-partner-portal-web/lib/translations.ts`.
   If a shared row type requires modification, inspect its consumers and name
   that exact file in a further scope authorization before editing it.
2. Record scope and ordering in machine truth and synchronize the reviewed
   execution spec. Preserve CASE after DATA. Prefer DATA's minimal truthful
   training state before ACADEMY-FE replaces the page; supervisor must record
   that ordering/dependency and check for cycles. If academy has already
   delivered, rebase and verify its real adapter instead of overwriting it.
   Serialize the shared loader/table/copy writers; do not assume the separate
   `fleet-data` and `academy-ui` resource names prevent page collisions.
3. Codex/Codex2 must identify the detail surface required by parent acceptance
   using the current route and fleet design references. The published parent
   report found no trip detail route in its trips directory. Name the route,
   canonical resource ID, authority and partner-visibility rules before
   implementing a screen. If the accepted design does not settle that choice,
   leave this question open for product review; do not silently drop detail
   acceptance or invent a new endpoint.

These are follow-ups on the existing parent task. No new implementation task
or expanded scope is claimed registered by this document. If supervisor chooses
a separate producer, it must register owner, reviewer, exact scopes and acyclic
dependencies before dispatch, while preserving the parent's acceptance.

## Parent next step and resume gate

When dispatched, Codex can first resume existing in-scope work from the published
parent branch rebased onto fresh `origin/dev`: add CSV quoting coverage for
grouped numbers, verify page/export status and default-period parity, and align
the available-driver filter with API eligibility. Preserve prior published work;
do not treat its progress SHA as an accepted candidate.

After supervisor records the scope/ordering authorization, implement visible
unintegrated states and neutral unknown document/training rendering. Keep
successful zero distinct from errors; verify dashboard/list/detail/export
resource scope, filters, and browser navigation/download behavior. Do not mark
the parent unblocked merely because this helper is reviewed.

Run the parent's declared `pnpm exec vitest run
tests/unit/system-remediation/sr-fleet-data-001/`,
`pnpm --filter @drts/fleet-partner-portal-web typecheck`, and `git diff --check`;
record actual commands, exits, base/candidate SHA and resource IDs. Browser/live
checks need their own evidence. Commit, normal push and exact-SHA handoff follow
only after the parent's implementation and executable checks are complete.

## Helper validation and delivery

Read-only inspection of current task slices, cited specifications, current pages
and the parent's published evidence; `git fetch origin` and `git rebase
origin/dev` exited 0. This change is planning-only; no application tests or live
requests were run. Diff/link checks and commit/push/PR evidence are recorded in
the helper handoff. Review/CI/merge remain candidate-lifecycle gates.
