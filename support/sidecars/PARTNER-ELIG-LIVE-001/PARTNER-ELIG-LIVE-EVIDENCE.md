# PARTNER-ELIG-LIVE-001 — Issuer Sandbox Hold-State Evidence

**Task:** `PH1GC-PARTNER-002`  
**Canonical live-proof chain:** `PARTNER-ELIG-LIVE-001`  
**Owner:** `Codex`  
**Reviewer:** `Codex2`  
**Collected:** `2026-05-22 (UTC)`  
**Status:** `partial evidence only — issuer sandbox proof remains external-gated`

---

## 1. Executive Summary

This packet restores the canonical sidecar path required by directive section E
while keeping the release claim honest.

Current repo truth on `2026-05-22`:

- `PH1GC-PARTNER-001` is done, so the partner eligibility spec and workflow
  naming boundary are already landed on `origin/dev`.
- `PH1GC-PARTNER-002-UNBLOCK-MANUAL-UNBLOCK` and
  `PH1GC-PARTNER-002-UNBLOCK-PLANNING-DECISION` are done, and both route the
  remaining work to the same external issuer gate.
- No real issuer or bank sandbox package is attached in this repo session:
  - no approved issuer API authority artifact
  - no sandbox credential or allowlist package
  - no issuer-approved test card or reference-token matrix
  - no issuer-confirmed timeout or retry guidance
  - no sponsor or issuer sign-off for manual-review release rules
  - no sensitive-data approval for live partner eligibility use

Conclusion:

- The required sidecar path now exists at the canonical location.
- The directive section E acceptance bar is still blocked on
  `EXT-001-BLK-001` through `EXT-001-BLK-006`.
- `WF-PARTNER-001` must not be uplifted to `PASS (sandbox evidence)` until
  real issuer sandbox evidence replaces this hold-state packet.

---

## 2. Canonical Inputs Reviewed

### 2.1 Gap-closure directive

`docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md`
defines `PH1GC-PARTNER-002` as the issuer sandbox evidence task and requires
seven section-E proof items under this sidecar path.

### 2.2 Partner eligibility spec

`docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md`
is the canonical contract for `WF-PARTNER-001`.

Relevant constraints:

- section 2.1 names the sandbox-classification evidence set
- section 4 defines `eligible`, `ineligible`, and `manual_review`
- section 5 defines booking, billing, reporting, and audit linkage
- section 7 requires `NP-PARTNER-001`, `002`, `003`, and `007` to be shown in
  the issuer sandbox evidence pack

### 2.3 External-gate truth

`support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md` remains the binding gate
packet for real issuer and bank activation.

Open external blockers remain:

- `EXT-001-BLK-001` issuer or bank API contract authority
- `EXT-001-BLK-002` sandbox credentials and network allowlist
- `EXT-001-BLK-003` allowed test card or reference fixture matrix
- `EXT-001-BLK-004` timeout and retry behavior confirmation
- `EXT-001-BLK-005` manual-review fallback business sign-off
- `EXT-001-BLK-006` sensitive-data handling and retention approval

### 2.4 Historical anchor

The same hold-state evidence shape was previously recorded on branch-only commit
`2628fc7`, but the canonical sidecar path never landed on `origin/dev`. This
packet restores that missing path without changing the underlying external-gated
truth.

---

## 3. Directive Section E Evidence Matrix

| Required evidence item | 2026-05-22 state | Repo-local anchor | Missing real issuer sandbox input |
| --- | --- | --- | --- |
| issuer sandbox credential reference | Missing | `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md` blocker `EXT-001-BLK-002` names the required credential and allowlist package. | No issuer-approved sandbox client id, token, secret path, mTLS details, or allowlist evidence is attached in this repo session. |
| allowed test cards / reference tokens | Missing | `EXT-001-BLK-003` names the allowed test fixture requirement; the partner spec section 2.1 requires sandbox-allowed test instruments. | No issuer-approved eligible, ineligible, expired, timeout, or rate-limit fixture matrix is attached. |
| eligible / ineligible / manual_review proof | Missing | Partner spec sections 2.1 and 4 define the three required decision classes; `docs/03-runbooks/partner-eligibility-manual-review-runbook.md` defines the manual-review handling rules. | No dated sandbox responses or logs exist for issuer-approved fixtures. Repo-local adapters and mocks are explicitly not acceptable proof. |
| timeout / retry proof | Missing | `EXT-001` names timeout/retry confirmation as blocker `EXT-001-BLK-004`; the spec section 7 also requires `NP-PARTNER-002`. | No issuer-confirmed timeout budget, retry count, or sandbox timeout transcript is attached. |
| booking linkage | Repo contract exists; real proof missing | Partner spec section 5.1 requires `eligibilityVerificationId`, `entrySlug`, `cardLast4`, `referenceToken`, and `referenceHash` to persist on the partner booking record. | No real sandbox-classified booking record is attached showing an issuer-backed verification flowing into a booking. |
| billing / reporting proof | Repo contract exists; real proof missing | Partner spec sections 5.2 and 5.3 require `partnerProgramCode`, `eligibilityVerificationId`, and `referenceHash` to flow into invoice and reporting surfaces. | No invoice row or report export derived from a real sandbox-classified partner booking is attached. |
| audit proof | Repo contract exists; real proof missing | Partner spec section 5.4 requires audit rows for issued, retried, eligible, ineligible, manual_review entered, and manual_review resolved states. | No audit extract from a real issuer sandbox verification lifecycle is attached. |

---

## 4. Blocker Snapshot

| Blocker ID | Missing input | Effect on section E acceptance |
| --- | --- | --- |
| `EXT-001-BLK-001` | Issuer or bank API contract authority | Cannot prove the DRTS request or response contract matches the real issuer endpoint. |
| `EXT-001-BLK-002` | Sandbox credentials and network allowlist | Cannot authenticate or reach a real sandbox endpoint. |
| `EXT-001-BLK-003` | Allowed test card or reference matrix | Cannot run accepted eligible, ineligible, timeout, or rate-limit probes. |
| `EXT-001-BLK-004` | Timeout and retry behavior confirmation | Cannot claim repo retry behavior matches issuer guidance. |
| `EXT-001-BLK-005` | Manual-review fallback business sign-off | Cannot claim a held booking may be released by offline review. |
| `EXT-001-BLK-006` | Sensitive-data handling and retention approval | Cannot claim live-safe masking, audit visibility, or retention posture for real sandbox evidence. |

---

## 5. Gate Read And Non-Claim

Allowed current claim:

- `PH1GC-PARTNER-002` restored the canonical sidecar path on `origin/dev`.
- `WF-PARTNER-001` remains below sandbox-proof closure until the issuer
  evidence pack is attached.
- The only remaining blockers are `EXT-001-BLK-001` through
  `EXT-001-BLK-006`.

Not allowed:

- `WF-PARTNER-001 = PASS (sandbox evidence)`
- `PARTNER-ELIG-LIVE-001 is complete`
- `issuer sandbox credentials were validated`
- `issuer-approved test cards passed`
- `manual_review was proven with a real sandbox response`

---

## 6. Resume Conditions

This task can move out of blocked state only after all of the following arrive:

1. Approved issuer or bank API contract package
2. Sandbox credentials plus network allowlist or mTLS requirements
3. Issuer-approved eligible, ineligible, timeout, and rate-limit fixtures
4. Issuer-approved timeout and retry guidance
5. Sponsor or issuer sign-off for manual-review release rules
6. Sensitive-data handling and retention approval for this flow

After those inputs arrive:

1. Attach the redacted evidence under `support/sidecars/PARTNER-ELIG-LIVE-001/`.
2. Run the real issuer sandbox verification flow using the approved fixtures.
3. Capture the seven section-E proof items with dated logs or screenshots.
4. Uplift the workflow gate read to `PASS (sandbox evidence)` only if the proof
   pack is complete and no mock-only artifact is carrying the claim.

---

## 7. Verification Notes

Verification in this task was source review only:

- reviewed canonical machine truth for `PH1GC-PARTNER-002`,
  `PH1GC-PARTNER-001`, and the two `PH1GC-PARTNER-002-UNBLOCK-*` helpers
- reviewed the gap-closure directive and current planning notes
- reviewed the partner eligibility spec and manual-review runbook
- reviewed `EXT-001` blocker definitions
- confirmed that no repo-local artifact currently carries real issuer sandbox
  credentials, issuer-approved fixtures, or dated sandbox proof

No live issuer probe was executed in this task because the required external
issuer or bank sandbox package is still absent.
