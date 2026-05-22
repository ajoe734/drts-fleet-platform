# PH1GC-COM-001 — Sidecar Acceptance & Dependency Packet

**Helper task:** `PH1GC-COM-001-SIDECAR-ACCEPTANCE`
**Helper owner:** `Claude`
**Helper reviewer:** `Codex`
**Parent task:** `PH1GC-COM-001` — CTI / Recording / Filing Live Provider Evidence Classification (directive §G COM-001)
**Parent owner:** `Codex`
**Parent reviewer:** `Codex2`
**Prepared:** `2026-05-22 (UTC)`
**Class:** sidecar support artifact (acceptance packet) — non-canonical. Does not edit L1/L2 truth.
**Authority of this file:** descriptive only. Authoritative sources stay the directive, the task brief, and `ai-status.json`. Wherever this packet conflicts with those, the higher-precedence source wins.

---

## 0. Why this packet exists

The supervisor auto-spawned this helper to pre-stage everything Codex needs before dispatching `PH1GC-COM-001`, so the parent slice spends zero time re-deriving acceptance items, dependency edges, or gate-read wording. The packet:

- consolidates the directive §G content acceptance into a single check-list,
- traces upstream/downstream dependencies (PH1GC-MATRIX-001, EXT-004, the existing COM-LIVE-001 sidecar),
- pre-flights the path-collision and naming guard rails that have burned earlier closeouts on the same family,
- restates the directive §7 closeout shape so the parent owner can fill it in mechanically.

Nothing in this file alters canonical truth. The `docs/02-architecture/cti-recording-filing-blueprint-20260519.md` and `support/sidecars/WF-COM-001-LIVE-PROVIDER/` deliverables remain the parent owner's responsibility.

---

## 1. Canonical references (read before claiming PH1GC-COM-001)

| Layer                      | Path                                                                           | Role for COM-001                                                              |
| -------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Directive (spec)           | `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md`| §G defines the COM-001 deliverable shape, content list, and gate-read wording.|
| Directive (status truth)   | `docs/00-context/phase1-origin-dev-gap-closure-status-truth-20260522.md`       | §2.4 row 4 confirms `support/sidecars/WF-COM-001-LIVE-PROVIDER/` is MISSING on origin/dev and is distinct from `support/sidecars/COM-LIVE-001/`. |
| Task brief                 | `.orchestrator/task-briefs/PH1GC-COM-001.md`                                   | Dispatchable brief. Authoritative when this packet drifts.                    |
| Workflow gate truth        | `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`                 | The row whose gate-read text PH1GC-MATRIX-001 will update for `WF-COM-001`.   |
| Prior partial evidence pack| `support/sidecars/COM-LIVE-001/COM-LIVE-001-EVIDENCE-PACK.md`                  | Earlier dated snapshot. **Different path, different ID** — do not move/rename.|
| External blocker packet    | `support/sidecars/EXT-004/EXT-004-CTI-RECORDING-FILING-GATE.md`                | `EXT-004-BLK-001..008` binding blocker set. Reference, do not re-author.      |
| Repo seams (implementation)| `apps/api/src/modules/callcenter/callcenter.controller.ts`<br>`apps/api/src/modules/reporting-filing/reporting-filing.controller.ts`<br>`apps/api/src/modules/reporting-filing/reporting-filing.service.ts` | Callback / filing endpoints whose live behaviour is what the new sidecar must witness. |
| Retention / signed-download policy | `docs/03-runbooks/evidence-retention-and-evidentiary-access-policy.md` | Source for retention rule + legal-hold + permissioned signed-download proof. |

---

## 2. Acceptance check-list for the parent slice

PH1GC-COM-001 is `done` only when **all** boxes below resolve to true on `origin/dev`. Each box is taken straight from the directive or the status-truth doc; the **verification** column gives Codex the exact command to run.

### 2.1 Artifact existence

| #   | Check                                                                                                               | Verification command                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| A1  | `docs/02-architecture/cti-recording-filing-blueprint-20260519.md` exists on `origin/dev`.                           | `git ls-tree -r origin/dev -- docs/02-architecture/cti-recording-filing-blueprint-20260519.md`|
| A2  | `support/sidecars/WF-COM-001-LIVE-PROVIDER/` exists on `origin/dev` as a tracked directory (≥1 file).               | `git ls-tree -r origin/dev -- support/sidecars/WF-COM-001-LIVE-PROVIDER`                      |
| A3  | A2 path is **distinct** from `support/sidecars/COM-LIVE-001/`. Old sidecar remains untouched.                        | `git ls-tree -r origin/dev -- support/sidecars/COM-LIVE-001` (must still resolve, unchanged)  |
| A4  | Blueprint references the sidecar path at least once (no dead pointer).                                              | `grep -n "support/sidecars/WF-COM-001-LIVE-PROVIDER" docs/02-architecture/cti-recording-filing-blueprint-20260519.md` |
| A5  | Blueprint declares provider classification explicitly (`sandbox` or `live`).                                        | `grep -niE 'classification:|provider:.*(sandbox|live)' docs/02-architecture/cti-recording-filing-blueprint-20260519.md` |

### 2.2 Sidecar content — directive §G nine-item list

The sidecar README (canonical name suggestion: `support/sidecars/WF-COM-001-LIVE-PROVIDER/README.md` or `WF-COM-001-LIVE-PROVIDER-EVIDENCE-PACK.md`) must contain or link to each of the following items. Mark each as `live`, `sandbox`, or `non-claim` (with a one-line reason). `non-claim` is acceptable per the brief's external-dependency callout, but the box itself must exist.

| #   | Required item                                | Spec ref                  | Acceptance rule                                                                                                  |
| --- | -------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| C1  | Provider name + sandbox/live classification  | Directive §G first bullet | Exactly one classification token. Provider name must be a real CTI vendor or stub identifier, not "TBD".         |
| C2  | Call session creation proof                  | Directive §G              | Signed/redacted request/response sample of the session-create call, or a clearly labelled non-claim.             |
| C3  | Recording pending proof                      | Directive §G              | Evidence the provider acknowledges recording is in flight (state=`pending`/`processing` or equivalent).          |
| C4  | Recording-ready callback proof               | Directive §G              | Inbound callback sample hitting `POST /api/callcenter/sessions/:callId/recording-callback` with signature header.|
| C5  | Recording index export                       | Directive §G              | Output of `dispatch_recording_index` reporting path, or sandbox-equivalent export manifest.                      |
| C6  | Filing package artifact                      | Directive §G              | Sample filing package generated via `POST /api/filing-packages/generate` (manifest + checksum acceptable).        |
| C7  | Retention rule proof                         | Directive §G              | Evidence retention configuration matches `docs/03-runbooks/evidence-retention-and-evidentiary-access-policy.md`. |
| C8  | Legal hold proof                             | Directive §G              | Demonstrates legal-hold flag can be set and blocks deletion; sign-off owner named.                               |
| C9  | Permissioned signed download proof           | Directive §G              | Signed-URL download exercised under permissioned role; unauthorised role must be shown to be rejected.           |

**Non-claim rule** (from `.orchestrator/task-briefs/PH1GC-COM-001.md`, "External dependency callout"): if provider is unreachable, document classification and mark missing items as `non-claim` in the sidecar README — but the brief itself must **not** be marked `done` until A1..A5 and the §G item list (even if mostly `non-claim`) all physically exist on `origin/dev`.

### 2.3 Gate-read consistency

| #   | Check                                                                                                                                                              | Verification                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| G1  | If C1 = `sandbox`: gate read for `WF-COM-001` updated through `PH1GC-MATRIX-001` to `PASS (sandbox evidence)`.                                                     | `grep -n 'WF-COM-001' docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`           |
| G2  | If C1 = `live`: gate read updated to `PASS (live staging evidence)`.                                                                                               | same as G1                                                                                    |
| G3  | Gate-read change is delivered via `PH1GC-MATRIX-001`, not patched directly inside PH1GC-COM-001. PH1GC-COM-001's own commits leave the matrix doc alone.            | `git log -p origin/dev -- docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` shows the change under PH1GC-MATRIX-001 trailer. |

### 2.4 Closeout report

Closeout must use directive §7 format. Codex fills:

```text
Task ID: PH1GC-COM-001
Owner: Codex
Reviewer: Codex2
Branch: <task branch on origin>
PR: <PR url / number>
Commit: <COMMIT_HASH> — <subject containing PH1GC-COM-001>
Files changed:
  - docs/02-architecture/cti-recording-filing-blueprint-20260519.md
  - support/sidecars/WF-COM-001-LIVE-PROVIDER/<files>
Verification commands:
  - git ls-tree -r origin/dev -- docs/02-architecture/cti-recording-filing-blueprint-20260519.md
  - git ls-tree -r origin/dev -- support/sidecars/WF-COM-001-LIVE-PROVIDER
  - grep -nE 'classification:|provider:' docs/02-architecture/cti-recording-filing-blueprint-20260519.md
Evidence artifact: support/sidecars/WF-COM-001-LIVE-PROVIDER/<README or evidence pack>
Workflow family affected: WF-COM-001
Gate read before: <current gate-read string from phase1-workflow-acceptance-release-gates.md>
Gate read after: PASS (sandbox evidence) | PASS (live staging evidence)
Remaining non-claim: <enumerate any C2..C9 items marked non-claim>
External dependencies, if any: <provider sandbox/live access; legal hold reviewer>
```

A closeout missing any field is a reopen condition for the reviewer.

---

## 3. Dependency map

### 3.1 Upstream (must land or be confirmed before PH1GC-COM-001 can finalize)

| Source                          | Type                  | Reason                                                                                                              | Status notes                                                                                                              |
| ------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Provider sandbox/live access    | External, human-gated | C1..C9 evidence cannot be collected without it.                                                                     | If unreachable, see "Non-claim rule" in §2.2. Brief's `External dependency callout` allows partial close on `non-claim`.  |
| Legal hold reviewer sign-off    | External, human-gated | C8 requires named sign-off owner.                                                                                   | Owner must be a person, not a team alias.                                                                                 |
| `EXT-004` blocker packet        | Repo doc              | `EXT-004-BLK-001..008` define what the live posture must satisfy.                                                   | Already present at `support/sidecars/EXT-004/EXT-004-CTI-RECORDING-FILING-GATE.md`. Reference only — do not edit.         |
| Retention/access policy doc     | Repo doc              | C7/C8/C9 must align with the doc's wording.                                                                         | Already present at `docs/03-runbooks/evidence-retention-and-evidentiary-access-policy.md`. Reference only — do not edit.  |

PH1GC-COM-001 does **not** depend on PH1GC-MATRIX-001 landing first. PH1GC-MATRIX-001 instead depends on PH1GC-COM-001 producing the classification token so the gate-read string is decided.

### 3.2 Downstream (these consume PH1GC-COM-001's output)

| Consumer                              | Edge                                                                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `PH1GC-MATRIX-001`                    | Reads C1 classification → updates `WF-COM-001` row gate-read text. See gap-closure status-truth §2.5.                        |
| `PH1GC-MATRIX-002` (E2E matrix delta) | Indirect: WF-COM-001 row affects matrix completeness once C1 is published.                                                   |
| Final phase1 business-flow closeout   | Directive §10 line `[ ] support/sidecars/WF-COM-001-LIVE-PROVIDER/` cannot be ticked until A2 holds on origin/dev.            |

### 3.3 Sibling / orthogonal — do NOT touch

| Path                                 | Reason it must remain untouched                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `support/sidecars/COM-LIVE-001/`     | Earlier dated partial-evidence pack under a different ID. Renaming or merging into the new path would destroy provenance.    |
| `support/sidecars/EXT-004/`          | Binding blocker packet. PH1GC-COM-001's job is to satisfy/reference these blockers, not edit them.                           |
| Other `support/sidecars/PH1GC-*/`    | Each PH1GC sidecar is owned by its own slice. Cross-edits invalidate per-brief acceptance.                                   |

### 3.4 Cross-brief no-collision invariants

1. Path A2 (`WF-COM-001-LIVE-PROVIDER`) must never collide with A3 (`COM-LIVE-001`). Status-truth §2.4 row 4 calls this out explicitly.
2. Blueprint doc filename includes the date stamp `20260519`. Do **not** drift to a different date or location — directive §G hard-codes the path.
3. The classification token in C1 is the **only** signal PH1GC-MATRIX-001 reads. Picking inconsistent wording (e.g., `sandbox-equivalent`) will break that downstream slice's grep.

---

## 4. Guardrail summary for the parent owner

Lifted from the task brief plus repo-wide `docs/ops/branch-strategy.md` §11.1; restated so the parent owner does not have to re-read both:

- Anchor commit + non-force push the work on the parent's own task branch before yielding. Trailer pattern:
  ```
  feat(ph1gc-com-001): <scope>

  LLM-Agent: Codex
  Task-ID: PH1GC-COM-001
  Reviewer: Codex2
  ```
- Do **not** edit canonical L1/L2 truth from inside PH1GC-COM-001. Specifically:
  - leave `phase1_*` root docs alone,
  - leave the workflow gate matrix alone (PH1GC-MATRIX-001 owns it),
  - leave the prior `support/sidecars/COM-LIVE-001/` snapshot alone.
- New files only land under `docs/02-architecture/cti-recording-filing-blueprint-20260519.md` and `support/sidecars/WF-COM-001-LIVE-PROVIDER/**`.
- Use `scripts/ai-status.sh` for every state transition. Do **not** hand-edit `ai-status.json`, `current-work.md`, or `ai-activity-log.jsonl`.
- `done` requires `COMMIT_HASH`, `COMMIT_SUBJECT`, `PUSH_REMOTE`, `PUSH_BRANCH` per `AI_COLLABORATION_GUIDE.md` §5 commit-evidence rule. `NO_COMMIT_REQUIRED=1` is **not** valid here (PH1GC-COM-001 is a canonical implementation slice, not a sidecar closeout).

---

## 5. Reviewer hand-off checklist for THIS helper (PH1GC-COM-001-SIDECAR-ACCEPTANCE)

For `Codex` reviewing the helper itself (this file), the bar is:

- [x] File lives at `support/sidecars/PH1GC-COM-001/PH1GC-COM-001-SIDECAR-ACCEPTANCE.md` only.
- [x] No canonical L1/L2 doc edited.
- [x] Acceptance check-list (§2) covers all four parent acceptance lines from the brief.
- [x] Dependency map (§3) names PH1GC-MATRIX-001, EXT-004, COM-LIVE-001, retention policy.
- [x] Closeout template (§2.4) matches directive §7 exactly.
- [x] Path-collision and date-stamp invariants (§3.4) explicit.
- [ ] Reviewer accepts via `AI_NAME=Codex scripts/ai-status.sh approve PH1GC-COM-001-SIDECAR-ACCEPTANCE "<note>"`.
- [ ] After approve, owner (`Claude`) commits + non-force pushes the packet, then closes with `done` per the closeout rule.

If the reviewer wants additional items recorded (e.g., issuer name reservation, specific provider candidates), `reopen` with a one-line ask — this packet is intentionally framed as appendable.

---

## 6. Pointer summary for the supervisor

- This packet is a **support artifact**. It does not consume the PH1GC-COM-001 slice or absorb its acceptance items.
- The supervisor may surface this packet to PH1GC-COM-001's owner at dispatch time, e.g., as additional reading alongside `.orchestrator/task-briefs/PH1GC-COM-001.md`.
- When PH1GC-COM-001 lands on origin/dev, this helper may be left in place as historical context or removed as part of a sidecar-cleanup pass; either choice is acceptable.
