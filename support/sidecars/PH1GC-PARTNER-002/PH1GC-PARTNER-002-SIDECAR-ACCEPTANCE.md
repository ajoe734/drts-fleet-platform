# PH1GC-PARTNER-002 — Sidecar Acceptance Packet & Dependency Map

> Support-only artifact for `PH1GC-PARTNER-002-SIDECAR-ACCEPTANCE`.
> Does not modify canonical truth; does not promote any workflow gate read.

## 0. Metadata

| Field | Value |
| --- | --- |
| Sidecar task | `PH1GC-PARTNER-002-SIDECAR-ACCEPTANCE` |
| Parent task | `PH1GC-PARTNER-002` |
| Parent workflow family | `WF-PARTNER-001` |
| Helper kind | `acceptance_packet` (sidecar; `mutates_canonical=false`) |
| Sidecar owner | `Claude` |
| Sidecar reviewer | `Codex2` |
| Parent owner | `Codex2` |
| Parent reviewer | `Codex` |
| Parent status (ai-status.json) | `todo` (effective: `blocked_external` on EXT-001 inputs) |
| Branch | `claude/ph1gc-partner-002-sidecar-acceptance` |
| Last update | 2026-05-23 (UTC) |

## 1. Directive §2.2 closeout snapshot (sidecar scope only)

```text
Workflow family: WF-PARTNER-001
Business flow: Partner eligibility and airport-transfer benefit intake
Current gate read: EXTERNAL-GATED (no sidecar promotion in this task)
Verification path: sidecar / static evidence (acceptance-packet review only)
Evidence level: static evidence
Non-claim: This packet does not provide issuer-sandbox credentials, allowed test cards, real eligibility outcomes, timeout/retry proof, booking linkage, billing/reporting linkage, or audit evidence. It only maps where each item must land when external inputs arrive.
Next action: Reviewer (Codex2) confirms the acceptance checklist and dependency map. Parent owner (Codex2) resumes PH1GC-PARTNER-002 only when EXT-001-BLK-001 through EXT-001-BLK-006 are satisfied.
```

## 2. Scope of this sidecar

This packet exists to **prepare** `PH1GC-PARTNER-002`, not to satisfy it. It is
written under the supervisor's `mutates_canonical=false` policy for sidecar
helpers.

In-scope:

- Restate the canonical acceptance criteria for `PH1GC-PARTNER-002` in a
  reviewer-checkable checklist.
- Map the seven directive §E evidence items to the canonical contract fields,
  negative-path UAT IDs, and external blocker IDs they depend on.
- Record the dependency graph (declared, satisfied, and external-gated).
- Identify the resume conditions the parent owner must satisfy before
  promoting the workflow gate read.

Out of scope (must not happen in this task):

- Editing `docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md`.
- Editing `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md` or any other
  canonical external-gate packet.
- Creating or refreshing `support/sidecars/PARTNER-ELIG-LIVE-001/`. That sidecar
  path remains the parent owner's deliverable for `PH1GC-PARTNER-002`.
- Promoting `WF-PARTNER-001` to `PASS (sandbox evidence)`.
- Changing the ai-status row for `PH1GC-PARTNER-002` itself.

## 3. Dependency map

### 3.1 Declared dependency

| Dep ID | Status | Authority on origin/dev | Resolves what |
| --- | --- | --- | --- |
| `PH1GC-PARTNER-001` | `done` (commit `68b13f1b`) | `docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md` | Establishes the contract fields, negative paths, and sandbox requirement that `PH1GC-PARTNER-002` must evidence. |

### 3.2 Effective external dependency (`EXT-001` external gate)

`PH1GC-PARTNER-002` is repo-side satisfied per the three closed unblock
children (see §3.3) but cannot produce sandbox evidence until the
`EXT-001` external blockers below are released by their respective owners.

| Blocker | Missing input | Authority | Owner to confirm |
| --- | --- | --- | --- |
| `EXT-001-BLK-001` | Issuer / bank API contract authority | `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md` | Bank / issuer integration PM |
| `EXT-001-BLK-002` | Sandbox credentials and network allowlist | same | Bank / issuer technical owner |
| `EXT-001-BLK-003` | Allowed test card / reference fixture matrix | same | Bank / issuer QA owner |
| `EXT-001-BLK-004` | Timeout and retry behavior confirmation | same | Bank / issuer technical owner |
| `EXT-001-BLK-005` | Manual-review fallback business sign-off | same | Product + ops + sponsor |
| `EXT-001-BLK-006` | Sensitive-data handling and retention approval | same | Security / compliance |

### 3.3 Prior in-repo helper chain (all `done`)

| Helper task | Status | Closeout commit | Purpose |
| --- | --- | --- | --- |
| `PH1GC-PARTNER-002-UNBLOCK-MANUAL-UNBLOCK` | `done` | `8593a6ca` on `codex2/ph1gc-partner-002-unblock-manual-unblock` | Confirmed `PH1GC-PARTNER-002` maps to canonical `PARTNER-ELIG-LIVE-001`; no repo-local blocker beyond `EXT-001-BLK-001..006`. |
| `PH1GC-PARTNER-002-UNBLOCK-PLANNING-DECISION` | `done` | `8a28e686` on `codex/ph1gc-partner-002-unblock-planning-decision` | Recorded the §6 field contract (`direction`, `flightNo`, `terminal`, `luggageCount`) in the canonical partner spec; scope-cut PARTNER-002 to **sandbox proof only** (live activation stays under `EXT-001`). |
| `PH1GC-PARTNER-002-UNBLOCK-HISTORY-REPAIR` | `done` | `6b0db016` on `codex/ph1gc-partner-002-unblock-history-repair` | Stabilized the PARTNER-ELIG-LIVE-001 sidecar lineage without force-pushing shared history. |

### 3.4 Sibling / consumer surfaces (read-only references)

The parent owner should attach evidence pointers under
`support/sidecars/PARTNER-ELIG-LIVE-001/` only; this packet does not duplicate
them. Consumers that will read the sandbox evidence once it lands:

- `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
  HELD row for `PARTNER-ELIG-LIVE-001`.
- `docs/03-runbooks/master-system-closeout-checklist.md` D-4a (productization
  blocker).
- `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`
  §3 — billing/reporting fields required when origin is partner channel.

## 4. Acceptance checklist (sidecar-internal)

Checklist for **this acceptance packet only**. The reviewer (Codex2) verifies
each box maps to a citable source and accurately reflects current `origin/dev`.

- [x] Sidecar scope statement is `mutates_canonical=false` and confined to
  `support/sidecars/PH1GC-PARTNER-002/`.
- [x] Parent task (`PH1GC-PARTNER-002`) declared dependencies are listed and
  classified as satisfied / external-gated.
- [x] Three closed unblock children are listed with their closeout commit
  evidence so the reviewer can confirm no in-repo blocker remains.
- [x] Directive §E seven evidence items are restated verbatim and mapped to
  EXT-001 blocker IDs (Section 5.1).
- [x] Partner-spec §7 negative paths (`NP-PARTNER-001`, `-002`, `-003`,
  `-007`) are declared in scope of the sandbox evidence the parent must
  collect (Section 5.2).
- [x] Resume conditions are stated as non-claims, not as completed work
  (Section 6).
- [x] No canonical file is edited; no ai-status row outside this sidecar task
  is touched.
- [ ] Reviewer (Codex2) confirms checklist & dependency map and `approve`s
  the sidecar task; on approval, owner (Claude) finalizes with a closeout
  commit and `done`.

## 5. Parent acceptance map (what `PH1GC-PARTNER-002` itself must deliver)

This section is **reference for the parent owner**. It does not change parent
ai-status; it just states how the sidecar reads the canonical acceptance.

### 5.1 Directive §E seven evidence items → required external input

Source: `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md`
§E `PARTNER-002` (lines 548–570).

| # | Directive §E item | Required external input | Drop location |
| --- | --- | --- | --- |
| 1 | Issuer sandbox credential reference | `EXT-001-BLK-002` | `support/sidecars/PARTNER-ELIG-LIVE-001/` (redacted credential ref + secret path) |
| 2 | Allowed test cards / reference tokens | `EXT-001-BLK-003` | same path — fixture matrix file |
| 3 | `eligible` / `ineligible` / `manual_review` proof | `EXT-001-BLK-002`, `-003`, `-005` | same path — per-outcome session log/screenshot bundle |
| 4 | Timeout / retry proof | `EXT-001-BLK-003`, `-004` | same path — issuer-confirmed run against the repo defaults (`3000ms`, 3 attempts, backoff `250ms × 2x` cap `1000ms`, exhaustion → `manual_review`) |
| 5 | Booking linkage | `EXT-001-BLK-002`, `-003` | same path — booking record showing real `eligibilityVerificationId` |
| 6 | Billing / reporting proof | `EXT-001-BLK-002`, `-003`, `-006` | same path — invoice + reporting export showing `partnerProgramCode` + `eligibilityVerificationId` propagation |
| 7 | Audit proof | `EXT-001-BLK-002`, `-003`, `-006` | same path — masked-reference audit rows from a real verification lifecycle |

Gate-read promotion (matrix row for `WF-PARTNER-001` → `PASS (sandbox evidence)`)
is allowed **only** after all seven rows are populated with non-mocked evidence.

### 5.2 Canonical negative paths required by the partner spec

Source: `docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md`
§7. The parent sidecar must include at minimum:

| ID | Scenario | Expected sandbox outcome |
| --- | --- | --- |
| `NP-PARTNER-001` | Eligibility returns `ineligible` | Booking refused with issuer reason code; no driver dispatch |
| `NP-PARTNER-002` | Eligibility times out across retry budget | Terminal `ineligible` with reason `issuer_unreachable` |
| `NP-PARTNER-003` | `manual_review` held longer than tenant SLA | Operator queue surfaces overdue item; no auto-eligibility flip |
| `NP-PARTNER-007` | Reporting export includes manual_review-then-rejected booking | Export row reflects refused state; subsidy not applied |

`NP-PARTNER-004..006` and `-008` remain spec-required UAT but are not minimum
for the §E sandbox evidence drop.

### 5.3 Field contract carried in from the planning-decision unblock

Source: `docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md`
§6 (recorded by `PH1GC-PARTNER-002-UNBLOCK-PLANNING-DECISION`).

- `direction` is part of eligibility request context.
- `flightNo` is required only for `direction = pickup`; missing pickup
  `flightNo` is a **pre-booking rejection**, not a post-booking exception.
- `terminal` and `luggageCount` are booking-scoped fulfillment fields. They
  persist onto booking / request / manual-review context, but **do not**
  change issuer eligibility classification on their own and do **not** mint a
  new `eligibilityVerificationId`.

Sandbox evidence sessions must respect this split when recording inputs and
outcomes; otherwise the gate-read promotion is invalid.

## 6. Resume conditions for the parent

`PH1GC-PARTNER-002` may move from "todo / blocked_external" toward
`in_progress → review → done` only after **all** of the following are true on
`origin/dev`:

1. `support/sidecars/PARTNER-ELIG-LIVE-001/` is restored with the seven §E
   evidence items above, sourced from a real issuer sandbox (no mocks).
2. The redacted credential reference and allowlist path are checked against
   `EXT-001-BLK-002` and approved by the bank/issuer technical owner.
3. The fixture matrix is issuer-approved per `EXT-001-BLK-003` (eligible,
   ineligible, expired, timeout/rate-limited, manual_review).
4. Booking linkage shows a real `eligibilityVerificationId` propagated to the
   booking row and reflected in billing/reporting export.
5. Audit rows are present for the same verification lifecycle with masked
   card/reference data per `EXT-001-BLK-006`.
6. The directive §2.2 closeout snapshot is updated from `EXTERNAL-GATED` to
   `PASS` and the gate matrix row for `WF-PARTNER-001` flips to
   `PASS (sandbox evidence)`.

Until then, the only valid claims are:

- `WF-PARTNER-001` remains repo/static complete but **external-gated** for
  real issuer sandbox proof.
- `PH1GC-PARTNER-002` is **repo-side satisfied** by the unblock helper chain
  and waiting on external issuer/bank inputs.
- This sidecar provides a reviewable acceptance checklist + dependency map;
  it does not provide sandbox evidence.

## 7. Verification basis

Sources read during the writing of this packet (no edits made to any of them):

- `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md`
  §2.2 closeout format and §3.5 evidence rule.
- `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md`
  §E `PARTNER-002` (lines 548–570).
- `docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md`
  §2, §5, §6, §7.
- `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md`.
- `support/unblock/PH1GC-PARTNER-002/PH1GC-PARTNER-002-UNBLOCK-PLANNING-DECISION.md`.
- `ai-status.json` rows for `PH1GC-PARTNER-001`, `PH1GC-PARTNER-002`,
  `PH1GC-PARTNER-002-UNBLOCK-MANUAL-UNBLOCK`,
  `PH1GC-PARTNER-002-UNBLOCK-PLANNING-DECISION`,
  `PH1GC-PARTNER-002-UNBLOCK-HISTORY-REPAIR`,
  `PH1GC-PARTNER-002-SIDECAR-ACCEPTANCE`.
- Historical anchor for the parent sidecar at commits `2628fc7`, `2ec2868c`,
  `b796f63d` (confirms the lineage referenced by the history-repair child;
  `support/sidecars/PARTNER-ELIG-LIVE-001/` is currently absent from
  `origin/dev` and remains the parent's deliverable).

No live issuer sandbox probe was executed and none was attempted in this
sidecar task.
