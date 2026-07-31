# STAGE1-PILOT-RAILS-20260731 Sidecar Acceptance Packet

> **Task ID:** `STAGE1-PILOT-RAILS-20260731-SIDECAR-ACCEPTANCE`
> **Parent Task:** `STAGE1-PILOT-RAILS-20260731`
> **Sidecar Owner:** `Codex`
> **Sidecar Reviewer:** `Codex2`
> **Helper Kind:** `acceptance_packet`
> **Mutates Canonical:** `false`
> **Prepared:** `2026-07-31`

This packet is a support artifact only. It packages the current machine-truth snapshot, dependency map, acceptance framing, and reviewer handoff guidance for `STAGE1-PILOT-RAILS-20260731` without changing canonical truth, runtime code, or governance records.

---

## 1. Machine-Truth Snapshot

### 1.1 Sidecar row

`STAGE1-PILOT-RAILS-20260731-SIDECAR-ACCEPTANCE` is currently `in_progress` under owner `Codex` and reviewer `Codex2`, with `last_update=2026-07-31T15:25:46Z`.

Authoritative fields from machine truth:

- `title`: `Prepare STAGE1-PILOT-RAILS-20260731 acceptance packet and dependency map`
- `acceptance[]`:
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`
- `artifacts[]`:
  - `support/sidecars/STAGE1-PILOT-RAILS-20260731/STAGE1-PILOT-RAILS-20260731-SIDECAR-ACCEPTANCE.md`

### 1.2 Parent row

`STAGE1-PILOT-RAILS-20260731` is currently `in_progress` under owner `Codex2` and reviewer `Codex`, with `last_update=2026-07-31T15:22:23Z`.

Parent summary:

- Focus: repair controllable staging / production rails for authoritative active surfaces, deploy and domain mapping, runtime matrix, smoke URL inventory, and false-green gate cleanup.
- Hard scope constraints:
  - `Concierge` remains retired and must stay out of active inventory.
  - `Referral` must use the formal partner-scoped entry.
  - External four-category gates are excluded and must not block this task.
  - No deployment and no billing changes.

### 1.3 Upstream dependency row

`STAGE1-CONTROLLABLE-AUDIT-20260731` is `done` as of `2026-07-31T15:07:21Z`.

Dependency closeout signal:

- The audit already produced the controllable-gap inventory this parent task is expected to consume.
- Its `next` field records closeout metadata and evidence for the branch-scoped audit completion.

---

## 2. Dependency Map

### 2.1 Formal upstream dependency

| ID | Status | Why it matters |
| --- | --- | --- |
| `STAGE1-CONTROLLABLE-AUDIT-20260731` | `done` | Establishes the authoritative controllable-gap baseline. This sidecar should treat the audit as frozen input and must not restate contradictory canonical truth. |

### 2.2 Parent relationship

| Task | Status | Relationship |
| --- | --- | --- |
| `STAGE1-PILOT-RAILS-20260731` | `in_progress` | This sidecar exists only to support the parent owner with acceptance framing, dependency clarity, and reviewer handoff context. |

### 2.3 Sidecar execution implication

- This helper is unblocked because its only formal dependency is already `done`.
- The packet must not claim parent completion; the parent remains `in_progress`.
- The packet must not create new canonical requirements. It can only restate current machine truth and identify review hotspots implied by that truth.

---

## 3. Parent Acceptance Framing

Source: parent task `acceptance[]` in machine truth.

| Parent acceptance item | Support-packet framing |
| --- | --- |
| `先讀 audit task evidence 並核對目前 GCP project drts-dev-ray-tw-20260730 與 region us-central1` | Reviewer should confirm the parent work references the audit-derived baseline and keeps cloud validation anchored to `drts-dev-ray-tw-20260730` / `us-central1`, not stale environment assumptions. |
| `修正所有 repo 內可控制的 deploy workflow config drift smoke URL inventory 與 false-green gate` | Reviewer should verify the parent diff covers repo-controlled rails only: workflow config, runtime matrix, smoke URLs, domain mapping, and false-green prevention. |
| `Concierge 必須保持 retired 並從 active inventory 移除；Referral 使用正式 partner-scoped entry` | Reviewer should inspect all active-surface inventories and runbook references for accidental concierge reactivation or non-partner-scoped referral entry drift. |
| `不得部署或改動 billing；只交整合 branch` | Reviewer should confirm the parent branch contains no deploy execution, no billing mutations, and no evidence language that overclaims deployment. |
| `外部四類 gate 完全排除且不得阻擋本 task` | Reviewer should reject any parent narrative that reintroduces external provider, handset distribution, CTI recording/filing, or similar excluded gates as blockers. |

---

## 4. Sidecar Acceptance Checklist

This checklist is for the support artifact itself, not for closing the parent task.

| ID | Check | Status |
| --- | --- | --- |
| `S-1` | Output is limited to support material under `support/sidecars/STAGE1-PILOT-RAILS-20260731/` | `PASS` |
| `S-2` | No canonical truth, runtime code, workflow config, or runbook file is edited by this sidecar | `PASS` |
| `S-3` | Dependency map matches current machine truth: sidecar depends on `STAGE1-CONTROLLABLE-AUDIT-20260731`, parent remains `in_progress` | `PASS` |
| `S-4` | Packet explicitly distinguishes sidecar completion from parent completion | `PASS` |
| `S-5` | Packet includes reviewer handoff guidance for `Codex2` | `PASS` |

---

## 5. Reviewer Hotspots For The Parent Task

These are the highest-signal checks implied by the current parent brief and audit relationship.

1. Active inventory truth: confirm every updated URL / surface list keeps `Concierge` retired and routes `Referral` through the partner-scoped entry only.
2. False-green prevention: confirm any smoke or workflow gate no longer passes on stale, retired, or non-authoritative URLs.
3. Runtime matrix truth: confirm environment, domain, and workflow mappings agree with the stated active surface and do not silently preserve deprecated rails.
4. Scope discipline: confirm the parent changed repo-controlled rails only and did not drift into deploy actions, billing mutations, or excluded external gates.
5. Evidence wording: confirm any validation language distinguishes branch-level remediation from integration-level completion or dev deployment.

---

## 6. Evidence Anchors

The packet is grounded in the following machine-truth slices:

| Anchor | Source | Notes |
| --- | --- | --- |
| `E-1` | `scripts/ai-status.sh show STAGE1-PILOT-RAILS-20260731-SIDECAR-ACCEPTANCE` | Confirms sidecar owner, reviewer, formal dependency, artifact path, and current `in_progress` status. |
| `E-2` | `scripts/ai-status.sh show STAGE1-PILOT-RAILS-20260731` | Confirms parent owner/reviewer, acceptance list, evidence refs, and current `in_progress` status. |
| `E-3` | `scripts/ai-status.sh show STAGE1-CONTROLLABLE-AUDIT-20260731` | Confirms the only upstream dependency is already `done` and available as frozen audit input. |
| `E-4` | `AI_COLLABORATION_GUIDE.md` | Confirms machine-truth discipline and support-artifact boundary expectations. |

---

## 7. Reviewer Handoff

Suggested owner handoff command after packet creation:

```bash
AI_NAME=Codex scripts/ai-status.sh handoff STAGE1-PILOT-RAILS-20260731-SIDECAR-ACCEPTANCE Codex2 "Acceptance packet ready at support/sidecars/STAGE1-PILOT-RAILS-20260731/STAGE1-PILOT-RAILS-20260731-SIDECAR-ACCEPTANCE.md. It preserves machine truth for the parent in_progress closeout rail task, pins the formal dependency on done audit task STAGE1-CONTROLLABLE-AUDIT-20260731, maps the parent acceptance items into reviewer checks around active-surface truth, false-green gates, runtime/domain mapping, retired Concierge handling, and partner-scoped Referral entry, and stays within support-only sidecar boundaries without changing canonical truth."
```

Suggested reviewer approval command:

```bash
AI_NAME=Codex2 scripts/ai-status.sh approve STAGE1-PILOT-RAILS-20260731-SIDECAR-ACCEPTANCE "Acceptance packet ready: dependency map matches machine truth, parent remains correctly framed as in_progress, reviewer hotspots cover active inventory truth, false-green gates, retired Concierge handling, partner-scoped Referral entry, and support-only scope is preserved without canonical changes."
```

Suggested reviewer reopen command:

```bash
AI_NAME=Codex2 scripts/ai-status.sh reopen STAGE1-PILOT-RAILS-20260731-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / dependency-map drift / parent acceptance framing gap / scope violation]"
```

---

## 8. Notes For Final Closeout

- This packet is not evidence that the parent task is done.
- If the reviewer approves this sidecar, the owner still needs the normal task lifecycle steps for any later `done` transition.
- Integration-level claims such as `branch_pushed`, `pr_open`, `merged_to_dev`, or `dev_deployed` belong to the parent task closeout, not to this support packet unless separately recorded in machine truth.

---

## 9. Change Log

- `2026-07-31` — Refreshed the sidecar machine-truth snapshot after the failed review handoff so the packet matches the current reviewer-visible branch/worktree state.
- `2026-07-31` — Initial packet created for `STAGE1-PILOT-RAILS-20260731-SIDECAR-ACCEPTANCE`, based on current sidecar row, parent row, upstream audit row, and L0 collaboration rules.
