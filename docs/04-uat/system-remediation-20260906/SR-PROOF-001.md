# SR-PROOF-001 — Fresh-base payment-gate reproduction

Date: 2026-09-08. Owner: Codex. Reviewer: Claude.

## Base and result

- Base/candidate starting SHA: `origin/dev` / `70355aba97c23dd1cd592b71f1d3dfe6315d91ff`.
- Branch: `codex/sr-proof-001`. This is regression evidence only, not a
  candidate, because the required payment-gate implementation remains outside
  the present reviewed scope.
- `SR-ARTIFACT-001` and `SR-INVOICE-001` are already merged, but the required
  proof contract/migration allocation task, `SR-CONTRACT-001`, remains
  `backlog`.

On the current base, `markReimbursementPaid` accepts a non-empty proof string,
sets the batch and related statement to paid, and invokes `persistChanges`
without awaiting it. The Billing & Settlement service has no authoritative
remittance-proof record to establish the requested proof's existence, batch
and driver attribution, scan result, authorized readback, or durable payment
receipt.

The focused regression test uses the isolated IDs
`sr-proof-001-batch-a`, `sr-proof-001-driver-a`,
`sr-proof-001-statement-a`, and `sr-proof-001-nonexistent-proof`. It does not
upload bytes, call a live scanner, or execute a real payment.

## Scope and design boundary

The current write scope permits only the billing service/controller,
reimbursements route, task tests, and this evidence. It does not permit the
existing billing repository/module or purpose-built proof storage/scanner leaf
files. The existing shared document-artifact kinds are explicitly limited to
tenant invoices, placards, and reports, so a proof must not be forced into
that unrelated enum.

The canonical Platform Admin canvas has reimbursement queue and batch-detail
state-machine screens, but no proof selection/upload, scan-pending/clean/error,
payment-disabled reason, or authorized readback screen state. Per the UI
contract, no UI has been invented or changed. A canvas owner must specify those
states using the Platform Admin realm tokens before the reimbursements UI can
be extended.

## Required supervisor routing

1. Add `SR-CONTRACT-001` as a dependency and allocate the proof contract and
   dedicated migration through that task.
2. Expand this task's reviewed write scope to include
   `billing-settlement.repository.ts`, `billing-settlement.module.ts`, and
   purpose-built proof storage/scanner leaf files under the billing module.
3. Route the missing proof-flow screen requirements to the Platform Admin
   canvas owner, preserving the existing canvas and `@drts/ui-tokens` platform
   realm styling.

After that routing, implementation must make the regression cases green and
add legal-proof, cross-batch, unscanned, idempotent retry, concurrent approval,
durable-receipt, and authorized-readback tests. No live payment or device
verification has been performed or claimed.
