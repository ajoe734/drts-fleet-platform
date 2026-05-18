# TEN-UI-RD-013 Unblock Planning Decision

Task: `TEN-UI-RD-013-UNBLOCK-PLANNING-DECISION`
Parent: `TEN-UI-RD-013`
Owner: `Codex`
Reviewer: `Codex2`
Date: `2026-05-18`

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

`TEN-UI-RD-013` should no longer stay blocked on "missing canonical tenant
cost-center contract". The concrete next step is:

1. remove the stale planning blocker in machine truth;
2. recover the parent closeout trail from the existing shipped evidence
   (`a7c1b9f` for `BE-CC-001`, `921c456` for the route, and the 2026-05-14
   closeout packet);
3. only open a separate follow-up if product wants the deferred management
   editor surface.

## Verification used for this unblock packet

- `rg` over the accepted design-response, execution-packet, parity-decision,
  and closeout documents
- `git log --grep` confirmation for commits `a7c1b9f`, `921c456`, and `9becf4e`
- source-file existence checks for:
  - `apps/tenant-console-web/app/cost-centers/page.tsx`
  - `packages/api-client/src/index.ts`
  - `packages/contracts/src/index.ts`

## Closeout evidence

- Task-scoped routing commit: `69c3a11` on
  `origin/codex/ten-ui-rd-013-unblock-planning-decision`
- Reviewer approval recorded in machine truth at `2026-05-18T06:27:25Z`
- Reviewer metadata normalization was approved in reviewer commit `4599c5d` on
  `origin/codex2/ten-ui-rd-013-unblock-planning-decision`
