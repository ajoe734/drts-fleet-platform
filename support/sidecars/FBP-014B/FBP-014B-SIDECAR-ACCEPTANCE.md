# FBP-014B Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `FBP-014B` — final integrated cross-repo evidence run  
**Current Owner:** `Codex2`  
**Assigned Reviewer:** `Codex`  
**Parent Reviewer At Snapshot:** `Claude`  
**Last Revised:** `2026-04-17 (UTC)`  
**Status:** `REVIEW-STAGE SUPPORT ARTIFACT — sidecar now freezes reviewer-ready acceptance framing while parent FBP-014B remains in_progress on the main execution lane.`

---

## 1) Scope Boundary

本 sidecar 只整理 `FBP-014B` 所需的 acceptance checklist、dependency map、evidence inventory、以及 reviewer / owner handoff 指引。

- **In scope:** support-only acceptance framing、upstream evidence anchors、E2E execution prerequisites、reviewer hotspot map。
- **Out of scope:** 修改 L1 canonical truth、改寫主線 evidence 結論、變更 runtime / registry / governance / contracts 實作、或替 parent `FBP-014B` 代做正式 integrated run。

---

## 2) Machine-Truth Snapshot

以 `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl` 與既有 support artifacts 為唯一共同真相：

- Parent `FBP-014B`
  - owner=`Codex2`
  - reviewer=`Claude`
  - status=`in_progress`
  - depends_on=`["FBP-013","FBP-014A"]`
  - artifacts:
    - `docs/04-uat/phase1-uat-scenarios.md`
    - `tests/smoke/`
    - `docs/03-runbooks/phase1-rollout.md`
  - acceptance:
    1. `cross-repo happy path 的最終 evidence 被實際執行與整理`
    2. `no cross-tenant leak、audit consistency、billing consistency evidence 完整`
    3. `repo B cutover 後的 integrated path 可被 reviewer 直接審查`
- Sidecar `FBP-014B-SIDECAR-ACCEPTANCE`
  - owner=`Codex2`
  - reviewer=`Codex`
  - status=`review`
  - helper kind=`acceptance_packet`
  - support artifact path=`support/sidecars/FBP-014B/FBP-014B-SIDECAR-ACCEPTANCE.md`
  - `mutates_canonical=false`

### Shared-Truth Notes That Must Be Preserved

- `FBP-013` is now formally `done` and explicitly unblocks `FBP-014` / `FBP-014B`; the umbrella closeout anchor commit is `4ec423d`.
- `FBP-014A` is `done`; live staging evidence was intentionally deferred from the scaffold into `FBP-014B`.
- `FBP-014B` was auto-reassigned from `Gemini` to `Codex` at `2026-04-17T00:00:49Z` after repeated `Gemini` critical failure, then auto-reassigned again from `Codex` to `Codex2` at `2026-04-17T00:03:38Z` after repeated `Codex` terminal failure during the parent execution lane.
- This sidecar was auto-created, briefly assigned to `Qwen`, then auto-reassigned to `Codex2` at `2026-04-17T00:01:12Z` after repeated `Qwen` auth failure.

### Dependency State at Snapshot

| Dependency | Shared-Truth Status | Why It Matters To `FBP-014B`                                                                     |
| ---------- | ------------------- | ------------------------------------------------------------------------------------------------ |
| `FBP-013`  | `done`              | closes the upstream staging/smoke/UAT evidence family and formally unlocks the integrated run    |
| `FBP-014A` | `done`              | provides the runnable E2E matrix, fixtures, helper library, chain assertions, and dry-run runner |

---

## 3) Parent Acceptance Expansion

以下三條 acceptance criteria 直接沿用 `ai-status.json -> FBP-014B.acceptance`，本 packet 只把它們展開成 reviewer 與 parent owner 都可直接消費的 evidence anchors。

### AC-1: `cross-repo happy path 的最終 evidence 被實際執行與整理`

**Required execution chain**

| Happy-path segment         | Primary anchor                                                     | Expected evidence in parent run                                                           |
| -------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Upstream release baseline  | `support/sidecars/FBP-013/FBP-013-UMBRELLA-CLOSEOUT.md` §6         | parent run states the staging/smoke/UAT family is already closed and now being consumed   |
| Scenario topology          | `docs/04-uat/fbp-014a-e2e-matrix.md` §4.1                          | parent run uses the owned `E2E-001` chain: booking -> dispatch -> driver -> billing/audit |
| Runner entrypoint          | `tests/e2e/run-e2e.sh`                                             | parent run records the exact runnable suite / scenario selection                          |
| Scaffold evidence baseline | `support/sidecars/FBP-014A/FBP-014A-E2E-SCAFFOLD-EVIDENCE-PACK.md` | parent run distinguishes static scaffold proof from new live integrated evidence          |

**PASS condition for parent closeout**

- `FBP-014B` must record an actual execution trace, not only restate the matrix.
- The evidence must preserve the stitched ID chain for the owned happy path: `bookingId -> dispatchJobId -> taskId -> invoiceId`.
- The parent packet should clearly separate inherited static scaffold evidence (`FBP-014A`) from newly collected integrated-run output.

### AC-2: `no cross-tenant leak、audit consistency、billing consistency evidence 完整`

**Required evidence families**

| Evidence family          | Primary anchor                                                   | What parent `FBP-014B` must prove                                                          |
| ------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Cross-tenant safety      | `docs/04-uat/fbp-014a-e2e-matrix.md` §4.4                        | integrated run preserves no-leak posture or explicitly records environment blocker         |
| Audit consistency        | `docs/04-uat/fbp-014a-e2e-matrix.md` §4.1 + `GET /api/audit` leg | audit entries are present for the owned path and reviewable by `Claude`                    |
| Billing consistency      | `docs/04-uat/fbp-014a-e2e-matrix.md` §4.1 + tenant invoice legs  | generated invoice is retrievable and tied back to the run chain                            |
| Rollout evidence posture | `docs/03-runbooks/phase1-rollout.md` "Current Gate Read"         | parent run stays aligned with backend-owned billing/audit truth and rollout HOLD semantics |

**PASS condition for parent closeout**

- Cross-tenant isolation must be explicitly checked or the packet must state why the environment prevented that check.
- Billing evidence must point to concrete invoice retrieval, not only an API 200.
- Audit evidence must point to concrete audit visibility, not a vague statement that audit exists.

### AC-3: `repo B cutover 後的 integrated path 可被 reviewer 直接審查`

**Required reviewer-facing posture**

| Review requirement                                           | Current support anchor                                                | Why it matters                                                                |
| ------------------------------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Tenant entry stays on `tenant-commute-hub` / `/api/tenant/*` | `docs/04-uat/fbp-014a-e2e-matrix.md` §2 G1                            | reviewer must not see retired `apps/tenant-portal-web` reintroduced           |
| Repo B remains pure UI consumer                              | `support/sidecars/FBP-014/FBP-014-SIDECAR-BFF-HANDOFF.md` review note | integrated path must not rely on local authority or repo-B financial truth    |
| Happy path is reviewable end to end                          | `tests/e2e/E2E-001-enterprise-dispatch.sh` + parent evidence output   | reviewer can inspect one coherent path instead of disconnected surface tests  |
| Manual-only gaps stay explicit                               | `docs/04-uat/fbp-014a-e2e-matrix.md` §4.3                             | reviewer can distinguish what is automated, manual-only, skipped, or deferred |

**PASS condition for parent closeout**

- The integrated packet must be readable without reconstructing topology from multiple unrelated docs.
- Any manual-only or environment-gated gap must remain explicit, not silently implied as pass.
- The packet must preserve the post-`FBP-006` BFF boundary and not invent repo-B local authority.

---

## 4) Dependency Map

### Formal Machine Dependencies

| Dependency | Status | Evidence available now | Notes                                                                                           |
| ---------- | ------ | ---------------------- | ----------------------------------------------------------------------------------------------- |
| `FBP-013`  | `done` | Yes                    | umbrella closeout finalized at commit `4ec423d`; integrated run is now formally unblocked       |
| `FBP-014A` | `done` | Yes                    | scaffold closed at commit `ef762e2`; live staging evidence intentionally deferred to `FBP-014B` |

### Informative Upstream Context

| Context                           | Anchor                                                             | Why It Matters                                                                                  |
| --------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `FBP-013` umbrella closeout       | `support/sidecars/FBP-013/FBP-013-UMBRELLA-CLOSEOUT.md`            | confirms staging PASS, smoke static PASS, UAT 45/45 non-deferred P1 PASS, pilot/production HOLD |
| `FBP-014A` matrix                 | `docs/04-uat/fbp-014a-e2e-matrix.md`                               | defines scenario chain, route anchors, fixtures, and guardrails for the integrated run          |
| `FBP-014A` scaffold evidence pack | `support/sidecars/FBP-014A/FBP-014A-E2E-SCAFFOLD-EVIDENCE-PACK.md` | records which static scaffold ACs are already complete                                          |
| Rollout runbook                   | `docs/03-runbooks/phase1-rollout.md`                               | keeps release / pilot / production language aligned with the evidence family                    |
| UAT scenario source               | `docs/04-uat/phase1-uat-scenarios.md`                              | reviewer-facing canonical scenario inventory referenced by the matrix                           |
| E2E runner                        | `tests/e2e/run-e2e.sh`                                             | concrete execution entrypoint for integrated scenarios                                          |

### Downstream Consumers

| Consumer                 | Status | Expected dependency on `FBP-014B`                                                     |
| ------------------------ | ------ | ------------------------------------------------------------------------------------- |
| `FBP-014` umbrella       | `todo` | needs final integrated run folded back into umbrella-level E2E closeout               |
| `FBP-015` roadmap packet | `todo` | remains queued behind `FBP-014`; integrated run outcome informs what remains deferred |

---

## 5) Evidence Inventory For The Parent Run

### Already-Frozen Inputs

| Item                               | Anchor                                                             | Current state                                                             |
| ---------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Upstream execution-family closeout | `support/sidecars/FBP-013/FBP-013-UMBRELLA-CLOSEOUT.md`            | finalized and downstream-consumable                                       |
| E2E scaffold topology              | `docs/04-uat/fbp-014a-e2e-matrix.md`                               | finalized as static scenario matrix                                       |
| E2E scaffold verification          | `support/sidecars/FBP-014A/FBP-014A-E2E-SCAFFOLD-EVIDENCE-PACK.md` | offline verification already recorded                                     |
| E2E runner                         | `tests/e2e/run-e2e.sh`                                             | present and dry-run capable                                               |
| Rollout gate framing               | `docs/03-runbooks/phase1-rollout.md`                               | production still HOLD; integrated evidence does not change that by itself |

### Evidence The Parent Should Add

| Item                                | Expected form                                                  | Why reviewer needs it                           |
| ----------------------------------- | -------------------------------------------------------------- | ----------------------------------------------- |
| Actual command / scenario selection | exact `run-e2e.sh` invocation or equivalent                    | confirms what was run                           |
| Chain outputs                       | `bookingId`, `dispatchJobId`, `taskId`, `invoiceId` continuity | proves the happy path is truly stitched         |
| Billing read-back                   | invoice retrieval evidence                                     | proves billing consistency beyond write success |
| Audit read-back                     | audit query evidence                                           | proves audit visibility on the same chain       |
| Cross-tenant check                  | explicit pass / fail / gated note                              | proves no-leak claim is reviewable              |
| Environment caveats                 | skip / manual-only / async notes                               | keeps reviewer-facing truth honest              |

### Evidence That Must Not Be Misclassified

| Misclassification risk                                      | Correct treatment                                                                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `FBP-014A` dry-run / `bash -n` verification                 | static scaffold evidence only, not live integrated proof                                                                  |
| `FBP-013` staging/smoke/UAT closure                         | upstream prerequisite only, not a substitute for `FBP-014B` run output                                                    |
| `E2E-003` phone booking / compliance export                 | manual-only and environment-gated, not part of the automated integrated proof unless parent explicitly adds live evidence |
| Graceful skip behavior in `E2E-001` / `E2E-002` / `E2E-004` | environment caveat, not automatic evidence of semantic correctness                                                        |

---

## 6) Reviewer Hotspots For `Codex`

`Codex` reviewing this sidecar should focus on whether the packet is useful for the parent execution lane, not on re-running the parent itself from this helper.

1. Confirm the dependency map stays aligned with machine truth: `FBP-014B.depends_on` remains exactly `["FBP-013","FBP-014A"]`.
2. Confirm the packet correctly treats `FBP-013` as formally closed and `FBP-014A` as static scaffold baseline only.
3. Confirm AC-1 requires a real stitched evidence chain and does not allow dry-run scaffold proof to masquerade as integrated evidence.
4. Confirm AC-2 explicitly calls out the three reviewer-sensitive evidence families: cross-tenant isolation, audit consistency, and billing consistency.
5. Confirm AC-3 preserves the `tenant-commute-hub` / repo-B boundary and keeps manual-only gaps explicit.

### Suggested Parent Pull List

When `Codex` continues `FBP-014B`, the highest-yield inputs to absorb first are:

1. `support/sidecars/FBP-013/FBP-013-UMBRELLA-CLOSEOUT.md` §§4-6.
2. `docs/04-uat/fbp-014a-e2e-matrix.md` §§2-4 and §6.
3. `support/sidecars/FBP-014A/FBP-014A-E2E-SCAFFOLD-EVIDENCE-PACK.md` §§2-4 and §8.
4. `docs/03-runbooks/phase1-rollout.md` "Current Gate Read" plus Pack 2-4 evidence expectations.

---

## 7) Sidecar Acceptance Checklist

### AC-S1 — Support artifact only

- [x] Output limited to `support/sidecars/FBP-014B/FBP-014B-SIDECAR-ACCEPTANCE.md`
- [x] No canonical truth files changed
- [x] No runtime / registry / governance / contract implementation changed

### AC-S2 — Shared-truth aligned dependency map

- [x] Parent acceptance copied directly from `ai-status.json`
- [x] Parent formal dependencies kept as `FBP-013`, `FBP-014A`
- [x] Parent / sidecar ownership churn preserved exactly as recorded in `ai-activity-log.jsonl`
- [x] `FBP-013` and `FBP-014A` are treated as frozen prerequisite evidence, not as substitute outputs for the parent run

### AC-S3 — Reviewer handoff ready

- [x] `Codex` reviewer hotspots are explicit
- [x] Evidence inventory points to concrete upstream anchors and parent-output expectations
- [x] Owner / reviewer / closeout commands are included

---

## 8) Handoff Commands

### Owner -> Reviewer (`Codex2` -> `Codex`)

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py handoff FBP-014B-SIDECAR-ACCEPTANCE Codex "FBP-014B acceptance packet ready in support/sidecars/FBP-014B/FBP-014B-SIDECAR-ACCEPTANCE.md. It freezes the machine-truth deps on FBP-013 and FBP-014A, maps the integrated-run acceptance criteria to the FBP-013 umbrella, FBP-014A E2E matrix/scaffold, and rollout runbook, and makes the required reviewer-facing outputs explicit: stitched ID chain, billing read-back, audit evidence, and cross-tenant check. Support artifact only; no canonical truth changes."
```

### Reviewer Approve (`Codex`)

```bash
AI_NAME=Codex python3 scripts/ai_status.py approve FBP-014B-SIDECAR-ACCEPTANCE "FBP-014B acceptance packet approved: dependency mapping stays aligned with shared truth, upstream FBP-013/014A evidence is correctly framed as prerequisite-only, and the packet gives a reviewer-usable checklist for the integrated cross-repo evidence run."
```

### Reviewer Reopen (`Codex`)

```bash
AI_NAME=Codex python3 scripts/ai_status.py reopen FBP-014B-SIDECAR-ACCEPTANCE "Please correct the FBP-014B sidecar packet: <describe mismatch in dependency map, evidence classification, or reviewer guidance>."
```

### Owner Closeout (`Codex2`, after approval)

```bash
NO_COMMIT_REQUIRED=1 AI_NAME=Codex2 python3 scripts/ai_status.py done FBP-014B-SIDECAR-ACCEPTANCE "Owner finalized approved sidecar; FBP-014B acceptance packet is ready in support/sidecars/FBP-014B/ for the parent execution lane to absorb while preserving canonical truth."
```

---

## 9) Operator Notes

1. This packet is intentionally narrow: it accelerates `FBP-014B` reviewability but does not perform the integrated run itself.
2. `FBP-013` is already the frozen upstream evidence family closeout; `FBP-014B` should consume it, not restate it as new output.
3. `FBP-014A` already proved the scaffold is runnable offline; `FBP-014B` still needs real integrated evidence collection.
4. If the parent run discovers a contract or authority contradiction, that should reopen the relevant implementation/evidence task directly rather than being patched in this support packet.
