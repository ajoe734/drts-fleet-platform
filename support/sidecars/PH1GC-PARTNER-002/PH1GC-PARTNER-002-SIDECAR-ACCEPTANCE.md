# PH1GC-PARTNER-002 - Acceptance Packet & Dependency Map

**Helper task (dispatch-only):** `PH1GC-PARTNER-002-SIDECAR-ACCEPTANCE`
**Dispatch owner:** `Codex`
**Dispatch reviewer / target agent:** `Codex2`
**Parent task:** `PH1GC-PARTNER-002` - issuer sandbox eligibility evidence
**Canonical parent owner:** `Codex`
**Canonical parent reviewer:** `Codex2`
**Prepared:** `2026-05-23T19:13:12Z`
**Reviewed / refreshed:** `2026-05-23`
**Scope:** sidecar support artifact only. This file does not change canonical product truth, runtime behavior, or matrix rows.

Authority note: use the embedded dispatch brief for the helper assignment, use `$AI_STATUS_ROOT/ai-status.json` for canonical task ownership/lifecycle, and use `origin/dev` product docs for acceptance semantics. If those sources drift, record the drift explicitly; do not average them.

## 0. What this packet is for

- Expand `PH1GC-PARTNER-002` into a reviewer-usable acceptance checklist.
- Map the upstream and downstream dependencies that control honest closeout.
- Freeze the current observable baseline so the parent task is not closed from stale machine-truth assumptions.

## 1. Baseline checked on 2026-05-23

### 1.1 Canonical machine truth (`$AI_STATUS_ROOT/ai-status.json`)

| Item | Observed state |
| --- | --- |
| `PH1GC-PARTNER-001` | `done`; owner `Codex2`; reviewer `Codex`; last update `2026-05-23T14:02:27Z` |
| `PH1GC-PARTNER-002` | `blocked`; owner `Codex`; reviewer `Codex2`; last update `2026-05-22T06:38:54Z`; waiting on external issuer / bank sandbox credentials and allowed test cards |
| `PH1GC-PARTNER-002-SIDECAR-ACCEPTANCE` | Not present as a canonical task in `ai-status.json`; this packet is being handled from the dispatch brief and support branch history instead |
| `PARTNER-ELIG-LIVE-001` | No canonical task id observed in `ai-status.json`; only the sidecar path name is referenced by product docs and prior support artifacts |

### 1.2 Observed `origin/dev` and repo facts

- `docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md` exists on `origin/dev` and names `WF-PARTNER-001` with "formerly `WF-PRT-001`; renamed per directive §3.2 - no alias".
- That same spec points `PH1GC-PARTNER-002` at `support/sidecars/PARTNER-ELIG-LIVE-001/`.
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` on `origin/dev` still exposes `WF-PRT-001` and `PASS (static evidence)`, while separately defining the stronger `PASS (sandbox evidence)` classification.
- `support/sidecars/PARTNER-ELIG-LIVE-001/` is not present on `origin/dev`.
- `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md` exists and defines `EXT-001-BLK-001` through `EXT-001-BLK-006`.
- `docs/03-runbooks/partner-eligibility-manual-review-runbook.md` says `manual_review` is a hold requiring operator evidence, not automatic approval.

### 1.3 Drift the parent owner must account for

- The dispatch brief described this helper as an owner/reviewer workflow, but canonical machine truth currently tracks only the parent task `PH1GC-PARTNER-002`, and that parent is `blocked`, not `in_progress`.
- This means the packet must not claim that a canonical helper task is awaiting approval or closeout unless `ai-status.json` is updated to include it.
- `PH1GC-PARTNER-001` is `done` in machine truth and its spec is visible on `origin/dev`, but the matrix rename promised by `PH1GC-MATRIX-001` is not observable from this worker: `origin/dev` still shows `WF-PRT-001`.
- `support/sidecars/PARTNER-ELIG-LIVE-001/` is still absent from `origin/dev`, so `PH1GC-PARTNER-002` cannot be reviewed from repo-visible evidence yet.
- Therefore `PH1GC-PARTNER-002` must be reviewed against actual `origin/dev` evidence and current blocker state, not task-status labels copied from an earlier support branch snapshot.

## 2. Parent acceptance checklist

`PH1GC-PARTNER-002` is ready for `done` only when every item below is true and reproducible from the branch and the merged `origin/dev` result.

### 2.1 Delivery and path discipline

- [ ] `support/sidecars/PARTNER-ELIG-LIVE-001/` exists as a tracked path on the task branch and on `origin/dev`.
- [ ] The sidecar contains a primary evidence document plus any redacted logs, screenshots, or attachments needed to reproduce the claim.
- [ ] The task stays support-only: no canonical L1/L2 docs, runtime code, or matrix rows are treated as implicitly updated by this evidence task.
- [ ] If `origin/dev` still shows `WF-PRT-001`, the parent closeout says so explicitly instead of pretending the rename already landed everywhere.

### 2.2 Directive `PARTNER-002` evidence families

The directive names seven evidence families. The landed partner spec on `origin/dev` expands them into more granular proof points, but all seven families still need to be present.

| Directive family | Concrete proof the reviewer should expect |
| --- | --- |
| Issuer sandbox credential reference | Named issuer/bank counterparty plus masked credential-source reference. |
| Allowed test cards / reference tokens | Issuer-approved fixture list or reference-token set; raw PAN and unmasked tokens never appear. |
| Eligible / ineligible / `manual_review` proof | At least one successful sandbox verification for each outcome, with verification IDs and timestamps. |
| Timeout / retry proof | Evidence of timeout behavior, retry count/backoff, and final terminal result for the sandbox flow actually exercised. |
| Booking linkage | `eligibilityVerificationId`, `entrySlug`, and masked partner-verification fields are visible in the downstream booking record. |
| Billing / reporting proof | Invoice/report artifacts carry the partner linkage fields expected by the partner spec. |
| Audit proof | Audit rows exist for issuer attempt(s) and terminal/manual-review transitions. |

Refinement from the landed partner spec:

- The spec treats the counterparty name, credential-source declaration, the three outcome classes, booking linkage, billing/reporting linkage, and audit linkage as separate proof points under the same `PARTNER-002` evidence set.
- Use that finer breakdown when assembling the sidecar, but do not drop any of the seven directive families.

### 2.3 Contract, masking, and negative-path guardrails

- [ ] Evidence follows `docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md` for `entrySlug`, `WF-PARTNER-001` naming, `cardLast4`, masked `referenceToken`, booking linkage, billing/reporting linkage, and audit linkage.
- [ ] `manual_review` evidence is consistent with `docs/03-runbooks/partner-eligibility-manual-review-runbook.md`: held for operator review, not auto-approved.
- [ ] The evidence pack covers the required negative-path set from the partner spec: `NP-PARTNER-001`, `NP-PARTNER-002`, `NP-PARTNER-003`, and `NP-PARTNER-007`, or clearly mapped equivalent sandbox traces.
- [ ] Any timeout/retry numbers shown in evidence are cited as issuer-approved observed behavior; do not invent a policy just to reconcile stale docs.

### 2.4 Non-claim and blocked-external rule

- [ ] If `EXT-001-BLK-001` through `EXT-001-BLK-006` are still open, `PH1GC-PARTNER-002` remains `in_progress` or `blocked`; it does not go to `done`.
- [ ] Repo-local mocks, fabricated card numbers, or screenshot-only claims are insufficient for closeout.
- [ ] Sandbox evidence is not described as live production issuer activation.
- [ ] If the matrix row is still `WF-PRT-001 = PASS (static evidence)` on `origin/dev`, the closeout treats the evidence sidecar as ready input for a downstream gate update, not as proof that the gate update already landed.
- [ ] Do not treat a legacy support branch or stale task-status snapshot as a substitute for repo-visible evidence.

### 2.5 Required closeout shape for the parent task

Directive §7 requires the closeout to use this shape:

```text
Task ID: PH1GC-PARTNER-002
Owner: Codex
Reviewer: Codex2
Branch: <task branch>
PR: <url or number>
Commit: <hash> - <subject>
Files changed:
  - support/sidecars/PARTNER-ELIG-LIVE-001/<files>
Verification commands:
  - git ls-tree -r --name-only origin/dev -- support/sidecars/PARTNER-ELIG-LIVE-001
  - git grep -n 'WF-PRT-001\|WF-PARTNER-001\|PARTNER-ELIG-LIVE-001' origin/dev -- docs/03-runbooks/phase1-workflow-acceptance-release-gates.md
  - git show origin/dev:docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md | grep -n 'WF-PARTNER-001\|PARTNER-ELIG-LIVE-001\|manual_review\|cardLast4\|referenceToken'
  - git grep -n 'EXT-001-BLK-00[1-6]' origin/dev -- support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md
Evidence artifact: support/sidecars/PARTNER-ELIG-LIVE-001/<primary evidence file>
Workflow family affected: WF-PARTNER-001
Gate read before: WF-PRT-001 = PASS (static evidence)
Gate read after: <quote the actual merged state; do not speculate>
Remaining non-claim: <enumerate exact unstated claims, if any>
External dependencies, if any: <enumerate exact EXT-001 blockers or say none>
```

## 3. Dependency map

### 3.1 Upstream and adjacent dependencies

| Dependency | Type | Current observed state | Why it matters |
| --- | --- | --- | --- |
| `PH1GC-PARTNER-001` | Repo task | `done` in machine truth; spec visible on `origin/dev` | Defines `WF-PARTNER-001`, `entrySlug`, masking, manual-review, and the `PH1GC-PARTNER-002` evidence path. |
| `PH1GC-MATRIX-001` | Adjacent repo task | Reported `done` in prior support materials; rename not yet visible on `origin/dev` from this worker | Owns the matrix row change from `WF-PRT-001` to `WF-PARTNER-001`; the evidence sidecar must not over-claim that delivery. |
| `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md` | Repo artifact | Visible on `origin/dev` | Defines the external blocker set `EXT-001-BLK-001..006` for contract authority, sandbox credentials, fixtures, timeout/retry confirmation, manual-review sign-off, and sensitive-data approval. |
| `docs/03-runbooks/partner-eligibility-manual-review-runbook.md` | Repo artifact | Visible on `origin/dev` | Owns the operator semantics for `manual_review`; evidence must support it, not replace it. |
| Issuer sandbox credentials and fixtures | External, human-gated | Unresolved; also named in the parent task `next` field | Required for credential reference, allowed test instruments, and outcome coverage. |
| Billing/reporting/audit linkage surfaces | Downstream functional consumers | Must be demonstrated in evidence | Acceptance requires proof that partner verification survives beyond the booking screen. |

### 3.2 Drift and legacy edges

| Edge | Why it matters |
| --- | --- |
| The support-branch packet history claimed `PH1GC-PARTNER-002-SIDECAR-ACCEPTANCE` was `in_progress`, but canonical `ai-status.json` currently has no such task row. | Reviewer closeout must not use helper-task lifecycle claims that are absent from machine truth. |
| Canonical machine truth currently marks `PH1GC-PARTNER-002` as `blocked`, not `in_progress`. | The parent cannot be described as review-ready until the external issuer inputs are actually attached and the blocker is cleared. |
| `support/sidecars/PARTNER-ELIG-LIVE-001/` is absent from `origin/dev`. | Parent review must verify repo-visible artifacts instead of trusting prior support packets. |
| `origin/dev` still shows `WF-PRT-001 = PASS (static evidence)`. | Parent closeout must distinguish "evidence assembled" from "matrix/gate uplift merged". |

### 3.3 No-touch boundaries

- `support/sidecars/EXT-001/` is the blocker packet, not the new evidence pack. Do not overwrite or rename it.
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` belongs to the matrix slice; do not silently treat an evidence-only sidecar as if it already updated the matrix.
- `docs/03-runbooks/partner-eligibility-manual-review-runbook.md` remains the fallback runbook; the new evidence pack should support it, not replace it.

## 4. Recommended owner work order

1. Validate current truth from `$AI_STATUS_ROOT/ai-status.json` and `origin/dev`, not from worktree-local snapshots or older support-branch packets.
2. Assemble or refresh `support/sidecars/PARTNER-ELIG-LIVE-001/` so all seven directive families and the spec-level refinements are covered.
3. If any `EXT-001-BLK-*` input is still missing, record `progress` or `blocker` instead of closing the task.
4. Hand off to review only after the artifact path and verification commands are reproducible from the branch.

## 5. Helper review bar

- [x] File lives only under `support/sidecars/PH1GC-PARTNER-002/`.
- [x] No canonical L1/L2 product truth was edited.
- [x] The packet now distinguishes dispatch-only helper metadata from canonical `ai-status.json` task state.
- [x] Parent owner/reviewer and live parent status are recorded from canonical machine truth as observed on `2026-05-23`.
- [x] The seven directive evidence families are expanded into a concrete reviewer checklist and tied to the landed partner spec refinement.
- [x] Dependency mapping names `PH1GC-PARTNER-001`, `PH1GC-MATRIX-001`, `EXT-001`, the manual-review runbook, and the external issuer inputs.
- [x] Repo-vs-machine-truth drift is called out so the parent task cannot over-claim from stale status alone.
