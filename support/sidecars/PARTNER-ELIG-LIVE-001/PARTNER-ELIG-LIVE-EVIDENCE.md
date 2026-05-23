# PARTNER-ELIG-LIVE-001 — Issuer Sandbox Hold-State Evidence

- **Legacy gap-closure alias:** `PH1GC-PARTNER-002`
- **Canonical task:** `PARTNER-ELIG-LIVE-001`
- **Canonical owner:** `Codex2`
- **Canonical reviewer:** `Claude2`
- **Collected:** `2026-05-22 (UTC)`
- **Canonical status:** `done (held evidence); external gate remains open`
- **Status of this packet:** `hold-state evidence only — issuer sandbox proof remains external-gated`

---

## 1. Executive Summary

This branch carries the missing sidecar path for `origin/dev` while staying
consistent with the already-approved canonical held-evidence closeout.

Current repo truth on `2026-05-23`:

- `PARTNER-ELIG-LIVE-001` is already `done` in canonical `ai-status.json`
  through commit `5213efc` on `origin/codex2/partner-elig-live-001`; that
  closeout kept the task externally gated rather than claiming sandbox closure.
- `PRT-SPEC-001` is done, so the repo-local partner eligibility spec
  prerequisite is already landed.
- `PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK` and
  `PARTNER-ELIG-LIVE-001-UNBLOCK-PLANNING-DECISION` are done, and both route
  the remaining work to the same external issuer gate.
- `origin/dev` still does not contain `support/sidecars/PARTNER-ELIG-LIVE-001/`,
  so this branch restores that missing path without reopening the canonical
  held/external-gated verdict.
- No real issuer or bank sandbox package is attached in this repo session:
  - no approved issuer API authority artifact
  - no sandbox credential or allowlist package
  - no issuer-approved test card or reference-token matrix
  - no issuer-confirmed timeout or retry guidance
  - no sponsor or issuer sign-off for manual-review release rules
  - no sensitive-data approval for live partner eligibility use

Conclusion:

- This branch does not supersede the canonical `PARTNER-ELIG-LIVE-001`
  closeout; it carries the same held-state posture onto the missing sidecar
  path expected by the gap-closure references.
- The required sidecar path now exists on `origin/codex/ph1gc-partner-002`
  and is ready to land on `origin/dev` after review.
- The directive section E acceptance bar is still blocked on
  `EXT-001-BLK-001` through `EXT-001-BLK-006`.
- `WF-PARTNER-001` must not be uplifted to `PASS (sandbox evidence)` until
  real issuer sandbox evidence replaces this hold-state packet.

---

## 2. Canonical Inputs Reviewed

### 2.1 Dispatch and release-truth anchors

The dispatch brief for legacy alias `PH1GC-PARTNER-002` defines this as the
issuer sandbox evidence task and requires seven section-E proof items under
this sidecar path. That same sidecar target is also cited by
`docs/03-runbooks/phase1-release-truth-sync-20260519.md` and
`docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`.

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

The same hold-state evidence first appeared on branch-only commit `2628fc7`,
and canonical machine truth later accepted the held/external-gated closeout at
`5213efc` on `origin/codex2/partner-elig-live-001`. `origin/dev` still lacks
the sidecar path, so this packet carries the missing path on the current branch
without changing the underlying external-gated truth.

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

- Legacy alias `PH1GC-PARTNER-002` restores the missing sidecar path on
  `origin/codex/ph1gc-partner-002` while staying consistent with canonical task
  `PARTNER-ELIG-LIVE-001`.
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

- reviewed canonical machine truth for `PARTNER-ELIG-LIVE-001`,
  `PRT-SPEC-001`, and the two `PARTNER-ELIG-LIVE-001-UNBLOCK-*` helpers
- verified that canonical `PARTNER-ELIG-LIVE-001` is already closed out at
  commit `5213efc`, while `origin/dev` still lacks this sidecar path
- reviewed the dispatch-embedded task brief and current planning notes
- reviewed the partner eligibility spec and manual-review runbook
- reviewed `EXT-001` blocker definitions
- confirmed that no repo-local artifact currently carries real issuer sandbox
  credentials, issuer-approved fixtures, or dated sandbox proof

No live issuer probe was executed in this task because the required external
issuer or bank sandbox package is still absent.
