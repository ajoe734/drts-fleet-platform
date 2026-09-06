# SR-PROOF-001 Unblock Planning Decision

## Scope

- Task: `SR-PROOF-001-UNBLOCK-PLANNING-DECISION`
- Parent: `SR-PROOF-001`
- Owner: `Claude2`
- Reviewer: `Claude`
- Decision date: `2026-09-06`

## Diagnosis

`SR-PROOF-001` ("匯款證明上傳、歸屬查驗與付款 gate") is recorded `blocked`,
`waiting_for: Codex`, after owner `Codex2` reproduced the payment-gate defect
(base `69c519702047862212bc0e4890350e6b58917062`, WIP anchor `662720328`,
draft PR [#1699](https://github.com/ajoe734/drts-fleet-platform/pull/1699))
and stopped rather than widen scope on their own authority.

Both recorded dependencies are canonical-done and reachable from `origin/dev`:

- `SR-ARTIFACT-001`: `done`, `merge_sha 3e1904b1318a3252d3f7b5673173608fd6d12f71`,
  present in `origin/dev` history.
- `SR-INVOICE-001`: `done`, `merge_sha a4876ac529abfb634c2b96f237116202abf3d87d`,
  present in `origin/dev` history.

So the block is not "waiting on an incomplete dependency." Reading
`docs/03-runbooks/system-remediation-20260906/SR-PROOF-001.md` and PR #1699's
body against the current repo state shows the block is a **wave-execution
routing gap**, not a missing product/contract semantic decision:

1. **Product semantics already exist in L1 canonical truth.**
   `phase1_prd_detailed_v1.md` §9.8.4 (Driver Reimbursement) already requires
   "上傳匯款證明" with traceability back to the original order and subsidy
   policy version. `phase1_service_contracts_v1.md` §3.11 already assigns
   `remittance proof` and `remittance proof index` as Billing & Settlement
   Service's source of truth. Gap `N09`
   (`docs/04-uat/system-remediation-20260906/source/new-gaps.json`) and
   capabilities `C081`/`C125` already spell out the acceptance bar: proof
   upload, scan, batch/driver attribution, authorized readback, and rejecting
   empty/fake/cross-batch proof at `markPaid`. None of this needs to be
   reopened or reinterpreted.

2. **Missing dependency edge in machine truth.** `SR-PROOF-001`'s own runbook
   says "Migration 使用 SR-CONTRACT 分配的專屬檔名" — the proof schema/migration
   and typed contract must come from `SR-CONTRACT-001`, which centralizes all
   new-feature contract/migration allocation for this wave by design
   (`docs/03-runbooks/system-remediation-20260906/SR-CONTRACT-001.md`:
   "統一由此task改shared exports/OpenAPI"). `SR-CONTRACT-001` is still
   `backlog` and is **not** listed in `SR-PROOF-001.depends_on`
   (`[SR-ARTIFACT-001, SR-INVOICE-001]`). That is a machine-truth gap, not a
   new decision — the centralization rule was already decided when the wave
   was planned.

3. **`write_scopes` too narrow for real implementation.** Current
   `SR-PROOF-001.write_scopes` cover only `billing-settlement.service.ts`,
   `billing-settlement.controller.ts`, the reimbursements UI directory, and
   task tests/docs. Reading the actual module confirms
   `billing-settlement.repository.ts` and `billing-settlement.module.ts`
   already exist in-tree and are out of scope, yet Codex2's reproduction shows
   the real defects (non-awaited `persistChanges`, no CAS/revision on the
   batch upsert, no atomic proof/receipt commit) live in the repository, and
   any real proof storage/scanner adapter needs module wiring. Separately,
   `apps/api/src/common/document-artifacts/document-artifact-kinds.ts` is
   deliberately narrow (`tenant-invoice`, `placard`, `report` only, per
   `SD-DP-20260820-012` and the `SR-SCOPE-001` exclusion list) — remittance
   proof storage is not, and should not be forced into, that artifact-kind
   enum. It needs its own purpose-built storage/scanner leaf under
   `billing-settlement`, which is a scope-expansion action reserved for the
   supervisor by this task's own runbook text ("額外共用檔案必須由 supervisor
   擴 scope 並加入相依後才能寫").

4. **Canvas/UI decision genuinely outstanding, but already specified.** The
   canonical design canvas
   (`docs/05-ui/drts-design-canvas/platform-screens-3.jsx`,
   `PA_Reimbursements` / `PA_ReimbursementDetail`) has batch detail, approval,
   timeline, and line items, but no proof upload/scan/reject/readback states.
   Per this wave's dispatch rule, a worker who finds a missing screen must
   stop and record requirements rather than invent visuals. Codex2 already
   did this correctly in PR #1699 (allowed MIME/size limits; upload
   progress/error/retry states; server-confirmed filename, batch, and
   scan-status labels instead of free-text proof IDs; payment disabled with a
   stated reason while unapproved or unscanned; post-payment readback with
   re-authorization on expiry). This is design-owner input waiting for
   routing, not a defect in Codex2's diagnosis.

None of the above requires this helper task, or `SR-PROOF-001`, to invent a
new product or contract interpretation. The blocker is that three concrete,
supervisor-adjudicated routing actions have not yet happened.

## Canonical sources consulted

Higher-precedence first per `AI_COLLABORATION_GUIDE.md`:

1. `phase1_prd_detailed_v1.md` §9.8.4
2. `phase1_service_contracts_v1.md` §3.11
3. `docs/04-uat/system-remediation-20260906/source/new-gaps.json` (`N09`)
4. `docs/03-runbooks/system-remediation-20260906/SR-PROOF-001.md`
5. `docs/03-runbooks/system-remediation-20260906/SR-CONTRACT-001.md`
6. `apps/api/src/common/document-artifacts/document-artifact-kinds.ts`
7. `docs/01-decisions/SD-DP-20260820-012-phase1-regulatory-output-scope.md`
8. `docs/05-ui/drts-design-canvas/platform-screens-3.jsx`
9. GitHub PR [#1699](https://github.com/ajoe734/drts-fleet-platform/pull/1699)
   (`codex2/sr-proof-001` WIP diagnosis)
10. `ai-status.json` task slices for `SR-PROOF-001`, `SR-ARTIFACT-001`,
    `SR-INVOICE-001`, `SR-CONTRACT-001`, `SR-DESIGN-001`, `SR-SCOPE-001`

## Decision

`SR-PROOF-001` needs **no new product or contract semantic decision**. The
remittance-proof requirement, its ownership by Billing & Settlement Service,
and its payment-gate acceptance bar are already accepted in L1 canonical
truth and in this wave's own gap/capability records.

What is genuinely missing is wave-execution routing, and it is routed here
rather than resolved unilaterally by this helper task, because none of it is
within `SR-PROOF-001-UNBLOCK-PLANNING-DECISION`'s own write scope or
authority:

1. Add `SR-CONTRACT-001` to `SR-PROOF-001.depends_on` (or have the supervisor
   explicitly confirm, in machine truth, that proof persistence can proceed
   without a dedicated `SR-CONTRACT-001` migration allocation — not assumed
   silently). The wave's own centralization rule already decided that new
   migrations and shared contract exports route through `SR-CONTRACT-001`;
   this is enforcing an existing rule, not creating one.
2. Expand `SR-PROOF-001.write_scopes` to include
   `apps/api/src/modules/billing-settlement/billing-settlement.repository.ts`,
   `apps/api/src/modules/billing-settlement/billing-settlement.module.ts`,
   and new purpose-built proof storage/scanner leaf files under
   `apps/api/src/modules/billing-settlement/` (following the existing
   `document-artifacts` / `controlled-download` leaf-module pattern; exact
   filenames to be confirmed by the supervisor together with the
   `SR-CONTRACT-001` owner so migration and type names do not collide).
3. Route the already-documented screen requirements from PR #1699 to a
   canvas/design owner against `platform-screens-3.jsx`
   `PA_Reimbursements` / `PA_ReimbursementDetail`, either as an expansion of
   `SR-PROOF-001` scope naming that exact file, or as a small scoped design
   task feeding back into `SR-PROOF-001`.

## Scope cut and routing

Out of scope for this helper task:

1. Editing `SR-PROOF-001.depends_on` or `write_scopes` directly — that is a
   supervisor action per this wave's own runbook rules, not something an
   unblock-decision task performs by hand-editing machine truth.
2. Allocating the actual proof migration filename, schema, or typed contract
   — that is `SR-CONTRACT-001`'s chartered job.
3. Drawing or specifying new canvas visuals — that is a design/canvas owner
   action; this task only confirms the already-recorded requirements are
   complete enough to route.
4. Reproducing, fixing, or re-running `SR-PROOF-001`'s implementation or
   tests — Codex2's WIP diagnosis in PR #1699 stands as current evidence and
   is not redone here.

## Parent unblocked next step

The parent task should replace the current `waiting_for: Codex` /
vague-block framing with this concrete next step:

1. Treat the product/contract semantics as fixed: `phase1_prd_detailed_v1.md`
   §9.8.4 and `phase1_service_contracts_v1.md` §3.11 already govern
   remittance proof; no reinterpretation is needed.
2. Supervisor adds `SR-CONTRACT-001` as a real dependency of `SR-PROOF-001`
   in machine truth (or records an explicit reason why proof persistence can
   proceed ahead of it).
3. Supervisor expands `SR-PROOF-001.write_scopes` to cover
   `billing-settlement.repository.ts`, `billing-settlement.module.ts`, and
   the new proof storage/scanner leaf files described above.
4. Supervisor routes the PR #1699 screen-requirements note to a canvas/design
   owner for `platform-screens-3.jsx` `PA_Reimbursements` /
   `PA_ReimbursementDetail`.
5. Once scope/dependency/design are confirmed, `Codex2` resumes
   `SR-PROOF-001` from a fresh `origin/dev` rebase, implements the durable
   proof-gated `markReimbursementPaid` path, turns the two failing
   regressions in `tests/unit/system-remediation/sr-proof-001/` green, and
   only then commits, pushes, and hands off a single candidate SHA.

Recommended parent status after this helper closes: remain `blocked` on the
concrete supervisor routing actions above (not on product semantics), so the
next actor is the supervisor rather than an implementation owner guessing at
scope.

## Acceptance mapping

| Acceptance item | Result |
| --- | --- |
| Resolve or route the missing product/contract decision through canonical planning artifacts | Resolved as routing-only: remittance-proof product semantics already exist in `phase1_prd_detailed_v1.md` §9.8.4 and `phase1_service_contracts_v1.md` §3.11; no new interpretation needed. |
| Record the decision | Recorded here: no new product or contract decision required for `SR-PROOF-001`. |
| scope cut | Recorded in "Scope cut and routing": this helper does not edit machine-truth scope/dependencies, allocate the migration, draw canvas visuals, or redo `SR-PROOF-001` implementation. |
| or explicit follow-up needed by the parent task | Recorded in "Parent unblocked next step": add `SR-CONTRACT-001` dependency, expand `write_scopes`, route canvas requirements, then resume implementation. |
| Produce task-scoped commit/push/PR evidence for any canonical change | This file is committed and pushed on `claude2/sr-proof-001-unblock-planning-decision`; PR evidence attached at handoff. |
| Update the parent task with the concrete unblocked next step | Recorded on `SR-PROOF-001` via `ai-status.sh note` referencing this file. |

## Verification basis

- `phase1_prd_detailed_v1.md` §9.8.4
- `phase1_service_contracts_v1.md` §3.11
- `docs/04-uat/system-remediation-20260906/source/new-gaps.json` (`N09`)
- `docs/03-runbooks/system-remediation-20260906/SR-PROOF-001.md`
- `docs/03-runbooks/system-remediation-20260906/SR-CONTRACT-001.md`
- `apps/api/src/common/document-artifacts/document-artifact-kinds.ts`
- `docs/01-decisions/SD-DP-20260820-012-phase1-regulatory-output-scope.md`
- GitHub PR #1699 (`codex2/sr-proof-001`)
- `ai-status.json` task slices for `SR-PROOF-001`, `SR-ARTIFACT-001`,
  `SR-INVOICE-001`, `SR-CONTRACT-001`, `SR-DESIGN-001`, `SR-SCOPE-001`
