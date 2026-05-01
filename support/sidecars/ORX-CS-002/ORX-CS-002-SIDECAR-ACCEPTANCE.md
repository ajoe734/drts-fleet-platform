# ORX-CS-002 Acceptance Packet

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `ORX-CS-002` - incident escalation, service recovery, and dispatch-exception handoff  
**Current Owner:** `Codex2`  
**Assigned Reviewer:** `Claude`  
**Parent Owner At Snapshot:** `Claude`  
**Parent Reviewer At Snapshot:** `Gemini2`  
**Last Revised:** `2026-05-01 (UTC)`  
**Status:** `REVIEW-STAGE SUPPORT ARTIFACT — reviewer-ready acceptance framing for ORX-CS-002; support-only and non-canonical.`

---

## 1) Scope Boundary

本 sidecar 只整理 `ORX-CS-002` 的 acceptance checklist、dependency map、evidence anchors、與 reviewer handoff 指引。

- In scope: support-only acceptance framing, upstream dependency state, verification commands, reviewer hotspot map.
- Out of scope: 修改 L1 canonical truth、改寫 parent 任務正式 closeout 結論、變更 runtime / registry / governance / contracts 主線實作。

---

## 2) Machine-Truth Snapshot

Snapshot 依據：`ai-status.json`、`.orchestrator/task-briefs/ORX-CS-002-SIDECAR-ACCEPTANCE.md`、既有 repo evidence。

- Parent `ORX-CS-002`
  - owner=`Claude`
  - reviewer=`Gemini2`
  - title=`Incident escalation, service recovery, and dispatch-exception handoff`
- Sidecar `ORX-CS-002-SIDECAR-ACCEPTANCE`
  - owner=`Codex2`
  - reviewer=`Claude`
  - status=`in_progress` at dispatch snapshot
  - helper kind=`acceptance_packet`
  - support artifact=`support/sidecars/ORX-CS-002/ORX-CS-002-SIDECAR-ACCEPTANCE.md`
  - `mutates_canonical=false`

### Direct Dependencies

| Dep ID       | Status | Why it matters to `ORX-CS-002`                                                                                                                               |
| ------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ORX-CS-001` | `done` | Complaint taxonomy and complaint lifecycle are upstream because incidents can be escalated from complaints and linked bidirectionally.                       |
| `ORX-DP-003` | `done` | Exception-hold, override, and release semantics are upstream because dispatch exceptions are handed into the incident lane and must preserve dispatch trace. |

### Downstream Consumer

| Task ID      | Why it still depends on `ORX-CS-002`                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ORX-GV-002` | Governance routing and runbook ownership need the incident/escalation path to be materially closed before role-routing evidence can be finalized. |

---

## 3) Evidence Anchors

### Contract And API Surface

| Area                                                                                | Evidence                                                      |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Incident update fields include assignee / escalation / severity                     | `packages/contracts/src/index.ts:3511-3516`                   |
| Dispatch-exception handoff command exists                                           | `packages/contracts/src/index.ts:3519-3526`                   |
| Service-recovery command + persisted record types exist                             | `packages/contracts/src/index.ts:3528-3548`                   |
| Incident record preserves assignment + escalation + dispatch source trace           | `packages/contracts/src/index.ts:3550-3568`                   |
| API client exposes dispatch-exception and service-recovery methods                  | `packages/api-client/src/index.ts:1905-1918`                  |
| Incident controller exposes dispatch-exception handoff + service-recovery endpoints | `apps/api/src/modules/incident/incident.controller.ts:88-122` |

### Cross-Lane Workflow Bridges

| Bridge                                                                                                                                           | Evidence                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Complaint -> incident escalation creates incident, sets severity, and reuses complaint assignee                                                  | `apps/api/src/modules/complaint/complaint.controller.ts:174-220`           |
| Incident update flow validates and persists `assignedTo`, `severity`, and `escalationTarget` with timeline entries                               | `apps/api/src/modules/incident/incident.service.ts:176-250`                |
| Dispatch exception -> incident handoff preserves `relatedOrderId` and `sourceDispatchExceptionOrderId`, then writes `dispatch_exception_handoff` | `apps/api/src/modules/incident/incident.service.ts:334-418`                |
| Service recovery actions are validated, persisted, audited, and appended to the incident timeline                                                | `apps/api/src/modules/incident/incident.service.ts:420-492`                |
| Upstream exception-hold / override endpoints remain explicit on the dispatch side                                                                | `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts:324-394` |

### UI And Runbook Anchors

| Area                                                                                                                   | Evidence                                                                               |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Ops incidents page exposes severity filtering, escalation badges, dispatch source marker, and service-recovery actions | `apps/ops-console-web/app/incidents/page.tsx:150-191`, `:431-467`, `:620-665`          |
| Driver SOS flow creates a `critical` incident and sets `safety_officer` escalation target                              | `apps/driver-app/app/incident.tsx:30-50`                                               |
| Runbook defines escalation targets, dispatch-exception handoff, and service-recovery review expectations               | `docs/03-runbooks/incident-escalation-service-recovery-runbook.md:11-123`              |
| Parent acceptance source                                                                                               | `docs/03-runbooks/phase1-operational-remediation-execution-packet-20260430.md:482-497` |

---

## 4) Parent Acceptance Expansion

### AC-1: Incident owner, severity, and escalation target are explicit

**Status:** `PASS`

- `IncidentRecord` persists `assignedTo`, `severity`, and `escalationTarget`: `packages/contracts/src/index.ts:3550-3568`.
- `updateIncident()` validates and records severity / escalation changes and assignment timeline entries: `apps/api/src/modules/incident/incident.service.ts:195-241`.
- The ops incidents UI exposes severity filtering, critical prioritization, escalation badges, and edit controls: `apps/ops-console-web/app/incidents/page.tsx:150-191`, `:252-296`, `:431-486`.
- Driver SOS uses the same incident lane and explicitly escalates to `safety_officer`: `apps/driver-app/app/incident.tsx:30-50`.
- Operational runbook documents severity and escalation target handling: `docs/03-runbooks/incident-escalation-service-recovery-runbook.md:11-36`.

### AC-2: Dispatch exceptions can become incidents without losing original trace

**Status:** `PASS`

- Dedicated command / endpoint surface exists: `packages/contracts/src/index.ts:3519-3526`, `apps/api/src/modules/incident/incident.controller.ts:88-96`.
- Incident creation from dispatch exception preserves both `relatedOrderId` and `sourceDispatchExceptionOrderId`: `apps/api/src/modules/incident/incident.service.ts:359-381`.
- Timeline evidence is explicit through `dispatch_exception_handoff`: `apps/api/src/modules/incident/incident.service.ts:384-393`.
- Complaint escalation remains a separate upstream bridge and does not replace the dispatch source path: `apps/api/src/modules/complaint/complaint.controller.ts:174-220`.
- Runbook documents the preserved trace field and the handoff path: `docs/03-runbooks/incident-escalation-service-recovery-runbook.md:38-65`.

### AC-3: Service-recovery actions are visible and reviewable

**Status:** `PASS`

- Contracts define `RecordServiceRecoveryActionCommand` and `ServiceRecoveryActionRecord`: `packages/contracts/src/index.ts:3528-3548`.
- Incident service validates action type, records actor + note, persists the record, and appends `service_recovery_action` timeline evidence: `apps/api/src/modules/incident/incident.service.ts:420-492`.
- Controller exposes both create and list endpoints for service recovery actions: `apps/api/src/modules/incident/incident.controller.ts:98-122`.
- Ops incidents UI loads service-recovery history and supports adding new actions from the incident detail view: `apps/ops-console-web/app/incidents/page.tsx:133-148`, `:620-665`.
- Runbook documents the recovery taxonomy and reviewer expectations: `docs/03-runbooks/incident-escalation-service-recovery-runbook.md:67-123`.

---

## 5) Verification Evidence

### Commands Actually Verified On 2026-05-01

```bash
pnpm exec vitest run tests/unit/incident.test.ts
cd apps/api && pnpm exec vitest run tests/unit/complaint-incident-escalation.test.ts
```

### Results

- Root incident suite: `1` file passed, `9/9` tests passed.
- `apps/api` complaint-escalation suite: `1` file passed, `12/12` tests passed.

### Important Execution Note

The second suite is **not** runnable from the repo root via:

```bash
pnpm exec vitest run apps/api/tests/unit/complaint-incident-escalation.test.ts
```

Root `vitest.config.ts` only includes `tests/unit/**/*.test.ts`, so reviewer reruns should use the `apps/api` working directory for that suite.

### What Automation Covers

- Incident creation, retrieval, category/severity validation, SOS `critical` acceptance, assignment/status timeline behavior: `tests/unit/incident.test.ts:15-171`
- Complaint escalation, bidirectional complaint/incident linking, anti-orphan safeguards, anti-relink conflicts, audit trail: `apps/api/tests/unit/complaint-incident-escalation.test.ts:29-449`

### Manual Walkthrough Still Worth Keeping In Parent Review

1. From the dispatch UI, trigger the exception-hold to incident escalation path and confirm the incidents page receives the prefilled order context.
2. On the incidents page, confirm the new record shows the dispatch-exception marker and preserves order deep-linking.
3. Record one service-recovery action and verify it appears in both the timeline pane and the persisted action list.

---

## 6) Review Notes And Non-Blocking Gaps

- There is still no dedicated automated test in the current suite for `createFromDispatchException()` or `recordServiceRecoveryAction()` themselves; current automated coverage is strongest around incident CRUD/SOS behavior and complaint-escalation linkage.
- This sidecar did not verify the dispatch-console UI implementation end to end; it only confirmed the incident-side contracts, controller/service flow, and runbook/UI anchors already present in the repo.
- The parent task may still require its own final synthesis and reviewer judgement; this packet is evidence support, not a canonical declaration that `ORX-CS-002` should immediately move to `done`.

---

## 7) Reviewer Hotspots For `Claude`

1. Confirm the packet’s acceptance claims stay inside support-only scope and do not overstate parent completion.
2. Confirm AC-2 is interpreted as preserving dispatch trace through `sourceDispatchExceptionOrderId` plus `dispatch_exception_handoff`, not merely having a generic incident create path.
3. Confirm the verification section now reflects the **actual** runnable command shape for the complaint-escalation suite.
4. Decide whether the parent review needs a targeted follow-up test for `createFromDispatchException()` or whether the current evidence is sufficient for the remediation packet.

---

## 8) Handoff Commands

### Owner -> Reviewer (`Codex2` -> `Claude`)

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py handoff ORX-CS-002-SIDECAR-ACCEPTANCE Claude "ORX-CS-002 acceptance packet is ready at support/sidecars/ORX-CS-002/ORX-CS-002-SIDECAR-ACCEPTANCE.md. It freezes the dependency map on ORX-CS-001 and ORX-DP-003, expands the three parent acceptance criteria with repo evidence anchors, and documents the verified test commands including the apps/api working-directory requirement for complaint-incident-escalation coverage. Support artifact only; no canonical truth changed."
```

### Reviewer Approve (`Claude`)

```bash
AI_NAME=Claude REVIEW_FILE=support/sidecars/ORX-CS-002/ORX-CS-002-SIDECAR-ACCEPTANCE.md python3 scripts/ai_status.py approve ORX-CS-002-SIDECAR-ACCEPTANCE "審查通過：ORX-CS-002 acceptance packet 已整理 incident escalation、dispatch-exception handoff、service-recovery evidence 與 dependency map，並修正 complaint-escalation test 的實際 rerun 方式。support artifact only；回到 owner（Codex2）以 NO_COMMIT_REQUIRED=1 做 done closeout。"
```

### Owner Done Closeout (`Codex2`)

```bash
AI_NAME=Codex2 NO_COMMIT_REQUIRED=1 python3 scripts/ai_status.py done ORX-CS-002-SIDECAR-ACCEPTANCE "Owner finalized approved sidecar; the ORX-CS-002 support-only acceptance packet is filed at support/sidecars/ORX-CS-002/ORX-CS-002-SIDECAR-ACCEPTANCE.md for Claude to absorb into the parent review flow without changing canonical truth."
```
