# SR-ENTERPRISE-DATA-001 — partial implementation evidence

Owner: Codex2; reviewer: Codex. Status: blocked pending supervisor scope expansion. No review candidate is submitted.

## Revision evidence

- Previous base: `6a496d182eb2b41faa8a63e03a6054ae8dde26c9`.
- Fetched origin/dev base on 2026-09-08: `6f4ac8c74ae3618b6109efd010014365a85d36d8`.
- Existing home implementation was rebased onto that base. Published anchor `e563d22be05676aa9b69a929baafaa3cdf623476` was then merged without content changes to retain remote ancestry for a normal, non-force push.
- Tested implementation/test revision: `88fc2c7010e559c9915c9cb376d39c704e73a4bb`. Candidate SHA: none; this remains WIP. The subsequent documentation commit preserves this evidence.

## Current implementation and checks

The existing anchor replaces home demo bookings with tenant-client booking reads and introduces shared selection/read helpers. Explicit trip IDs propagate API failures without falling back to another booking. Missing bookings are classified separately from temporary failures. Trip UI is still the existing fixture implementation; helper coverage does not establish end-to-end integration.

Commands executed in the assigned isolated worktree:

- `git fetch origin`: exit 0.
- `git rebase origin/dev`: exit 0.
- `pnpm --filter @drts/enterprise-dispatch-web typecheck`: exit 0.
- `pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-data-001/`: exit 0; 1 file, 17 tests passed.
- `git diff --check`: exit 0.

Tests cover terminal booking exclusion, active selection, empty results, lifecycle stages, explicit missing-ID rejection without list fallback, 401/403/404 versus retryable error classification, and encoded booking navigation. Resource IDs `unit-active`, `unit-other`, `unit-missing`, `unit-stage`, `unit-cancelled`, and `unit-complete` are unit inputs only. No live resource was created or verified.

## Required supervisor unblock

Machine truth still lists only the original write scopes with no dependencies. Please expand scopes and register necessary dependencies before these shared files are edited:

- `apps/enterprise-dispatch-web/components/enterprise-booking-lifecycle.tsx`: detail fetch catch still defaults a 404 to `degraded` (lines 172–183 at tested revision).
- `apps/enterprise-dispatch-web/lib/enterprise-theme.ts`: still defines a raw palette instead of the required realm tokens. Home and trip use this shared theme. UI completion requires resolving this contract first.
- `apps/enterprise-dispatch-web/app/help/page.tsx`: support phone still comes from `enterpriseTenant.supportPhone` and the contact button has no real action. Linking trip support here would not meet acceptance.

`BookingRecord` in `packages/contracts/src/index.ts` exposes neither authorized driver contact nor ETA. Do not synthesize these fields from fixtures. Trip integration, unavailable-driver/contact states, and a legitimate support destination remain outstanding; supervisor should identify the authoritative contact dependency or approve the unavailable-contact path.

Traceability: execution task spec `docs/03-runbooks/system-remediation-20260906/SR-ENTERPRISE-DATA-001.md`; source findings R08/R09/R16; capabilities C013/C017/C018/C093/C108/C119. Historical R08 resource `EB-7K2E1D` is audit evidence only, not a current verified booking.

Not executed: browser interaction, live authenticated API, cross-tenant authorization checks, real phone/device navigation, CI, merge, deployment, or independent review. This document does not claim acceptance or completion.

## Redispatch verification — 2026-09-08 15:35 UTC

- Fresh base `origin/dev`: `52e8096e4441386901e57415ba06f6a2aabe4d0e`.
- Tested WIP revision: `da6d5b64c3ac7469e919a94cf7822d18ab764187`.
  Candidate SHA: none; implementation remains incomplete.
- `git fetch origin`: exit 0. `git rebase origin/dev`: exit 0.
  `git merge --no-edit origin/codex2/sr-enterprise-data-001`: exit 0,
  preserving published ancestry for an ordinary push without product changes.
- `pnpm --filter @drts/enterprise-dispatch-web typecheck`: exit 0.
- `pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-data-001/`:
  exit 0, 1 file / 17 tests passed (275 ms). Resource IDs are the unit inputs
  listed above; no live resource was verified.
- `git diff --check`: exit 0.

PR #1772 merged the history audit at `40c231ba6718dbf7a7ee6662e446d44e48eabcb3`.
Its report at `support/unblock/SR-ENTERPRISE-DATA-001/SR-ENTERPRISE-DATA-001-UNBLOCK-HISTORY-REPAIR.md`
explicitly says it does not clear the scope/dependency blocker. The current
`ai-status.sh show SR-ENTERPRISE-DATA-001` still has the original write scopes
and no dependencies. Static inspection at the tested revision confirms all three
shared-file gaps above remain, and trip still imports fixture bookings/driver.
Supervisor must adjudicate those scopes/dependencies and the authorized contact
source before UI completion. No new UI was written during this redispatch.
The live/device/CI/review/merge/deployment exclusions above remain applicable.

## Redispatch verification — 2026-09-08 15:42 UTC

- Fresh `origin/dev` base: `3f182f7e314b5ddb4c37f1c3f5dc214a6d0edf0e`.
- Tested WIP revision: `1247a3b414d0d91e3ac242cebd4ef96546cb7f7f`.
  Candidate SHA: none; trip integration and contact acceptance remain incomplete.
- `git fetch origin`: exit 0; `git rebase origin/dev`: exit 0;
  `git merge --no-edit origin/codex2/sr-enterprise-data-001`: exit 0.
  The merge retains published ancestry for ordinary non-force push.
- `pnpm --filter @drts/enterprise-dispatch-web typecheck`: exit 0.
- `pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-data-001/`:
  exit 0, 1 file / 17 tests passed, duration 341 ms.
- `git diff --check`: exit 0.
- Resource IDs remain the unit inputs documented above; no live IDs verified.

Read-back of the current task slice still shows the original write scopes and
`depends_on: []`. Inspection confirms the shared detail component still maps
unclassified errors, including missing bookings, to `degraded`; the shared theme
still hardcodes its palette; help still renders the fixture support phone and
buttons without contact actions. Trip still reads fixture bookings and driver.
The merged history-repair report explicitly preserves these scope/dependency
blockers. The dispatch statement that history repair resolved the parent blocker
does not supply the scope expansion required by the task's explicit guardrail.

Supervisor action required: authorize or assign the three shared-file fixes listed
above with recorded dependencies, and identify the authorized contact source.
Do not redispatch solely because history repair is done. No UI edits were made in
this verification. Browser, authenticated live API, real-device calls, independent
review, candidate CI, merge, and deployment have not been verified.
