# FBP-014 BFF & Frontend Handoff Packet

**Sidecar Task:** `FBP-014-SIDECAR-BFF-HANDOFF`  
**Parent Task:** `FBP-014`  
**Helper Kind:** `bff_handoff_packet`  
**Current Owner:** Codex  
**Assigned Reviewer:** Claude  
**Parent Reviewer:** Copilot  
**Last Revised:** 2026-04-16 (UTC)  
**Status:** DONE — owner closeout recorded after review approval

---

## 1. Purpose

This sidecar prepares the cross-surface / cross-repo starting point for `FBP-014`.

It exists to answer four practical questions before Gemini executes the parent task:

1. Which tenant-side routes are now the canonical integrated E2E entry points after `FBP-006`?
2. Which existing smoke, UAT, and rollout artifacts should `FBP-014` reuse instead of re-inventing?
3. Which surface handoffs must be stitched for the required happy path: booking -> dispatch -> driver -> billing/audit?
4. Which boundary rules remain non-negotiable so the integrated suite does not regress back into retired or local-authority paths?

This document is support-only. It does not change canonical truth, runtime behavior, contracts, or governance state.

---

## 2. Shared-Truth Baseline

The statements below are derived from the current shared coordination files plus already-frozen support artifacts:

- `ai-status.json` records parent task `FBP-014` as `todo`, Owner=`Gemini`, Reviewer=`Copilot`, with formal `depends_on=["FBP-006","FBP-013"]`.
- `ai-status.json` records this sidecar as Owner=`Codex`, Reviewer=`Claude`, scoped to `support/sidecars/FBP-014/FBP-014-SIDECAR-BFF-HANDOFF.md`.
- `current-work.md` records `FBP-006` as `done` with commit `ddfc087`, and explicitly states that `tenant-commute-hub` is now cut over to `drts-fleet-platform` BFF authority.
- `docs/02-architecture/authority/fbp-006-tenant-commute-hub-cutover-spec.md` freezes the canonical tenant page inventory, `/api/tenant/*` endpoint mapping, and repo-B authority deletion boundary.
- `support/sidecars/FBP-006/FBP-006-SIDECAR-BFF-HANDOFF.md` already summarizes the post-cutover tenant route matrix and explicitly tells downstream consumers to use those routes for `FBP-014`.
- `current-work.md`, `apps/tenant-portal-web/README.md`, `ROADMAP.md`, `TARGET_ARCHITECTURE.md`, and `docs/04-uat/phase1-uat-scenarios.md` all agree that `apps/tenant-portal-web` is retired / frozen-reference only, and that the production tenant UI is `tenant-commute-hub`.
- `ai-status.json` records `FBP-013` as `todo`, with formal `depends_on=["FBP-008","FBP-009","FBP-011","FBP-012"]`; therefore `FBP-014` cannot be treated as rollout-grade closeout evidence until `FBP-013` finishes its staging / smoke / UAT evidence work.
- `tests/smoke/README.md` already defines the baseline API critical path for booking, dispatch assign, driver accept, billing invoice, and report export.
- `docs/04-uat/phase1-uat-scenarios.md` already defines the manual cross-surface flows `E2E-001` through `E2E-004`, including the tenant-booking -> dispatch -> driver -> billing/audit sequence that `FBP-014` must operationalize.

Important framing:

- This packet is a **pre-execution handoff**, not a parent completion report.
- It is valid to mention the existing smoke / UAT / rollout baselines, but not to claim they are already executed closeout evidence for `FBP-014`.

---

## 3. Formal Dependency Map

### 3.1 Formal Upstream Dependencies (Machine Truth)

| Dep    | Task      | Status | Why it matters for `FBP-014`                                                                                             |
| ------ | --------- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| D-UP-1 | `FBP-006` | `done` | Establishes `tenant-commute-hub` as the sole production tenant UI and freezes the canonical `/api/tenant/*` entry points |
| D-UP-2 | `FBP-013` | `todo` | Required before integrated E2E can count as staged / rollout-ready evidence instead of baseline-only verification        |

### 3.2 Informative Context (Not Formal `depends_on`)

| Context   | Status | Why it matters                                                                                                                                                                                         |
| --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `FBP-007` | `done` | Prevents use of retired `apps/tenant-portal-web` flows in the integrated suite                                                                                                                         |
| `FBP-009` | `done` | Supplies the current dispatch queue / assign / ops reports surface                                                                                                                                     |
| `FBP-011` | `done` | Supplies the finance / billing / filing authority needed for the billing/audit leg, so the integrated suite can treat the finance surface as closed blueprint truth rather than a pending review slice |
| `FBP-012` | `todo` | Still blocks `FBP-013`, so regulatory / filing completeness is not yet fully closed                                                                                                                    |

### 3.3 Downstream Consumer

| Dep    | Task      | Status | Why it matters                                                                                              |
| ------ | --------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| D-DN-1 | `FBP-015` | `todo` | Deferred-roadmap preservation should cite the verified integrated topology that `FBP-014` eventually proves |

Dependency rule:

- Keep the formal graph aligned to machine truth: `FBP-014.depends_on=["FBP-006","FBP-013"]`.
- Do not silently convert `FBP-007`, `FBP-009`, `FBP-011`, or `FBP-012` into extra formal blockers inside support material.

---

## 4. Canonical Integrated Entry Matrix

The matrix below is the handoff-ready summary of which surfaces must be stitched for the parent task.

| Journey segment                  | Surface / repo                                       | Primary route / UI                                                             | Canonical BFF / API surface                                                                                                               | Existing evidence anchor                                                                                                      | Handoff note                                                                                        |
| -------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Tenant booking start             | `tenant-commute-hub` (external repo)                 | `/bookings/new`, `/booking-list/[bookingId]`                                   | `POST /api/tenant/bookings`, `GET /api/tenant/bookings`, `GET /api/tenant/bookings/:bookingId`                                            | `fbp-006-tenant-commute-hub-cutover-spec.md` §3, `tests/smoke/02-booking-create.sh`, UAT `TP-001`, `TP-007`                   | This is the canonical E2E starting point. Do **not** use retired `apps/tenant-portal-web`.          |
| Dispatch visibility + assignment | `apps/ops-console-web`                               | `/dispatch`                                                                    | `GET /api/dispatch/tasks`, `GET /api/dispatch/tasks/:dispatchJobId/candidates`, `POST /api/dispatch/assign`                               | `tests/smoke/03-dispatch-assign.sh`, UAT `OC-001`, `OC-002`, `FBP-009` done-state (`71d9fa8`)                                 | Preserve tenant attribution and booking lineage from the tenant leg into the dispatch job.          |
| Driver task execution            | `@drts/driver-app`                                   | Jobs / task lifecycle surfaces                                                 | `GET /api/driver/tasks`, `POST /api/driver/tasks/:taskId/accept` plus the existing driver lifecycle commands used by UAT `DA-019`         | `tests/smoke/04-driver-task-accept.sh`, UAT `DA-002`, `DA-019`                                                                | Confirm the dispatch assignment becomes a driver-visible task without cross-driver leakage.         |
| Billing / earnings confirmation  | tenant billing surface plus operator finance views   | `/billing`, operator payments / reports views                                  | `POST /api/tenant/invoices/generate`, `GET /api/tenant/invoices`, finance/reporting surfaces in `billing-settlement` / `reporting-filing` | `tests/smoke/05-billing-invoice.sh`, UAT `TP-021`, `E2E-001` step 5, `support/sidecars/FBP-011/FBP-011-SIDECAR-ACCEPTANCE.md` | Financial truth must stay backend-owned. No UI self-calculation or local invoice truth.             |
| Audit / reporting evidence       | tenant audit + tenant reports + ops reports          | `/audit`, `/reports`, ops reports page                                         | `GET /api/tenant/audit`, `POST /api/reports/jobs`, `GET /api/tenant/reports/:jobId`                                                       | `tests/smoke/06-report-export.sh`, UAT `E2E-001`, `E2E-003`, `E2E-004`, rollout runbook evidence sections                     | Record request IDs, audit IDs, report job IDs, and tenant attribution.                              |
| Cross-tenant safety setup        | `apps/platform-admin-web` plus tenant + ops surfaces | tenant create / module-enable flow, then tenant booking + dispatch queue check | platform-admin tenant configuration surfaces, then tenant booking and dispatch read models                                                | UAT `PA-001`, `E2E-004`, `FBP-008` done-state (`61547cc`)                                                                     | Use this leg for explicit “no cross-tenant leak” verification, not as the primary happy-path start. |

---

## 5. What Existing Baselines Already Give `FBP-014`

| Baseline asset                                  | What it already proves                                                                                                       | What `FBP-014` still needs to add                                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `tests/smoke/02` through `06`                   | API critical path pieces are individually runnable: booking, dispatch assign, driver accept, invoice generate, report export | Cross-repo UI entry, end-to-end ID continuity, cross-tenant leak checks, and named integrated evidence capture  |
| `docs/04-uat/phase1-uat-scenarios.md` `E2E-001` | Defines the intended booking -> dispatch -> driver -> billing/audit sequence                                                 | Executed evidence, request/audit IDs, and confirmation that the live surfaces still behave as written           |
| `docs/04-uat/phase1-uat-scenarios.md` `E2E-004` | Defines the tenant-attribution / no-cross-tenant-leak scenario                                                               | Actual proof that tenant identity survives platform-admin setup -> tenant booking -> ops queue visibility       |
| `docs/03-runbooks/phase1-rollout.md`            | Defines pilot / production evidence expectations and required capture items                                                  | Real staging / pilot / production outputs, which remain the job of `FBP-013`                                    |
| `FBP-006` cutover spec + sidecar handoff        | Freezes the tenant-side BFF routes and repo-B no-authority boundary                                                          | Integrated execution proof that those routes stitch correctly into dispatch / driver / billing / audit surfaces |

Interpretation:

- `FBP-014` should reuse these assets as anchors.
- `FBP-014` should **not** duplicate them as if they were already sufficient closeout evidence.
- `FBP-013` remains the formal evidence-closeout family; `FBP-014` remains the integrated topology-verification family.

---

## 6. Non-Negotiable Guardrails For The Integrated Suite

The integrated E2E suite must preserve the following constraints:

1. **Tenant surface means `tenant-commute-hub`.** The retired `apps/tenant-portal-web` shell is frozen-reference only and must not be used as a production or staging E2E entry point.
2. **Repo B remains a pure UI consumer.** No Supabase direct truth, edge functions, local authority, local webhook secret storage, or repo-B side financial truth may reappear.
3. **BFF wire rules stay intact.** Use canonical `/api/*` endpoints, `snake_case`, `data/meta`, `items[] + page_info`, and `Idempotency-Key` on POST commands.
4. **The primary happy path is the owned enterprise-dispatch flow.** Forwarded-order lifecycle (`E2E-002`) remains a separate mirror scenario, not the substitute for the owned booking -> dispatch -> driver -> billing path.
5. **Billing and audit remain backend-owned.** Do not derive booking completion, invoice truth, or settlement state from local calculations or UI assumptions.
6. **Cross-tenant safety is part of the definition of done.** The integrated suite must explicitly prove correct tenant attribution and absence of cross-tenant leakage across booking, dispatch, billing, and audit surfaces.
7. **Missing surface means reopen the right task.** If the integrated suite discovers a real gap after `FBP-006`, the fix belongs in a new authority/evidence task, not in a local workaround inside `tenant-commute-hub`.

These guardrails align with `docs/02-architecture/tenant-commute-hub-boundary.md` and the already-frozen `FBP-006` cutover result.

---

## 7. Suggested Stitch Order For Parent Execution

This is a support recommendation for Gemini and Copilot, not a machine-state change.

1. Wait until `FBP-013` is ready to supply real staging / smoke / UAT evidence capture, or explicitly mark the run as baseline-only dry-run rather than final closeout.
2. Start the integrated flow from `tenant-commute-hub` booking creation and record at minimum:
   - `tenant_id`
   - `booking_id`
   - request ID from booking create
3. Continue through Ops dispatch assignment and record:
   - `dispatch_job_id`
   - chosen `driver_id`
   - chosen `vehicle_id`
   - request / audit references from assignment
4. Continue through driver task execution and record:
   - `task_id`
   - driver-task state transitions
   - completion / signoff evidence when applicable
5. Finish with billing / audit / reporting verification and record:
   - `invoice_id` or statement reference
   - tenant-visible completed booking state
   - audit entry IDs
   - report job or filing artifact references where used
6. Run at least one explicit tenant-attribution / no-cross-tenant-leak scenario aligned with `E2E-004`.

Practical rule:

- The integrated suite should produce one stitched evidence chain, not a bag of unrelated per-surface screenshots.

---

## 8. Reviewer Focus (Claude)

Claude should review this sidecar against five questions:

1. Does the packet stay support-only and avoid rewriting canonical truth?
2. Does it preserve the formal dependency graph exactly as `FBP-014.depends_on=["FBP-006","FBP-013"]`?
3. Does it correctly force the tenant-side entry point onto `tenant-commute-hub` and away from retired `apps/tenant-portal-web`?
4. Does it reuse the correct smoke / UAT / rollout anchors without falsely claiming they already satisfy `FBP-014`?
5. Do the guardrails keep the `FBP-006` cutover boundary and `tenant-commute-hub` frontend contract intact?

Important review boundary:

- Claude reviews this helper packet only.
- Copilot remains the formal parent reviewer for `FBP-014` unless the machine-tracked reviewer changes later.

Suggested approval wording:

> `Review approved. Handoff packet preserves FBP-014 formal dependencies, the tenant-commute-hub entry boundary, and the existing smoke/UAT/runbook anchors for integrated E2E work without changing canonical truth.`

Suggested reopen wording:

> `packet needs revision: [specify dependency drift / retired-surface confusion / evidence-anchor mismatch / scope violation]`

---

## 9. Handoff / Review / Closeout Commands

Owner handoff to Claude:

```bash
AI_NAME=Codex ./scripts/ai-status.sh handoff FBP-014-SIDECAR-BFF-HANDOFF Claude \
  "FBP-014 sidecar handoff packet ready in support/sidecars/FBP-014/FBP-014-SIDECAR-BFF-HANDOFF.md. It freezes the canonical tenant-commute-hub entry points after FBP-006, maps the booking -> dispatch -> driver -> billing/audit stitch surfaces, and packages smoke/UAT/runbook baselines plus guardrails for integrated E2E work. Support artifact only; no canonical truth changes."
```

Reviewer approval:

```bash
AI_NAME=Claude \
REVIEW_FILE=support/sidecars/FBP-014/FBP-014-SIDECAR-BFF-HANDOFF.md \
REVIEW_NOTES_ZH='審查通過：handoff packet 正確保留 FBP-014 的 formal dependency（FBP-006、FBP-013）、tenant-commute-hub 作為唯一 tenant-side 入口、以及 smoke/UAT/runbook 的既有基線；未把 retired internal tenant portal 或 repo-B local authority 誤寫回整合路徑。|回到 owner（Codex）以 NO_COMMIT_REQUIRED=1 做 done closeout。' \
./scripts/ai-status.sh approve FBP-014-SIDECAR-BFF-HANDOFF \
  "Review approved. Handoff packet preserves FBP-014 formal dependencies, the tenant-commute-hub entry boundary, and the existing smoke/UAT/runbook anchors for integrated E2E work without changing canonical truth."
```

Reviewer reopen:

```bash
AI_NAME=Claude ./scripts/ai-status.sh reopen FBP-014-SIDECAR-BFF-HANDOFF \
  "packet needs revision: [specify dependency drift / retired-surface confusion / evidence-anchor mismatch / scope violation]"
```

Owner closeout after approval:

```bash
AI_NAME=Codex NO_COMMIT_REQUIRED=1 ./scripts/ai-status.sh done FBP-014-SIDECAR-BFF-HANDOFF \
  "Done: FBP-014 BFF/frontend handoff packet recorded the canonical tenant entry points, cross-surface stitch matrix, and integrated-E2E guardrails without changing canonical truth."
```

---

## 10. Notes For Parent Owner / Parent Reviewer

1. Use `support/sidecars/FBP-006/FBP-006-SIDECAR-BFF-HANDOFF.md` as the tenant cutover companion artifact when executing `FBP-014`.
2. Treat `tests/smoke/README.md`, `docs/04-uat/phase1-uat-scenarios.md`, and `docs/03-runbooks/phase1-rollout.md` as the baseline evidence scaffold, not as proof that the integrated suite has already been completed.
3. If `FBP-011` or `FBP-012` changes the billing / reporting surfaces before `FBP-014` starts, refresh this sidecar packet rather than patching around the drift in downstream notes.
4. If the parent task later needs a separate acceptance packet or review packet, that should be a new helper slice, not a rewrite of this BFF/frontend handoff artifact.

---

## 11. Change Log

- 2026-04-15 — Codex created the initial `FBP-014` BFF/frontend handoff packet from shared machine truth, the frozen `FBP-006` tenant cutover boundary, the current smoke/UAT/runbook baselines, and the integrated E2E acceptance target recorded in `ai-status.json`.
- 2026-04-16 — Codex refreshed the support packet to align the reviewer assignment and the informative `FBP-011` status with the current shared truth, then closed the approved sidecar without changing canonical truth.
