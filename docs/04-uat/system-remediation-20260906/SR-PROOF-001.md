# SR-PROOF-001 — Fresh-base regression evidence and unresolved implementation scope

Date: 2026-09-08. Owner: Codex2; Reviewer: Codex.

## Redispatch verification — 2026-09-08 22:25 UTC

Base remains `a24045986ac29231d34657df3a343b02d9fbb770`; tested HEAD is
`c3fc95d598daafd8d927130384c32db2dd823c8a`. No implementation candidate.
This rerun confirms the previous blockers after the 22:24 parent resume:

- `git fetch origin`: exit 0.
- `git rebase origin/dev`: exit 1, repeated historical `ac1076708` add/add
  conflict in payment-gate.test.ts; `git rebase --abort`: exit 0.
- `git diff --quiet origin/dev HEAD -- apps/api/src/modules/billing-settlement/billing-settlement.service.ts apps/api/src/modules/billing-settlement/billing-settlement.repository.ts`:
  exit 0; tested implementation matches current dev.
- `pnpm exec vitest run tests/unit/system-remediation/sr-proof-001/`:
  exit 1, 3 executed / 1 passed / 2 failed. Fabricated proof becomes paid;
  unresolved persistence returns paid. Unapproved rejection passes.
- `pnpm --filter @drts/api typecheck`: exit 2, four TS2307 errors for
  `@drts/control-plane-auth` in auth files.
- `pnpm --filter @drts/platform-admin-web typecheck`: exit 0.

Read the history helper directly from origin/dev: merge `99858938` documents
a recovery procedure, not an applied parent-branch repair. Its "Parent next
step and remaining blockers" explicitly requires supervisor scope/dependency,
canvas routing, and recovery-branch selection before redispatch. Current
parent machine truth still has the original five write scopes and two
dependencies; SR-CONTRACT-001 remains todo. These prerequisites remain open.
Supervisor must apply the planning helper's routing actions, not resume solely
because the history documentation helper is done.

Resource IDs are the isolated inputs listed below. No live resources, uploaded
proof bytes, scanner/readback, PostgreSQL concurrency, durable receipts,
browser/device acceptance, or real payment were produced or verified.

## Redispatch verification — 2026-09-08 21:43 UTC

This section supersedes earlier command results. Fetched base `origin/dev`:
`a24045986ac29231d34657df3a343b02d9fbb770`; tested branch HEAD:
`2191754ca83a70985edab29bdfba24dd650779ff`. Candidate SHA: none; acceptance
is still red, so this update is evidence only.

- `git fetch origin`: exit 0.
- `git rebase origin/dev`: exit 1 at historical `ac1076708`, a repeated
  add/add conflict in the task test. `git rebase --abort`: exit 0.
- `git diff --quiet origin/dev HEAD -- apps/api/src/modules/billing-settlement/billing-settlement.service.ts apps/api/src/modules/billing-settlement/billing-settlement.repository.ts`:
  exit 0. The tested implementation in these files matches fetched dev.
- `pnpm exec vitest run tests/unit/system-remediation/sr-proof-001/`:
  exit 1; 3 executed, 1 passed, 2 failed. Fabricated proof still becomes
  paid; unresolved persistence still returns paid. Unapproved rejection passes.
- `pnpm --filter @drts/api typecheck`: exit 2; TS2307 for
  `@drts/control-plane-auth` in four auth files.
- `pnpm --filter @drts/platform-admin-web typecheck`: exit 0.
- `git diff --check`: exit 0 before this evidence anchor.

Current machine truth still grants only the original five write scopes and
ARTIFACT/INVOICE dependencies. `SR-CONTRACT-001` is todo, owned by Codex.
The planning helper's required scope/dependency/design routing remains
unapplied; history-helper completion alone does not supply it. Supervisor
must authorize the repository/module and exact storage/scanner leaves,
allocate the proof contract and dependency (or reviewed alternative), route
the existing missing-screen requirements, and select the recovery branch
before redispatch. No out-of-scope implementation was attempted.

Resource IDs remain the isolated test inputs listed below. No live resources,
proof bytes/scans/readback, PostgreSQL concurrency, durable receipts,
browser/device checks, or real payments were produced or verified.

## Redispatch verification — 2026-09-08 21:30 UTC

This section supersedes previous execution results. Fetched base `origin/dev`:
`5afb3e5b4bd525d59d52a5113bb60c6129100471`; tested branch head:
`dcd8f7996af76a17fed9ad43d1acc61e0f2c1fa3`. No implementation candidate
is nominated because acceptance remains red.

- `git fetch origin`: exit 0.
- `git rebase origin/dev`: exit 1, historical `ac1076708` add/add conflict
  in payment-gate.test.ts. `git rebase --abort`: exit 0; published ancestry retained.
- `git diff --quiet origin/dev HEAD -- apps/api/src/modules/billing-settlement/billing-settlement.service.ts apps/api/src/modules/billing-settlement/billing-settlement.repository.ts`:
  exit 0; tested billing implementation matches the fetched base.
- `pnpm --filter @drts/api typecheck`: exit 2, TS2307 for
  `@drts/control-plane-auth` in four auth files.
- `pnpm --filter @drts/platform-admin-web typecheck`: exit 0.
- `pnpm exec vitest run tests/unit/system-remediation/sr-proof-001/`:
  exit 1, **3 executed, 1 passed, 2 failed**. Unapproved rejection passes;
  fabricated proof resolves paid; pending persistence also returns paid.
- `git diff --check`: exit 0 before evidence commit.

Resource IDs are the isolated test inputs documented below; no live resource
IDs were created. No upload/scanner/readback, PostgreSQL concurrency, durable
receipt, browser/device, or real payment acceptance was performed.

The fresh parent task slice still lists only ARTIFACT/INVOICE dependencies
and the original five write scopes. SR-CONTRACT-001 remains todo (owner Codex).
Reconciliation of PR #1825 did not supply the required proof authority or
authorize repository/module/storage/scanner changes. The planning helper's
required next-actor actions remain applicable: supervisor must allocate those
exact scopes and dependency, route missing canvas states, and select the
history recovery branch before implementation redispatch. This evidence-only
anchor must not be treated as a successful implementation candidate.

## Redispatch verification — 2026-09-08 21:22 UTC

This section supersedes the older command results below for this dispatch.
Fetched `origin/dev`: `e97653b7ffb962a6c4d688e8706711d860fa3604`;
execution head: `acd6b7bb4d32329986a04cd6050624bc1fc39f34` on the assigned
`codex2/sr-proof-001` worktree. No implementation candidate is nominated.

- `git fetch origin`: exit 0.
- `git rebase origin/dev`: exit 1, duplicate historical reproducer commit
  `ac1076708` conflicts add/add in the task test. `git rebase --abort`: exit 0;
  restored the published head without rewriting or merging repeated anchors.
- `git diff --quiet origin/dev HEAD -- apps/api/src/modules/billing-settlement/billing-settlement.service.ts apps/api/src/modules/billing-settlement/billing-settlement.repository.ts`:
  exit 0. These two product files match current dev exactly; source inspection
  still shows only a nonempty proof ID check and an unawaited persistence call.
- `git diff --check`: exit 0.
- `pnpm --filter @drts/api typecheck`: exit 2, missing Node type definitions.
- `pnpm --filter @drts/platform-admin-web typecheck`: exit 2, missing dependency
  types; Next's automatic dependency attempt reports
  `ERR_PNPM_UNEXPECTED_VIRTUAL_STORE` pointing at the SR-PUSH-001 worktree store.
- `pnpm exec vitest run tests/unit/system-remediation/sr-proof-001/`: exit 1,
  suite import fails on missing `@nestjs/common`; **zero tests executed**.
  The older 1-pass/2-fail result below was not reproduced in this environment.

The completed history helper explicitly says history repair does not clear
scope/dependency/canvas routing blockers (see
`support/unblock/SR-PROOF-001/SR-PROOF-001-UNBLOCK-HISTORY-REPAIR.md`,
"Parent next step and remaining blockers"). The current task slice still
has only ARTIFACT/INVOICE dependencies and the original five write scopes.
Supervisor must apply the documented repository/module/storage/scanner scope
expansion, contract allocation/dependency, canvas routing, and select the
unused recovery branch before another implementation dispatch. Helper closure
alone is not authorization to write shared files. The original screen
requirements below remain the design handoff.

No new resource IDs, uploaded bytes, live payment, browser/device evidence,
or durable receipt were produced. Dependency failures are environment failures,
not passing acceptance or fresh execution evidence for the historical red tests.

## Current result

- Fresh base: `origin/dev` at `70355aba9f8c7a878941144d6f551586d957afc9`.
  `git fetch origin` and `git rebase origin/dev` both exited 0. The only add/add
  rebase conflict was whitespace-only in this task's test; the equivalent
  formatted test was retained.
- Branch: `codex2/sr-proof-001`; this evidence is an anchor, not a candidate.
  Do not hand off until the red acceptance regressions below are made green by
  the authoritative proof flow.
- `SR-ARTIFACT-001` and `SR-INVOICE-001` are machine-truth `done`. Their merge
  SHAs `3e1904b1318a3252d3f7b5673173608fd6d12f71` and
  `a4876ac529abfb634c2b96f237116202abf3d87d` are both ancestors of `origin/dev`
  (`git merge-base --is-ancestor ... origin/dev`, exit 0 for each).

## Reproduced state on the current base

The current `BillingSettlementService.markReimbursementPaid` still accepts any
non-empty `remittanceProofId`, mutates the batch and related statement, then
calls `persistChanges` without awaiting it. It has no authoritative proof
record, proof-to-batch/driver ownership assertion, scan-state gate, durable
receipt, or transaction/CAS covering concurrent approve/pay.

`tests/unit/system-remediation/sr-proof-001/payment-gate.test.ts` uses only
isolated inputs `sr-proof-001-batch-a`, `sr-proof-001-driver-a`,
`sr-proof-001-statement-a`, and `sr-proof-001-nonexistent-proof`; it creates no
uploaded object, live payment, or external notification.

| Command                                                            | Exit | Result                        |
| ------------------------------------------------------------------ | ---- | ----------------------------- |
| `git diff --check`                                                 | 0    | clean                         |
| `pnpm --filter @drts/api typecheck`                                | 0    | passed                        |
| `pnpm --filter @drts/platform-admin-web typecheck`                 | 0    | passed; route types generated |
| `pnpm exec vitest run tests/unit/system-remediation/sr-proof-001/` | 1    | 3 tests: 1 passed, 2 failed   |

The passing assertion rejects an unapproved batch with
`REIMBURSEMENT_NOT_APPROVED` and makes no persistence call. The two required
regressions remain red:

1. A fabricated proof ID resolves with `status: paid` instead of rejecting.
2. With a pending repository write, the method returns `paid` before the write
   resolves.

These are meaningful failing acceptance regressions, not skipped tests or a
`passWithNoTests` result. They show that the task cannot truthfully be handed
off on the present code.

## Required reviewed scope before implementation

Current write scope allows the billing service/controller, reimbursement UI,
this task's tests, and this evidence only. It does not authorize the shared
contracts, persistence, migration, artifact/scanner adapter, or API-client
surfaces required to establish an authoritative, durable proof lifecycle.

Supervisor must expand scope and add the owning dependency before implementation:

1. Allocate a proof contract plus dedicated migration and persistent repository
   storage for batch/driver ownership, object key/hash/MIME/size, uploader/time,
   scan result, and a durable payment receipt.
2. Allocate a named proof upload/scanner/readback adapter using the existing
   attachment/storage authority; do not repurpose SOS or supply attachments,
   and do not simulate scanning with a fixture or fixed success value.
3. Permit the billing transaction/CAS boundary that atomically checks approved
   batch, proof existence/ownership/clean scan status, paid transition, related
   statement, and idempotent receipt. This is necessary for retries and
   concurrent approval/payment verification.
4. Once those dependencies are merged, add green cases for fabricated,
   other-batch, unscanned, and unapproved proof rejection; legal proof payment
   and authorized readback; retry receipt; and concurrent persistence behavior.

No product source outside the assigned scope has been changed, and no fake
signature, fixed percentage, or live payment was used.

## UI design boundary

Read before UI work: `packages/ui-tokens/src/realms.ts` and canonical Platform
Admin canvas `Platform Admin.html` / `platform-screens-3.jsx`. The canvas
contains the reimbursement queue and detail state-machine layout, using the
platform realm tokens, but lacks a proof upload, scan/error/retry, and
authorized-readback screen specification. Per the task design contract, no UI
was invented or changed.

The canvas owner must specify the placement and state treatment for file
selection/upload, MIME and size validation, scan pending/clean/infected/error,
payment-disabled reasons, duplicate-submit behavior, proof metadata, and
expired-link reauthorization. It must retain the existing Platform Admin shell
and `@drts/ui-tokens` platform realm styling; no raw palette is authorized.

## Verification boundary

This work did not perform legal-proof byte upload/scanning/download, real
PostgreSQL multi-instance concurrency, durable production receipt validation,
browser interaction, live payment, or device testing. Those remain explicitly
unverified rather than represented as successful acceptance.
