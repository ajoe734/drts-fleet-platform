# DRV-UI-RD-007 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `DRV-UI-RD-007` - Reskin SOS  
**Parent Owner:** `Codex2`  
**Parent Reviewer:** `Codex`  
**Sidecar Owner:** `Codex`  
**Sidecar Reviewer:** `Codex2`  
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` - support-only; does not modify
canonical truth, parent machine truth, or runtime behavior.

This packet is the reviewer-facing acceptance companion for the Wave 4
driver-app SOS reskin centered on `apps/driver-app/app/incident.tsx`.
Live lifecycle truth for both the parent task and this sidecar remains
authoritative only in `ai-status.json`; this document intentionally does
not freeze `status`, `next`, `last_update`, or eventual closeout fields.

At packet refresh time, `ai-status.json` still records the parent
`DRV-UI-RD-007` as `backlog`. This packet is therefore forward-looking:
it defines what the parent diff must preserve or satisfy once the parent
owner moves the slice through implementation and review.

---

## 1. Scope Boundary

In scope:

- translate the parent task row, Wave 4 shared acceptance bar, and SOS
  design/product anchors into a concrete reviewer checklist for
  `apps/driver-app/app/incident.tsx`
- pin the hard upstream dependency recorded in machine truth
  (`DRV-UI-RD-001`) and the already-shipped SOS baseline behaviors the
  parent reskin must not regress
- record the downstream closeout consumer (`DRV-UI-RD-009`) so review
  attention can account for Wave 4 blast radius
- capture the review commands and owner closeout evidence gate for this
  support slice

Out of scope:

- editing L1/L2 truth, `ai-status.json`, `current-work.md`, or the
  parent task row
- editing `apps/driver-app/app/incident.tsx`,
  `apps/driver-app/tests/unit/incident-screen.test.ts`, or any other
  parent-write-scope file
- pre-approving the future parent diff or predicting its exact visual
  implementation details
- changing incident semantics already anchored in shipped code and
  higher-precedence product truth: `category: "safety"`,
  `severity: "critical"`, `reportedBy: "driver"`, escalation to
  `safety_officer`, and success navigation back to `/trip`
- inventing new backend endpoints, new SOS categories, or a new
  dependency edge not already recorded in machine truth

---

## 2. Machine Truth Anchors

### 2.1 Sidecar row - `ai-status.json -> DRV-UI-RD-007-SIDECAR-ACCEPTANCE`

- owner=`Codex`
- reviewer=`Codex2`
- task_class=`sidecar`
- helper_parent=`DRV-UI-RD-007`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- depends_on=`DRV-UI-RD-001`
- artifacts=
  `support/sidecars/DRV-UI-RD-007/DRV-UI-RD-007-SIDECAR-ACCEPTANCE.md`
- acceptance=
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`

### 2.2 Parent row - `ai-status.json -> DRV-UI-RD-007`

- title=`Reskin SOS`
- phase=`Wave 4`
- owner=`Codex2`
- reviewer=`Codex`
- depends_on=`DRV-UI-RD-001`
- artifacts=`apps/driver-app/`
- acceptance=
  - `pnpm --filter @drts/driver-app typecheck / lint / test`
  - `Expo dev build on Android emulator + manual screenshot vs canvas`
  - `Backend / location heartbeat / provisioning flow 不可動`
- summary_zh=`app/incident.tsx 對齊 ScreenSOS。`

### 2.3 Hard upstream dependency - `DRV-UI-RD-001`

At packet refresh time:

- status=`done`
- commit_hash=`5db92c8312953f584c0ddb51b366ea177b78b978`
- commit_subject=
  `feat(DRV-UI-RD-001): wire ui-tokens into driver-app RN primitives`

Reviewer implication:

- the parent reskin must stay on the driver-app token/primitives path
  established by `DRV-UI-RD-001`
- driver-app remains forbidden from importing `@drts/ui-web`; only
  `@drts/ui-tokens` and the RN-side primitives layer are allowed

### 2.4 Load-bearing completed slices already present in the SOS baseline

These are not new machine-truth dependencies for `DRV-UI-RD-007`, but
they are already shipped behaviors in the current `/incident` baseline
and therefore must not regress during the reskin.

| Task ID       | Status | Shipped commit                             | Behavior the reskin must preserve                                                                                                                    |
| ------------- | ------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DRV-MAT-005` | `done` | `86700a8ca8e70e5d3d74b8241400f5b2cf08d2bf` | Two-step SOS confirmation via shared danger controls, escalation to safety officer, success return to `/trip`.                                       |
| `DRV-MP-010`  | `done` | `e64fb1a5ddc2a03146f7fcf256592f581995aa11` | External-platform SOS payload preserves platform code, external order ID, local mirror order ID, native status, and `relatedOrderId` when available. |
| `TOK-UI-001`  | `done` | `a6028b7998653b96d07fbe35c1892be692956ac4` | `@drts/ui-tokens` package exists as the cross-stack token authority consumed by driver-app primitives.                                               |

### 2.5 Downstream consumer

| Task ID         | Relationship                  | Why it matters                                                                                                                                                 |
| --------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DRV-UI-RD-009` | Wave 4 driver closeout packet | The eventual Wave 4 closeout will need the parent review evidence for `DRV-UI-RD-007`, including reviewer, approval time, commit hash, and verification notes. |

---

## 3. Authoritative Product and Design Anchors

### 3.1 Wave 4 planning ref

`docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md` records:

- `DRV-UI-RD-007` = Reskin SOS (`app/incident.tsx`)
- shared Wave 4 acceptance=
  - `pnpm --filter @drts/driver-app typecheck`
  - `pnpm --filter @drts/driver-app test`
  - `pnpm --filter @drts/driver-app lint`
  - Expo dev build on Android emulator + manual screenshot vs design canvas
- shared guardrails=
  - no backend behavior changes
  - no location heartbeat changes
  - no provisioning-flow changes
  - no `@drts/ui-web` import path in the driver app

### 3.2 Higher-precedence product truth

`docs/01-product/driver-app-multi-platform-product-spec-20260507.md`
section `5.9 SOS Incident` requires:

- safety context
- optional details
- confirm before submit
- create critical safety incident
- escalate to safety officer
- return to trip after submit
- when tied to an external-platform order, preserve:
  - platform code
  - external order ID
  - local mirror order ID
  - current native status

### 3.3 Supporting design refs

`docs/02-architecture/driver-app-productization-design-plan-20260504.md`
section `4.4 /incident` requires:

- danger-tone header
- optional detail input
- explicit confirmation before submit
- secondary return-to-trip action

`docs/03-runbooks/driver-app-design-rebuild-execution-packet-20260507.md`
section `8. SOS / Incident` proposes additional parity targets:

- emergency header card
- situation category grid
- current order context card with platform badge/external order details
- bottom action bar with cancel + critical confirm affordance

Precedence note:

- the product spec and design plan are higher-precedence than the
  runbook packet
- therefore the non-negotiable acceptance bar is **two-step critical
  confirmation** and payload/context preservation
- if the parent chooses to add a long-press or richer category-grid
  affordance from the lower-precedence runbook, that is acceptable only
  if it does not regress the higher-precedence semantics above

### 3.4 Current runtime baseline in `apps/driver-app/app/incident.tsx`

At packet refresh time, the existing implementation already does all of
the following:

- uses `confirmDangerAction(...)` before any API call
- calls `createIncident(...)` with:
  - `title: "司機 SOS 緊急通報"`
  - `category: "safety"`
  - `severity: "critical"`
  - `reportedBy: "driver"`
- calls `updateIncident(created.incidentId, { escalationTarget: "safety_officer" })`
- returns to `/trip` on success
- preserves forwarded-task context in the incident description and
  `relatedOrderId` when the active task comes from an external platform

Reviewer implication:

- `DRV-UI-RD-007` is a visual reskin task, not a semantics-reset task
- any parent diff that weakens the current confirmation path, removes
  platform context, changes incident category/severity/escalation, or
  stops returning to `/trip` is a regression

---

## 4. Dependency Map

### A. Formal upstream dependency

| Dep ID          | Status | What it contributes                                                                                                          |
| --------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `DRV-UI-RD-001` | `done` | Provides the RN-side token/primitives layer and the accepted driver-app redesign foundation required by every Wave 4 reskin. |

Transitive context already folded into that foundation:

- `TOK-UI-001` provides `@drts/ui-tokens`

### B. Baseline behavior dependencies to preserve

| Prior slice   | Why it is load-bearing for SOS review                                                  |
| ------------- | -------------------------------------------------------------------------------------- |
| `DRV-MAT-005` | Parent reskin must keep the shared danger-action UX and safety escalation flow intact. |
| `DRV-MP-010`  | Parent reskin must keep source-platform incident context intact for forwarded tasks.   |

### C. Downstream review/closeout consumers

| Consumer        | Relationship                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| `DRV-UI-RD-009` | Depends on `DRV-UI-RD-007` reaching review-approved/done with usable evidence for the Wave 4 closeout packet. |

---

## 5. Acceptance Checklist

The list below is what the parent reviewer (`Codex`) should apply when
`DRV-UI-RD-007` reaches `review`.

### 5.1 Standard Wave 4 verification

- [ ] `pnpm --filter @drts/driver-app typecheck` passes at the parent review commit.
- [ ] `pnpm --filter @drts/driver-app test` passes at the parent review commit.
- [ ] `pnpm --filter @drts/driver-app lint` passes at the parent review commit.
- [ ] Android Expo dev build/manual screenshot comparison is either run or explicitly recorded as environment-blocked; it must not be silently skipped.

### 5.2 Visual/SOS parity gates

- [ ] `apps/driver-app/app/incident.tsx` is visually reskinned toward `ScreenSOS` rather than left as a generic form-only page.
- [ ] The screen keeps a clear danger/safety visual hierarchy appropriate for SOS.
- [ ] The screen keeps an explicit secondary way to return/cancel back to `/trip`.
- [ ] If the parent claims full `ScreenSOS` parity, the delivered screen includes the richer context affordances the runbook packet calls out:
  - emergency header card
  - situation/category presentation
  - current order context card when launched from an external-platform task

### 5.3 No-regression behavior gates

- [ ] SOS submission still requires a two-step critical confirmation before any API call.
- [ ] Successful submit still creates a safety-category, critical-severity incident.
- [ ] Successful submit still escalates to `safety_officer`.
- [ ] Successful submit still returns the driver to `/trip`.
- [ ] Optional details remain optional; blank details still produce a valid SOS incident.

### 5.4 Multi-platform context preservation gates

- [ ] When there is an active external-platform task, the incident payload still preserves platform/order context rather than dropping it during the reskin.
- [ ] Forwarded-task SOS still attaches `relatedOrderId` when available.
- [ ] Driver-facing copy remains safety-focused; it must not expose adapter-debug language or leak raw backend jargon into the SOS flow.

### 5.5 Guardrails

- [ ] No import from `@drts/ui-web` is introduced into the mobile app.
- [ ] No backend behavior, location-heartbeat logic, or provisioning flow is changed.
- [ ] The reskin does not weaken any shipped `sync_failed` or forwarded-task handling that the current baseline already preserves indirectly through the workspace/task context helpers.
- [ ] If the parent changes `apps/driver-app/tests/unit/incident-screen.test.ts`, the updated tests still prove the confirmation gate and forwarded-task context behavior rather than deleting those assertions.

---

## 6. Reviewer Handoff Notes

Recommended parent-review command set:

```bash
pnpm --filter @drts/driver-app typecheck
pnpm --filter @drts/driver-app lint
pnpm --filter @drts/driver-app test -- --run tests/unit/incident-screen.test.ts
```

Manual gate outside the repo sandbox:

- Expo dev build on Android emulator + screenshot comparison against the
  SOS design canvas

Sidecar review focus for `Codex2`:

- confirm this packet stays within sidecar scope
- confirm the machine-truth anchors above match `ai-status.json`
- confirm the acceptance checklist is aligned to the real parent surface
  (`apps/driver-app/app/incident.tsx`) and its shipped baseline

---

## 7. Closeout Gate For This Sidecar

This sidecar may be support-only, but the dispatch-specific supervisor
instruction for this wake-up is stricter than the generic sidecar
workflow: the owner should not mark this task `done` unless it has its
own task-scoped commit and ordinary non-force push evidence
(`COMMIT_HASH`, `COMMIT_SUBJECT`, `PUSH_REMOTE`, `PUSH_BRANCH`).

At packet refresh time, this artifact's existing git history is not yet
task-scoped: the file was originally introduced inside commit
`71bac533410fa4094e0b8e872bf9622a8296af63`, whose subject belongs to
`DRV-UI-RD-008-SIDECAR-ACCEPTANCE`. Owner closeout for
`DRV-UI-RD-007-SIDECAR-ACCEPTANCE` must therefore use a fresh
task-scoped commit rather than relying on that shared commit.
