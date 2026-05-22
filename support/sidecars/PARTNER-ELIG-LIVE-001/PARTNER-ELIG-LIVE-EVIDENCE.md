# PARTNER-ELIG-LIVE-001 — Issuer Sandbox Hold-State Evidence

- **Task:** `PH1GC-PARTNER-002`
- **Canonical live-proof chain:** `PARTNER-ELIG-LIVE-001`
- **Owner:** `Claude`
- **Reviewer:** `Claude2` (canonical at owner-closeout time; supervisor reassigned from `Gemini2` between intermediate packet write and owner closeout — see §7 reviewer-churn note)
- **Collected:** `2026-05-22 (UTC)`
- **Status:** `hold-state evidence only — issuer sandbox proof remains external-gated on EXT-001-BLK-001..006`

---

## 1. Executive Summary

This packet lands the canonical sidecar path `support/sidecars/PARTNER-ELIG-LIVE-001/` on the `claude/ph1gc-partner-002` task branch and enumerates each of the seven directive §E evidence categories required by the dispatch brief for `PH1GC-PARTNER-002`.

Repository truth on `2026-05-22`:

- `PH1GC-PARTNER-001` is `done`. The partner eligibility / airport-transfer spec, UAT, and E2E driver are landed on `origin/dev` (`docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md`, `docs/04-uat/partner-eligibility-airport-transfer-uat-20260519.md`, `tests/e2e/E2E-008-partner-eligibility-airport-transfer.sh`).
- `PARTNER-ELIG-LIVE-001` parent and its three unblock helpers (`-UNBLOCK-MANUAL-UNBLOCK`, `-UNBLOCK-PLANNING-DECISION`, `-UNBLOCK-HISTORY-REPAIR`) are all `done` in canonical `ai-status.json`.
- The canonical sidecar path `support/sidecars/PARTNER-ELIG-LIVE-001/` did not exist on `origin/dev` at task pickup. A prior closeout shape lived on `origin/codex/ph1gc-partner-002@c0452396` but never reached `origin/dev`. This task lands the equivalent honest hold-state evidence on the canonical `claude/ph1gc-partner-002` branch.
- `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md` remains the binding external gate. Blockers `EXT-001-BLK-001` through `EXT-001-BLK-006` are open. No real issuer / bank sandbox package — credentials, allowlist, approved fixtures, sponsor sign-off, sensitive-data approval — is attached in this repo session.

Conclusion under directive §2.3 evidence classification:

- This packet is `static evidence` (hold-state). It is not `sandbox evidence`.
- `WF-PARTNER-001` gate-read must stay at `PASS (static evidence)` until real issuer sandbox proof replaces this packet.
- The brief's `blocked_external` fallback applies because issuer sandbox is blocked.

---

## 2. Canonical Inputs Reviewed

### 2.1 Dispatch brief

`PH1GC-PARTNER-002` dispatch brief (Phase 1 v3 gap closure) requires this sidecar to carry the seven directive §E proof items: issuer sandbox credential reference, allowed test cards, eligible / ineligible / manual_review proof, timeout / retry, booking linkage, billing / reporting, and audit. The brief explicitly permits a `blocked_external` outcome if issuer sandbox proof cannot be produced. Mocked card data is explicitly NOT acceptable.

### 2.2 Partner eligibility spec

`docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md` is canonical for `WF-PARTNER-001`:

- §2.1 names sandbox-classification proof as a nine-item set; the seven directive §E categories normalize that set (collapsing the credential + test-instrument pair into two items and the three decision-class proofs into one).
- §2.2 explicitly states repo-local mocks, fabricated cards, and static test JSON are NOT sandbox classification.
- §4 defines `eligible`, `ineligible`, and `manual_review` states.
- §5 defines booking, billing, reporting, and audit linkage via `eligibilityVerificationId`, `entrySlug`, `cardLast4`, `referenceToken`, and `referenceHash`.
- §7 lists negative paths `NP-PARTNER-001`, `NP-PARTNER-002`, `NP-PARTNER-003`, and `NP-PARTNER-007` that must appear in the issuer sandbox evidence pack.

### 2.3 External-gate truth

`support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md` (owner Gemini2, reviewer Codex) carries the six open blockers that gate real issuer activation. Quoted directly from that packet:

- `EXT-001-BLK-001` — Issuer / bank API contract authority. Required: signed or otherwise approved endpoint, schema, status-code, and SLA contract. Owner: bank / issuer integration PM.
- `EXT-001-BLK-002` — Sandbox credentials and network allowlist. Required: sandbox client id/secret or token, mTLS/IP allowlist if required, secret path. Owner: bank / issuer technical owner.
- `EXT-001-BLK-003` — Allowed test card / reference matrix. Required: issuer-approved fixtures for eligible, ineligible, expired, timeout, rate-limit. Owner: bank / issuer QA owner.
- `EXT-001-BLK-004` — Timeout and retry behavior confirmation. Required: evidence that `3000ms`, `3` attempts, and backoff match issuer guidance. Owner: bank / issuer technical owner.
- `EXT-001-BLK-005` — Manual-review fallback business sign-off. Required: sponsor/issuer sign-off that offline evidence may release a held booking. Owner: product + ops + sponsor.
- `EXT-001-BLK-006` — Sensitive-data handling and retention approval. Required: data masking, token hashing, audit visibility, and retention approval. Owner: security / compliance.

### 2.4 Runtime adapter surface

`apps/api/src/modules/tenant-partner/partner-eligibility-adapter.interface.ts` declares the eligibility adapter contract. `infra/migrations/V0021__partner_registry_and_eligibility_persistence.sql` carries the persistence model. `docs/03-runbooks/partner-eligibility-manual-review-runbook.md` defines the manual-review handling rules. None of these surfaces holds a real issuer credential, an issuer-approved fixture, or a dated sandbox response.

---

## 3. Directive §E Evidence Matrix

Each row maps a required directive §E category to its current 2026-05-22 state, its repo-local anchor (so the contract is verifiable), and the specific real-issuer input still missing.

### 3.1 Issuer sandbox credential reference

- **State:** missing.
- **Repo-local anchor:** `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md` blocker `EXT-001-BLK-002` names the required sandbox credential and network allowlist package. The partner spec §2.1 requires a "credential-source declaration (with masked reference token)" before any live-classification claim.
- **Missing real issuer input:** no issuer-approved sandbox client id, OAuth token / secret path, mTLS material, or IP / hostname allowlist evidence is attached in this repo session. Per partner spec §2.2 and EXT-001 §3, a fabricated credential or a placeholder env-var is NOT acceptable evidence.

### 3.2 Allowed test cards / reference tokens

- **State:** missing.
- **Repo-local anchor:** `EXT-001-BLK-003` names the allowed test-fixture requirement. Partner spec §2.1 names "at least one successful `eligible` verification on a sandbox-allowed test instrument" and §2.2 names what is NOT a sandbox test card (fabricated PANs, static JSON committed into the repo).
- **Missing real issuer input:** no issuer-approved fixture matrix listing accepted eligible PAN / token / reference values, accepted ineligible values, accepted expired / locked values, accepted timeout / rate-limit values, and the issuer's masking expectation for each fixture is attached. Until that fixture matrix arrives, the partner UAT and E2E driver continue to rely on documented placeholders, which §2.2 explicitly forbids as sandbox proof.

### 3.3 Eligible / ineligible / manual_review proof

- **State:** missing.
- **Repo-local anchor:** Partner spec §4 defines the three decision states (`eligible`, `ineligible`, `manual_review`). Partner spec §7 enumerates the negative paths (`NP-PARTNER-001` reference-token rejection, `NP-PARTNER-002` timeout, `NP-PARTNER-003` ambiguous response → manual_review, `NP-PARTNER-007` issuer maintenance window). `docs/03-runbooks/partner-eligibility-manual-review-runbook.md` defines manual-review handling rules.
- **Missing real issuer input:** no dated sandbox transcript or log shows a real issuer endpoint returning each of `eligible`, `ineligible`, and `manual_review` for issuer-approved fixtures. Per partner spec §2.2 and the brief's "Real issuer sandbox data only" rule, repo-local mocks and adapter-stub responses are not acceptable proof.

### 3.4 Timeout / retry proof

- **State:** missing.
- **Repo-local anchor:** Partner spec §4.3 defines the manual-review timeout / retry budget. The eligibility adapter retry policy field is named in the contract document (`EXT-001-EXTERNAL-GATE.md` Required Contract Fields table → `retryPolicy`). `EXT-001-BLK-004` names timeout / retry confirmation as the required external sign-off. Partner spec §7 `NP-PARTNER-002` requires a timeout proof.
- **Missing real issuer input:** no issuer-confirmed timeout budget, retry-count, backoff schedule, or sandbox transcript demonstrating that the repo's `3000ms` / 3-attempt behavior matches issuer guidance is attached.

### 3.5 Booking linkage

- **State:** repo contract exists; real proof missing.
- **Repo-local anchor:** Partner spec §5.1 requires `eligibilityVerificationId`, `entrySlug`, `cardLast4`, `referenceToken`, and `referenceHash` to persist on the partner booking record. `infra/migrations/V0021__partner_registry_and_eligibility_persistence.sql` carries the persistence columns. `tests/e2e/E2E-008-partner-eligibility-airport-transfer.sh` exists on `origin/dev` and exercises the spec-side linkage.
- **Missing real issuer input:** no dated record exists of a real sandbox-classified verification id flowing into a real booking row. The booking-side contract is repo-complete; the missing piece is a real issuer-side verification id that the contract can carry.

### 3.6 Billing / reporting proof

- **State:** repo contract exists; real proof missing.
- **Repo-local anchor:** Partner spec §5.2 requires `partnerProgramCode`, `eligibilityVerificationId`, and `referenceHash` to flow into invoice rows. §5.3 requires the same identifiers to flow into reporting exports.
- **Missing real issuer input:** no invoice row or report export derived from a real sandbox-classified partner booking is attached. As above, the billing / reporting contract surface is repo-complete; the missing piece is a real upstream sandbox verification feeding it.

### 3.7 Audit proof

- **State:** repo contract exists; real proof missing.
- **Repo-local anchor:** Partner spec §5.4 requires audit rows for `issued`, `retried`, `eligible`, `ineligible`, `manual_review_entered`, and `manual_review_resolved` states. The manual-review runbook defines the operator-facing audit visibility.
- **Missing real issuer input:** no audit extract from a real issuer sandbox verification lifecycle is attached. The audit-write contract is repo-complete; the missing piece is a real verification lifecycle whose audit rows the contract can record.

---

## 4. Blocker Snapshot

| Blocker ID         | Missing input                                  | Effect on §E acceptance                                                                |
| ------------------ | ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| `EXT-001-BLK-001`  | Issuer / bank API contract authority           | Cannot prove the DRTS request / response contract matches the real issuer endpoint.    |
| `EXT-001-BLK-002`  | Sandbox credentials and network allowlist      | Cannot authenticate or reach a real sandbox endpoint; §3.1 evidence unattainable.      |
| `EXT-001-BLK-003`  | Allowed test card / reference matrix           | Cannot run accepted eligible / ineligible / timeout / rate-limit probes; §3.2 blocked. |
| `EXT-001-BLK-004`  | Timeout and retry behavior confirmation        | Cannot claim repo retry behavior matches issuer guidance; §3.4 blocked.                |
| `EXT-001-BLK-005`  | Manual-review fallback business sign-off       | Cannot claim a held booking may be released by offline review.                         |
| `EXT-001-BLK-006`  | Sensitive-data handling and retention approval | Cannot claim live-safe masking, audit visibility, or retention posture.                |

---

## 5. Gate Read And Non-Claim

### 5.1 Allowed current claim

- `PH1GC-PARTNER-002` lands `support/sidecars/PARTNER-ELIG-LIVE-001/` on the canonical task branch `claude/ph1gc-partner-002` with honest hold-state evidence for the seven directive §E categories.
- `WF-PARTNER-001` gate-read remains `PASS (static evidence)` on the canonical matrix row.
- The only remaining blockers are `EXT-001-BLK-001` through `EXT-001-BLK-006`.
- The brief's `blocked_external` fallback applies.

### 5.2 Not allowed (non-claim guardrails)

The following claims are explicitly NOT supported by this packet and MUST NOT appear in any closeout, dashboard, or release-truth update derived from this artifact:

- `WF-PARTNER-001 = PASS (sandbox evidence)`
- `PARTNER-ELIG-LIVE-001 has live issuer proof attached`
- `issuer sandbox credentials were validated`
- `issuer-approved test cards passed`
- `eligible / ineligible / manual_review was proven against a real sandbox`
- `timeout / retry behavior was confirmed against a real issuer`
- `the seven §E evidence items are complete`

Per directive §7 non-claim rules, repo-local proof done does not equal external-integration proof done.

---

## 6. Resume Conditions

This evidence packet can be replaced with real sandbox evidence only after ALL of the following arrive together (per `EXT-001-EXTERNAL-GATE.md` §4):

1. Approved issuer or bank API contract package (`EXT-001-BLK-001`).
2. Sandbox credentials plus network allowlist or mTLS requirements (`EXT-001-BLK-002`).
3. Issuer-approved eligible, ineligible, timeout, and rate-limit fixtures (`EXT-001-BLK-003`).
4. Issuer-approved timeout and retry guidance (`EXT-001-BLK-004`).
5. Sponsor or issuer sign-off for manual-review release rules (`EXT-001-BLK-005`).
6. Sensitive-data handling and retention approval (`EXT-001-BLK-006`).

After those inputs arrive, a follow-up gap-closure task should:

1. Attach the redacted real evidence under this sidecar path (replacing the §3 matrix rows row-by-row).
2. Run the real issuer sandbox verification flow using the approved fixtures.
3. Capture dated logs / screenshots / transcripts for each of the seven §E categories.
4. Uplift the matrix row to `PASS (sandbox evidence)` only after no §3 row remains in the missing state and no row's evidence relies on a mock.

---

## 7. Verification Notes

Verification in this task was source review only:

- reviewed canonical `ai-status.json` machine truth for `PH1GC-PARTNER-002` (owner `Claude`; reviewer `Gemini2` at intermediate packet write, then `Claude2` at owner-closeout time per supervisor reassignment; status `in_progress` at task pickup), `PH1GC-PARTNER-001` (done), `PARTNER-ELIG-LIVE-001` parent (done), and the three `PARTNER-ELIG-LIVE-001-UNBLOCK-*` helpers (done).
- reviewer-churn note: this task carried three reviewer assignments in `ai-status.json` during execution — `Codex2` (initial dispatch row at registration), `Gemini2` (intermediate, recorded in the §1 header at packet write and in this section), and `Claude2` (current canonical at owner closeout). The closeout proceeds under the current canonical pair (`Claude` / `Claude2`). The intermediate `Gemini2` mention is preserved here as historical state truth, not as a contradiction.
- reviewed the dispatch-embedded `PH1GC-PARTNER-002` task brief (seven directive §E items, `blocked_external` fallback allowed).
- reviewed `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md` §2.3 evidence classification and §3.5 `WF-PARTNER-001` workflow specification.
- reviewed `docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md` §1–§7 for the canonical contract surfaces.
- reviewed `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md` for the binding external-gate blockers (six open).
- reviewed `docs/03-runbooks/partner-eligibility-manual-review-runbook.md` for manual-review handling.
- confirmed no repo-local artifact currently carries a real issuer sandbox credential, an issuer-approved fixture matrix, or a dated sandbox response.

No live issuer probe was executed in this task because the required external issuer / bank sandbox package is still absent. This task does NOT execute against any real issuer endpoint, does NOT mint or store any real credential, and does NOT exfiltrate or fabricate any sensitive card data.
