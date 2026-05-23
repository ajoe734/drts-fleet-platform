# PH1GC-PARTNER-002 - Acceptance Packet & Dependency Map

**Helper task:** `PH1GC-PARTNER-002-SIDECAR-ACCEPTANCE`
**Helper owner:** `Codex`
**Helper reviewer:** `Claude`
**Parent task:** `PH1GC-PARTNER-002` - issuer sandbox eligibility evidence
**Parent owner:** `Codex2`
**Parent reviewer:** `Codex`
**Prepared:** `2026-05-23T19:41:46Z`
**Scope:** support-only sidecar artifact. This file does not change canonical product truth, runtime behavior, matrix rows, or external-gate status.

Authority rule:

- Use `$AI_STATUS_ROOT/ai-status.json` for task ownership and lifecycle.
- Use `origin/dev` `docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md` for `WF-PARTNER-001` acceptance semantics.
- When older repo documents disagree with that partner spec, record the drift explicitly; do not average the semantics.

## 1. Machine-truth snapshot

### 1.1 Task state checked on 2026-05-23

| Item | Observed state |
| --- | --- |
| `PH1GC-PARTNER-001` | `done`; owner `Codex2`; reviewer `Codex` |
| `PH1GC-PARTNER-002` | `blocked`; owner `Codex2`; reviewer `Codex`; `waiting_for=Codex` |
| `PH1GC-PARTNER-002-SIDECAR-ACCEPTANCE` | `in_progress`; owner `Codex`; reviewer `Claude` |

### 1.2 Parent-task baseline the reviewer must keep in view

- `ai-status.json` says `PH1GC-PARTNER-002` is blocked because `EXT-001-BLK-001` through `EXT-001-BLK-006` remain open and `WF-PARTNER-001` cannot move to `PASS (sandbox evidence)` yet.
- The same machine truth notes that branch `codex2/ph1gc-partner-002` already carries a hold-state sidecar update at commit `9907094c`, but `origin/dev` still does not expose `support/sidecars/PARTNER-ELIG-LIVE-001/` from this worker.
- This helper packet is therefore a reviewer aid only. It must not be read as evidence that the parent task or gate update is complete.

## 2. Reopen reason and semantic precedence

The previous helper packet mixed two incompatible retry models. That was the reopen reason.

| Source | Observed statement | How this packet treats it |
| --- | --- | --- |
| `origin/dev` `partner-eligibility-airport-transfer-spec-20260519.md` §4.3 | Default issuer timeout `8 seconds` per request; `2` retries; exponential backoff `1s`, `3s`; exhaustion -> terminal `ineligible` with reason `issuer_unreachable`. | Canonical acceptance semantics. |
| Same partner spec §7 `NP-PARTNER-002` | Timeout across retry budget -> terminal `ineligible`; booking refused. | Canonical negative-path expectation. |
| `docs/02-architecture/phase1-issuer-eligibility-integration-contract-20260429.md` | `3000ms`, `3` attempts, backoff `250ms` x `2`, cap `1000ms`, exhaustion -> `manual_review`. | Legacy drift. Useful for historical blocker context, not for `WF-PARTNER-001` acceptance truth. |
| `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md` | `EXT-001-BLK-004` and the timeout section still cite `3000ms` / `3` attempts / `manual_review`. | External dependency source only. Do not reuse these values in the acceptance checklist. |
| `docs/03-runbooks/partner-eligibility-manual-review-runbook.md` | Retry exhaustion is routed into `manual_review` queue semantics. | Operational drift. Keep its "manual review is a hold, not approval" rule, but do not let it override `NP-PARTNER-002`. |

Reviewer instruction:

- If a support packet, evidence note, or closeout text cites `3000ms`, `3` attempts, or exhaustion -> `manual_review` as the current `WF-PARTNER-001` truth, treat that as stale wording.
- For this helper packet, `§5.1 row 4` and `§5.2 NP-PARTNER-002` intentionally align to the partner spec's `8s / 2 retries / 1s,3s / exhaustion -> ineligible`.

## 3. Dependency map

### 3.1 Upstream and adjacent dependencies

| Dependency | Type | Current observed state | Why it matters |
| --- | --- | --- | --- |
| `PH1GC-PARTNER-001` | Canonical repo task | `done`; partner spec is visible on `origin/dev` | Defines `WF-PARTNER-001`, `entrySlug`, masking, linkage fields, negative paths, and the `PARTNER-ELIG-LIVE-001` evidence path. |
| `PH1GC-PARTNER-002` | Parent repo task | `blocked`; branch-local hold-state sidecar exists at `9907094c` | Owns the actual issuer sandbox evidence pack and the honest blocked-vs-done claim. |
| `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md` | External-gate packet | Present on `origin/dev`; six blockers still open | Names the missing issuer authority, credentials, fixtures, timeout confirmation, business sign-off, and sensitive-data approval inputs. |
| `docs/02-architecture/phase1-issuer-eligibility-integration-contract-20260429.md` | Older contract baseline | Present on `origin/dev`; retry semantics are now stale | Still useful for contract-field names such as `retryPolicy`, `manualFallbackPolicy`, and `sensitiveDataPolicy`, but not for current timeout truth. |
| `docs/03-runbooks/partner-eligibility-manual-review-runbook.md` | Operator runbook | Present on `origin/dev`; queue semantics partially drift | Still authoritative that `manual_review` is a hold requiring operator action, not silent approval. |
| `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` and `PH1GC-MATRIX-001` | Adjacent matrix dependency | `origin/dev` still exposes `WF-PRT-001 = PASS (static evidence)` from this worker | The evidence sidecar must not over-claim a matrix or gate uplift that is not yet merged. |
| Issuer / bank external inputs | External, human-gated | Missing | Without them, no real sandbox proof can be attached and the parent task remains blocked. |

### 3.2 No-touch boundaries

- Do not edit canonical product docs, runtime code, or matrix rows from this helper task.
- Do not rewrite `EXT-001` to hide the drift; just call it out.
- Do not claim that `support/sidecars/PARTNER-ELIG-LIVE-001/` is merged to `origin/dev` unless the reviewer rechecks the merged state directly.

## 4. Parent closeout constraints

`PH1GC-PARTNER-002` is not honestly ready for `done` unless all of the following become true:

- `support/sidecars/PARTNER-ELIG-LIVE-001/` is tracked on the task branch and merged `origin/dev`.
- The evidence pack contains real issuer sandbox proof for the required outcome and linkage families.
- Any remaining `EXT-001-BLK-*` inputs are either attached or explicitly keep the task in `blocked`.
- The closeout language distinguishes repo-visible evidence, branch-only evidence, and matrix/gate uplift.

If those conditions are still false, the honest state remains `blocked` or `review` of a blocked-state packet, not `done`.

## 5. Acceptance packet

### 5.1 Canonical acceptance checkpoints

| # | Checkpoint | Reviewer should verify |
| --- | --- | --- |
| 1 | Evidence path and branch visibility | `support/sidecars/PARTNER-ELIG-LIVE-001/` exists on the parent task branch, and the closeout says whether `origin/dev` already contains it or not. |
| 2 | Directive evidence families are complete | The pack covers the directive families for credential reference, allowed fixtures, `eligible`, `ineligible`, `manual_review`, timeout/retry, booking linkage, billing/reporting linkage, and audit proof. |
| 3 | Sensitive-data and linkage rules follow the partner spec | No raw PAN; only `cardLast4`; `referenceToken` stays masked; `referenceHash` is used for joins; `eligibilityVerificationId` propagates into booking, invoice/report, and audit evidence. |
| 4 | Timeout/retry semantics match the canonical partner spec | Default issuer timeout is `8 seconds` per request, retry budget is `2` retries, backoff is `1s` then `3s`, and exhaustion ends in terminal `ineligible` with reason `issuer_unreachable`. Any `3000ms` / `3` attempt / `manual_review` wording is drift, not acceptance truth. |
| 5 | `manual_review` is treated as a hold, not as a retry-exhaustion synonym | `manual_review` evidence must show operator hold/release semantics. If timeout exhaustion proof is supplied, it should be checked against `NP-PARTNER-002` as `ineligible`, not silently remapped to `manual_review`. |
| 6 | Gate and non-claim language stays honest | If `EXT-001-BLK-001` through `EXT-001-BLK-006` remain open, the parent task stays blocked and the gate read cannot be promoted to `PASS (sandbox evidence)`. |

### 5.2 Required negative-path acceptance map

| ID | Scenario | Expected outcome | Reviewer evidence expectation |
| --- | --- | --- | --- |
| `NP-PARTNER-001` | Eligibility verification returns `ineligible` | Booking refused with issuer reason code; no driver dispatch | Sandbox trace shows issuer denial and refused booking path. |
| `NP-PARTNER-002` | Eligibility verification times out across retry budget | Terminal `ineligible` with reason `issuer_unreachable`; booking refused | Evidence or closeout wording must not convert this case into `manual_review`. |
| `NP-PARTNER-003` | `manual_review` held longer than tenant SLA | Queue surfaces overdue item; no auto-eligibility flip | Reviewer sees hold-state proof and no silent approval path. |
| `NP-PARTNER-007` | Reporting export includes a `manual_review`-then-rejected booking | Export row reflects refused state; subsidy not applied | Evidence demonstrates downstream reporting truth rather than UI-only status. |

### 5.3 Reviewer handoff checklist

- [ ] Helper metadata matches machine truth: owner `Codex`, reviewer `Claude`.
- [ ] Parent metadata matches machine truth: owner `Codex2`, reviewer `Codex`, status `blocked`.
- [ ] `§5.1 row 4` and `§5.2 NP-PARTNER-002` both use the canonical `8s / 2 retries / 1s,3s / exhaustion -> ineligible` semantics.
- [ ] Legacy `3000ms` / `3` attempt / `manual_review` wording is preserved only as drift context, never as acceptance criteria.
- [ ] This helper packet remains support-only and does not claim canonical or runtime edits.

## 6. Suggested parent handoff language

Use language shaped like this when the parent owner hands off or reports status:

```text
PH1GC-PARTNER-002 remains blocked on EXT-001-BLK-001 through EXT-001-BLK-006.
The sidecar path and blocked-state evidence packet are prepared on the task branch,
but merged origin/dev still needs repo-visible PARTNER-ELIG-LIVE-001 evidence before
WF-PARTNER-001 can claim PASS (sandbox evidence). Acceptance semantics follow
partner-eligibility-airport-transfer-spec-20260519.md §4.3 and §7:
timeout exhaustion is terminal ineligible (issuer_unreachable), not manual_review.
```
