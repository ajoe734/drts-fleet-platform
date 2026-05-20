# TEN-UI-RD-013 Unblock Planning Decision

Task: `TEN-UI-RD-013-UNBLOCK-PLANNING-DECISION`
Parent: `TEN-UI-RD-013`
Owner: `Codex`
Reviewer: `Claude`
Date: `2026-05-20`

## Status

Backfill helper closeout. The parent task is already unblocked and `done` in
current machine truth; this packet records the planning-decision evidence chain
and removes stale "reopen before deciding" guidance from the parity document.

## Decision

The missing product/contract decision is already resolved in accepted planning
artifacts:

- `BE-CC-001` is the canonical tenant cost-center directory contract.
- `TEN-UI-RD-013` is unblocked against that contract and is allowed to ship as
  a **read-only** TN_CostCenter directory surface.
- The TN_CostCenter management editor from the original artboard is a separate
  follow-up scope, not a blocker for the read-only route.

## Canonical evidence chain

1. `docs/05-ui/tenant-canonical-contract-gaps-design-response-20260513.md`
   accepts the Tenant Governance Contract Wave and records `BE-CC-001` as the
   canonical tenant cost-center baseline.
2. `docs/03-runbooks/tenant-governance-wave-execution-packet-20260513.md` §7
   says `TEN-UI-RD-013` unblocks when `BE-CC-001` is done and marks that
   condition as already true.
3. `docs/05-ui/tenant-console-parity-decisions-20260510.md` records the route
   as shipped read-only after `BE-CC-001` landed, on commit `921c456`.
4. `docs/05-ui/tenant-console-redesign-closeout-20260514.md` binds
   `TEN-UI-RD-013` to shipped commit `921c456`, push branch
   `codex/be-cc-001-fu-seed`, and reviewer approval by `Claude2` at
   `2026-05-14T03:16:30Z`.
5. Current `origin/dev` machine truth records `TEN-UI-RD-013` as `done` on
   commit `7673f8a4568e6ceddeadc05ce744d389a7d05b0b`, with the deferred
   management editor explicitly kept out of scope.

## Scope cut

In scope for `TEN-UI-RD-013`:

- read-only cost-center directory
- quota / coverage / approval-rule visibility from published read contracts
- partial-error handling without inventing unpublished editor behavior

Out of scope for `TEN-UI-RD-013` closeout:

- inline create / update / disable cost-center controls
- owner reassignment UX
- approval-policy mutation UX

If product still requires the full management-table editor, open a new
follow-up against a backend mutation decision instead of re-blocking the
already-shipped read-only route.

## Parent task routing

`TEN-UI-RD-013` no longer needs any unblock work in the parent row. The
concrete parent outcome is already recorded:

1. `TEN-UI-RD-013` stays `done` in machine truth and on `origin/dev`;
2. the read-only route remains the accepted shipped scope;
3. if product still wants the deferred management editor, it must be a new
   follow-up task against backend mutation scope rather than a reopen of the
   shipped route.

## Verification used for this helper refresh

- `git show origin/dev:ai-status.json` for the current parent `done` row and
  the resolved blocker entry
- `git show origin/dev:docs/05-ui/tenant-console-parity-decisions-20260510.md`
  and `git show origin/dev:docs/05-ui/tenant-console-redesign-closeout-20260514.md`
  for the shipped-scope record
- `git diff origin/dev..HEAD -- docs/05-ui/tenant-console-parity-decisions-20260510.md support/unblock/TEN-UI-RD-013/TEN-UI-RD-013-UNBLOCK-PLANNING-DECISION.md`
  to isolate this helper's canonical delta
- source-file existence checks for:
  - `apps/tenant-console-web/app/cost-centers/page.tsx`
  - `packages/ui-web/src/tenant-cost-centers.stories.tsx`

## Closeout note

Earlier branch-local recovery work existed on
`origin/codex2/ten-ui-rd-013-unblock-planning-decision`, but the effective
parent resolution is now the `origin/dev` closeout tuple. This helper task
therefore stays narrow: add the missing support artifact, align the parity
document's stale follow-up wording, and preserve the scope cut for any future
management-editor request.
