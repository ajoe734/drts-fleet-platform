# UI-FE-ADM-REIMB Acceptance Packet & Dependency Map

- Sidecar Task: `UI-FE-ADM-REIMB-SIDECAR-ACCEPTANCE`
- Sidecar Owner / Reviewer: `Codex` / `Claude`
- Parent Task: `UI-FE-ADM-REIMB`
- Adjacent Sibling Task: `UI-FE-ADM-REIMBID`
- Helper Kind: `acceptance_packet`
- Class: support-only; no canonical-truth mutation
- Generated: `2026-05-25` (UTC)

## Purpose

Capture the acceptance checklist, dependency map, and reviewer handoff notes
for the already-closed reimbursement queue slice `UI-FE-ADM-REIMB` without
editing canonical truth. This packet is scoped to the queue page only. The
detail page remains a separate sibling task (`UI-FE-ADM-REIMBID`) and is not
re-adjudicated here.

## Scope And Guardrails

- Create or update support artifacts only under
  `support/sidecars/UI-FE-ADM-REIMB/`.
- Do not edit `apps/platform-admin-web/**`, `packages/api-client/**`,
  `packages/contracts/**`, `docs/05-ui/**`, or L1/L2 truth as part of this
  sidecar.
- Treat `/home/edna/workspace/drts-fleet-platform/ai-status.json` as the live
  machine-truth task board. This packet does not freeze live status fields in
  prose.
- Because this sidecar worktree is support-only and does not carry the parent
  runtime checkout, code evidence below is taken from the parent closeout branch
  / commit recorded in machine truth:
  `origin/codex/ui-fe-adm-reimb` @ `7da6d99ecfc6f5928b03c3d1c242965e76999bd3`.

## Machine-Truth Anchors

### Parent queue task

`UI-FE-ADM-REIMB` is `done` in canonical machine truth with:

- artifact:
  `apps/platform-admin-web/app/payments/reimbursements/page.tsx`
- closeout commit:
  `7da6d99ecfc6f5928b03c3d1c242965e76999bd3`
- push target: `origin/codex/ui-fe-adm-reimb`
- recorded verification:
  `pnpm --filter @drts/platform-admin-web typecheck + build`

The parent reviewer note in `ai-status.json` says the queue page passed visual
alignment, `availableActions`-driven CTAs, T4 refresh wiring, and the six
EmptyReason treatments. This packet only packages those accepted facts for
support review.

### Sibling detail task

`UI-FE-ADM-REIMBID` is still `todo` in canonical machine truth. That task owns
`apps/platform-admin-web/app/payments/reimbursements/[batchId]/page.tsx`.

Boundary rule for this packet:

- queue page evidence belongs to `UI-FE-ADM-REIMB`
- detail page completeness belongs to `UI-FE-ADM-REIMBID`
- this sidecar may mention the sibling route as context, but must not treat the
  sibling as a parent acceptance blocker

### Reopen reason addressed by this refresh

This sidecar had previously been reopened because the packet did not explicitly
call out the queue page's required must-show fields from packet section `5.12`
(`submitter`, `submitted at`, `approver`, `updated at`) against the runtime
surface. This refresh fixes that gap directly in the acceptance checklist below.

## Dependency Map

| Dependency | Status in machine truth | Relationship to `UI-FE-ADM-REIMB` | Evidence anchors |
| --- | --- | --- | --- |
| `UI-FE-TOKENS` | `done` at commit `7fc1809c77afc32998f98557283828321e87e280` on `origin/codex/ui-fe-tokens` | Direct visual dependency. The queue page uses `@drts/ui-web` shell, header, card, pill, button, table, icon, and theme primitives instead of local one-off styling. | Wave planning dependency declaration: `docs/03-runbooks/phase1-ui-implementation-wave-planning-20260525.md:100-102`; parent branch imports / theme setup: `origin/codex/ui-fe-adm-reimb:apps/platform-admin-web/app/payments/reimbursements/page.tsx:22-42` |
| `UI-BE-006` | `done` at commit `3d6d08503df661d3d7e1ce211f5c7de0a65cb79f` on `origin/codex2/ui-be-006` | Inherited umbrella dependency from `UI-FE-ADM`. It does not provide the reimbursement payload itself, but it establishes the Platform Admin control-plane pattern that resource CTAs come from `availableActions[]` rather than role hard-coding. | Wave planning dependency declaration: `docs/03-runbooks/phase1-ui-implementation-wave-planning-20260525.md:102`, `docs/03-runbooks/phase1-ui-implementation-wave-planning-20260525.md:120-121`; action contract: `packages/contracts/src/ui-runtime.ts:133-148`, `packages/contracts/src/ui-runtime.ts:421-434` |
| `UI-CL-001` | `done` at commit `596c094d9b9f51ec1cd6d958b97698158e4c8d5a` on `origin/codex/ui-cl-001` | Direct integration dependency. The queue page consumes `ApiSuccessEnvelope`, `ApiListData`, `EmptyStateEnvelope`, and `UiRefreshMetadata`, then drives T4 polling / freshness affordances from the normalized envelope. | Handoff packet refresh requirement: `docs/05-ui/platform-admin-design-handoff-packet-20260525.md:77-92`; parent branch envelope usage: `origin/codex/ui-fe-adm-reimb:apps/platform-admin-web/app/payments/reimbursements/page.tsx:12-21`, `origin/codex/ui-fe-adm-reimb:apps/platform-admin-web/app/payments/reimbursements/page.tsx:122-125`, `origin/codex/ui-fe-adm-reimb:apps/platform-admin-web/app/payments/reimbursements/page.tsx:1123-1209`, `origin/codex/ui-fe-adm-reimb:apps/platform-admin-web/app/payments/reimbursements/page.tsx:1630-1748` |

## Canonical Acceptance Source

Parent acceptance is defined by these sources:

- parent task acceptance in machine truth:
  `UI-FE-ADM-REIMB` row in
  `/home/edna/workspace/drts-fleet-platform/ai-status.json`
- behavior contract:
  `docs/05-ui/platform-admin-design-handoff-packet-20260525.md:636-658`
- route map / entry-exit flow:
  `docs/05-ui/platform-admin-design-handoff-packet-20260525.md:178-230`
- visual target:
  `docs/05-ui/drts-design-canvas/platform-screens-3.jsx:59-101`

## Parent Evidence Snapshot

Queue-page evidence from parent branch `origin/codex/ui-fe-adm-reimb`:

- queue route exists as its own page entrypoint:
  `apps/platform-admin-web/app/payments/reimbursements/page.tsx`
- six queue states are explicit in code:
  `draft`, `pending_approval`, `approved`, `exported`, `paid`,
  `reconciled`
- the page normalizes must-show fields that were missing from the first sidecar
  draft:
  `scopeLabel`, `submitter`, `submittedAt`, `approver`, `updatedAt`,
  `periodMonth`, artifact link, reconciliation link
- action rendering is driven by backend `availableActions[]` when present, with
  a fallback mapper only when the backend has not emitted descriptors
- the page normalizes `UiRefreshMetadata`, polls every 30 seconds, computes
  freshness / stale state, and renders refresh badges
- six EmptyReason variants are rendered with distinct titles / bodies / tones /
  affordances

## Acceptance Checklist

- [x] Dedicated queue route exists at
      `apps/platform-admin-web/app/payments/reimbursements/page.tsx`.
      Evidence: parent task artifact in `ai-status.json`; parent branch route
      entrypoint and page export at
      `origin/codex/ui-fe-adm-reimb:apps/platform-admin-web/app/payments/reimbursements/page.tsx:1630-1750`,
      plus `/payments` navigation / backlink wiring at
      `...:2175-2409`.
- [x] Queue models the packet's six-state workflow.
      Evidence: `QUEUE_STATUSES` and `STATUS_PRIORITY` at
      `...:48-78`, plus status normalization at `...:705-729` and rendered
      state pills at `...:1931-1937`.
- [x] Queue shows the section `5.12` must-show fields that caused the reopen:
      batch id, scope, amount, state, submitter, submitted at, approver,
      updated at.
      Evidence: row normalization at `...:1039-1120`; table columns at
      `...:1875-1961`.
- [x] Queue supports the packet filters for state / scope / period.
      Evidence: state, scope, and period filter controls at `...:2338-2387`,
      with filter application logic at `...:1777-1812`.
- [x] Queue CTAs are `availableActions[]`-driven and honor
      `ResourceActionDescriptor` semantics.
      Evidence: descriptor normalization at `...:873-923`; direct
      `availableActions` consumption plus fallback only when absent at
      `...:1071-1089`; modal / disabled / submit handling at `...:1975-2140`.
- [x] Queue covers the four required actions for this slice: approve, export
      artifact, mark paid, mark reconciled.
      Evidence: action kind normalization and conventional endpoints at
      `...:808-851`; fallback action generation at `...:926-1000`; action
      execution at `...:2035-2140`.
- [x] High-risk actions require a reason and surface receipt / audit follow-up.
      Evidence: `approve` and `mark_paid` descriptors require reason in fallback
      generation at `...:932-983`; modal reason field at `...:2498-2516`; audit
      link surfacing from `ActionReceipt` at `...:1280-1315` and
      `...:2127-2137`.
- [x] T4 refresh tier is wired from normalized `UiRefreshMetadata`.
      Evidence: refresh constants at `...:43-46`; metadata normalization at
      `...:1123-1209`; 30s polling at `...:1737-1748`; freshness pill and
      refresh UI at `...:2197-2211`; queue card refresh-tier badge at
      `...:2273-2287`.
- [x] Empty-state handling distinguishes the six expected reasons.
      Evidence: reason taxonomy and copy at `...:56-63` and `...:595-638`;
      API / error mapping at `...:1163-1277`; rendered empty-state component at
      `...:1506-1595`; injected into page render at `...:2432-2445`.
- [x] Pending-approval backlog and exported-overdue state variants are rendered
      distinctly.
      Evidence: pending/exported banner copy at `...:535-540`; derived row sets
      at `...:1763-1775`; banners at `...:2246-2270`.
- [x] Cross-app and queue-to-parent links are present.
      Evidence: detail / reconciliation / cross-app link normalization at
      `...:1003-1037` and `...:1110-1114`; rendered links in table cells at
      `...:1881-1920`; parent `/payments` backlink at `...:2398-2409`.
- [x] Parent verification already recorded the required build checks.
      Evidence: `UI-FE-ADM-REIMB` machine-truth closeout message and commit
      `7da6d99ecfc6f5928b03c3d1c242965e76999bd3`
      (`Verification: pnpm --filter @drts/platform-admin-web typecheck;
      pnpm --filter @drts/platform-admin-web build`).

## Out Of Scope

- Re-adjudicating `UI-FE-ADM-REIMB` itself; the parent is already `done`.
- Accepting or rejecting the sibling detail page `UI-FE-ADM-REIMBID`.
- Editing runtime code, contracts, or design docs as part of this sidecar.
- Claiming anything about `origin/dev` merge state; this packet follows machine
  truth and the recorded parent closeout branch.

## Reviewer Spot-Checks

The reviewer should confirm:

1. This sidecar only adds
   `support/sidecars/UI-FE-ADM-REIMB/UI-FE-ADM-REIMB-SIDECAR-ACCEPTANCE.md`.
2. The packet is aligned to the actual parent task boundary:
   queue page only, detail page explicitly out of scope.
3. The packet now explicitly covers the reopened must-show field gap:
   `submitter`, `submittedAt`, `approver`, and `updatedAt`.
4. The dependency map reflects current machine truth:
   `UI-FE-TOKENS`, `UI-BE-006`, and `UI-CL-001` are all `done`.
5. The evidence anchors are taken from the parent closeout branch
   `origin/codex/ui-fe-adm-reimb` / commit `7da6d99...`, not from unrelated
   worktree state.

If any of these checks fails, reopen the sidecar rather than approving it.

## Local Verification For This Sidecar

- `git diff --check -- support/sidecars/UI-FE-ADM-REIMB/UI-FE-ADM-REIMB-SIDECAR-ACCEPTANCE.md`

## Files Added By This Sidecar

```text
support/sidecars/UI-FE-ADM-REIMB/UI-FE-ADM-REIMB-SIDECAR-ACCEPTANCE.md
```
