# SR-PROOF-001 — Fresh-base regression evidence and unresolved implementation scope

Date: 2026-09-08. Owner: Codex2; Reviewer: Codex.

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
