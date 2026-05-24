# PH1GC-PARTNER-002 - Acceptance Packet & Dependency Map

**Helper task:** `PH1GC-PARTNER-002-SIDECAR-ACCEPTANCE`
**Helper owner / reviewer:** `Gemini2` / `Codex`
**Helper status snapshot:** `review`
**Parent task:** `PH1GC-PARTNER-002`
**Parent owner / reviewer:** `Codex` / `Codex2`
**Parent status snapshot:** `blocked`
**Checked at:** `2026-05-24T15:26:25Z`
**Scope:** support-only sidecar artifact. This file does not change canonical truth, runtime behavior, workflow matrix rows, or external-gate status.

Authority rule:

- Use `$AI_STATUS_ROOT/ai-status.json` for task ownership, lifecycle, and current blocker wording.
- Use `origin/dev:docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md` for `WF-PARTNER-001` acceptance semantics.
- Use `origin/dev:docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md` for the seven directive `PARTNER-002` evidence items and output path.
- Use `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md` only for the open external blocker set. If it disagrees with the partner spec on timeout/retry exhaustion semantics, record the drift explicitly and do not average the two.

## 1. Machine-truth snapshot

### 1.1 Task-state check

| Item | Observed state |
| --- | --- |
| `PH1GC-PARTNER-001` | `done`; owner `Codex`; reviewer `Gemini2`; commit `68b13f1b` landed the canonical partner spec on `origin/dev`. |
| `PH1GC-PARTNER-002` | `blocked`; owner `Codex`; reviewer `Codex2`; `waiting_for=Codex`; `next` says the parent remains externally blocked even though `origin/codex/ph1gc-partner-002@b34dfa78` already carries `support/sidecars/PARTNER-ELIG-LIVE-001/` plus `PH1GC-PARTNER-002-CLOSEOUT-20260522.md`. |
| `PH1GC-PARTNER-002-SIDECAR-ACCEPTANCE` | `review`; owner `Gemini2`; reviewer `Codex`; latest handoff message is `Acceptance packet updated and anchored.` at `2026-05-24T15:20:38Z`. |

### 1.2 Parent evidence visibility

- `origin/dev` still does **not** contain `support/sidecars/PARTNER-ELIG-LIVE-001/`.
- `origin/codex/ph1gc-partner-002@b34dfa78` **does** contain:
  - `support/sidecars/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-EVIDENCE.md`
  - `support/sidecars/PARTNER-ELIG-LIVE-001/PH1GC-PARTNER-002-CLOSEOUT-20260522.md`
- This helper packet is therefore a review aid only. It must not be read as proof that the parent task or `WF-PARTNER-001` already advanced on `origin/dev`.

## 2. Dependency map

### 2.1 Upstream and adjacent dependencies

| Dependency | Type | Current observed state | Why it matters |
| --- | --- | --- | --- |
| `PH1GC-PARTNER-001` | Canonical repo task | `done` on `origin/dev` via `68b13f1b` | Defines `WF-PARTNER-001`, masking rules, linkage fields, timeout semantics, and the negative-path minimum set. |
| `PH1GC-PARTNER-002` | Parent repo task | `blocked`; reviewer `Codex2`; `waiting_for=Codex` | Owns the real issuer sandbox evidence bundle and the honest blocked-vs-done claim. |
| `support/sidecars/PARTNER-ELIG-LIVE-001/` | Parent evidence path | Present on `origin/codex/ph1gc-partner-002`, absent on `origin/dev` | Confirms the parent already has a branch-local blocked-state evidence packet, but merged repo truth still lacks the sidecar path. |
| `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md` | External-gate packet | Present; `EXT-001-BLK-001` through `EXT-001-BLK-006` remain open | Names the issuer/bank inputs still missing before sandbox proof can be attached honestly. |
| Issuer / bank sandbox inputs | External, human-gated | Missing | Without them, the parent cannot produce real credential, fixture, outcome, timeout, linkage, or audit evidence. |

### 2.2 No-touch boundaries

- Do not edit canonical product docs, runtime code, or workflow/gate matrix rows from this helper task.
- Do not claim that `origin/dev` already contains sandbox evidence when it does not.
- Do not overwrite `EXT-001` blocker language to hide semantic drift; call the drift out and keep the parent blocked.

## 3. Semantic precedence and drift

The prior helper revision failed because it preserved stale machine-truth metadata. A second risk remains: mixing old timeout fallback semantics back into the acceptance checklist.

| Source | Observed statement | How this packet treats it |
| --- | --- | --- |
| `origin/dev` partner spec §4.1-4.3, §7 | Terminal states are `eligible`, `ineligible`, `manual_review`; timeout is retried, then after exhaustion becomes terminal `ineligible` with `issuer_unreachable`; default timeout is `8 seconds` per request with `2` retries and backoff `1s`, `3s`. | Canonical acceptance semantics. |
| `origin/dev` implementation spec `PARTNER-002` | Output path is `support/sidecars/PARTNER-ELIG-LIVE-001/` and the deliverable has exactly seven evidence families. | Canonical evidence checklist for the parent task. |
| `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md` | Blocker `EXT-001-BLK-004` still cites `3000ms`, `3` attempts, and repo-local fallback behavior ending in `manual_review`. | External blocker context only. Useful for explaining what the issuer still needs to confirm, but not valid current acceptance truth for `WF-PARTNER-001`. |

Reviewer rule:

- If any sidecar, closeout text, or checklist uses `3000ms`, `3` attempts, or retry exhaustion -> `manual_review` as current `WF-PARTNER-001` truth, treat it as stale wording.
- For this packet, the acceptance baseline is `8 seconds / 2 retries / 1s,3s / exhaustion -> ineligible (issuer_unreachable)`.

## 4. Acceptance checklist for this helper packet

- [x] Helper metadata matches current machine truth: owner `Gemini2`, reviewer `Codex`, status `review`.
- [x] Parent metadata matches current machine truth: owner `Codex`, reviewer `Codex2`, status `blocked`, `waiting_for=Codex`.
- [x] This artifact stays support-only and does not edit canonical truth or claim workflow gate promotion.
- [x] The packet states the true visibility split: `origin/dev` lacks `PARTNER-ELIG-LIVE-001`, while `origin/codex/ph1gc-partner-002@b34dfa78` already carries the blocked-state sidecar.
- [x] The seven directive `PARTNER-002` evidence families are mapped below without inventing substitute evidence.
- [x] Timeout/retry acceptance semantics follow the canonical partner spec, not the older `EXT-001` fallback wording.
- [x] The minimum negative-path set remains `NP-PARTNER-001`, `NP-PARTNER-002`, `NP-PARTNER-003`, and `NP-PARTNER-007`.
- [x] The packet keeps the parent honestly blocked on `EXT-001-BLK-001..006` instead of implying sandbox completion.

## 5. Parent acceptance map

### 5.1 Directive `PARTNER-002` evidence families

| # | Evidence family | What the parent must eventually attach | External blocker dependency |
| --- | --- | --- | --- |
| 1 | Issuer sandbox credential reference | Redacted credential reference, secret path, and allowlist linkage for the real sandbox. | `EXT-001-BLK-002` |
| 2 | Allowed test cards / reference tokens | Issuer-approved fixture matrix covering the required partner verification outcomes. | `EXT-001-BLK-003` |
| 3 | `eligible` / `ineligible` / `manual_review` proof | Real sandbox transcripts or screenshots for each required terminal outcome. | `EXT-001-BLK-002`, `EXT-001-BLK-003`, `EXT-001-BLK-005` |
| 4 | Timeout / retry proof | Issuer-confirmed run proving the current canonical timeout budget and exhaustion behavior. | `EXT-001-BLK-003`, `EXT-001-BLK-004` |
| 5 | Booking linkage | Real booking evidence showing `eligibilityVerificationId` propagation from verification to booking record. | `EXT-001-BLK-002`, `EXT-001-BLK-003` |
| 6 | Billing / reporting proof | Invoice and reporting evidence showing `partnerProgramCode`, `eligibilityVerificationId`, and `referenceHash` propagation. | `EXT-001-BLK-002`, `EXT-001-BLK-003`, `EXT-001-BLK-006` |
| 7 | Audit proof | Audit rows keyed by the same verification lifecycle with masked reference handling. | `EXT-001-BLK-002`, `EXT-001-BLK-003`, `EXT-001-BLK-006` |

### 5.2 Required negative-path minimum

| ID | Scenario | Expected outcome |
| --- | --- | --- |
| `NP-PARTNER-001` | Eligibility verification returns `ineligible` | Booking refused with issuer reason code; no driver dispatch. |
| `NP-PARTNER-002` | Eligibility verification times out across retry budget | Terminal `ineligible` with reason `issuer_unreachable`; booking refused. |
| `NP-PARTNER-003` | `manual_review` held longer than tenant SLA | Operator queue surfaces overdue item; no auto-eligibility flip. |
| `NP-PARTNER-007` | Reporting export includes a `manual_review`-then-rejected booking | Export row reflects refused state; subsidy not applied. |

### 5.3 Field and linkage invariants the reviewer should keep in view

- Only `cardLast4` may be stored or returned; full PAN, expiry, and CVV must never enter platform storage.
- `referenceToken` is stored only in masked form; downstream joins use `referenceHash`, not the unmasked token.
- `eligibilityVerificationId` must propagate into booking, invoice/reporting, and audit evidence for the same lifecycle.
- `direction` is required request context.
- `flightNo` is required for pickup before booking creation.
- `terminal` and `luggageCount` persist for fulfillment and manual-review context, but do not themselves mint a new `eligibilityVerificationId`.

## 6. Honest parent-state summary

`PH1GC-PARTNER-002` is not ready for `done`. The only machine-truth-safe current claim is:

```text
PH1GC-PARTNER-002 remains blocked externally.
origin/codex/ph1gc-partner-002@b34dfa78 already carries the blocked-state
PARTNER-ELIG-LIVE-001 sidecar, but origin/dev still lacks that path and no
real issuer/bank sandbox bundle is available yet. EXT-001-BLK-001 through
EXT-001-BLK-006 remain open, so WF-PARTNER-001 cannot claim PASS (sandbox
evidence). Timeout acceptance follows the canonical partner spec:
8 seconds per request, 2 retries with 1s/3s backoff, exhaustion ->
ineligible (issuer_unreachable), not manual_review.
```

This helper packet can be approved once the reviewer confirms the metadata, dependency map, and semantic-precedence corrections above. Approval of this sidecar does **not** unblock the parent by itself.
