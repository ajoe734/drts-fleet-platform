# PARTNER-ELIG-LIVE-001 - Issuer Sandbox Eligibility Evidence

**Task:** `PH1GC-PARTNER-002`
**Workflow family:** `WF-PARTNER-001`
**Current task owner / reviewer:** `Codex` / `Claude`
**Canonical parent lineage:** `PARTNER-ELIG-LIVE-001` (`done`, held evidence)
**Collected / re-verified:** `2026-05-23 (UTC)`
**Workflow evidence status:** `blocked_external`
**Task lifecycle note:** The clean dev-based sidecar replay lives on
`origin/codex2/ph1gc-partner-002@bddba93c`. The current
`codex/ph1gc-partner-002` branch is older audit history and must not be
treated as the live merge candidate.

---

## 0. Directive Section 7 Status Format

```text
Workflow family: WF-PARTNER-001
Business flow: Partner eligibility and airport-transfer benefit intake
Current gate read: PASS (static evidence); EXTERNAL-GATED for issuer sandbox evidence
Verification path: sidecar / manual evidence
Evidence level: static evidence
Non-claim: No real issuer sandbox credential, allowed test card, eligibility outcome, timeout/retry, booking linkage, billing/reporting linkage, or audit proof is attached yet.
Next action: Keep PH1GC-PARTNER-002 blocked on EXT-001-BLK-001 through EXT-001-BLK-006 until a real issuer sandbox evidence bundle can be attached under this sidecar path.
```

## 1. Executive Summary

This packet documents why `PH1GC-PARTNER-002` remains externally blocked even
though repo-side sidecar recovery already exists in branch history.

Current result on `2026-05-23`:

- `support/sidecars/PARTNER-ELIG-LIVE-001/` is still absent from `origin/dev`.
- The clean replay for the reserved sidecar path is
  `origin/codex2/ph1gc-partner-002@bddba93c`, which carries the blocked-state
  evidence packet on top of current `origin/dev`.
- The current `codex/ph1gc-partner-002` branch is an older audit lineage. It
  should not be described as ready to land on `origin/dev`.
- The repo still does **not** contain real issuer/bank sandbox credentials,
  allowed test cards, issuer-approved sandbox transcripts, or downstream
  booking / billing / audit proof.
- Because directive section E requires real issuer sandbox data and explicitly
  rejects repo-local mocks, `WF-PARTNER-001` cannot be promoted to
  `PASS (sandbox evidence)`.

Correct current claim:

- `WF-PARTNER-001` remains `PASS (static evidence)` / external-gated for real
  issuer sandbox proof.
- `PH1GC-PARTNER-002` remains `blocked_external` until
  `EXT-001-BLK-001` through `EXT-001-BLK-006` are satisfied.
- The directive section E task acceptance resolves to seven evidence rows. The
  partner spec's nine-item sandbox proof set remains the source-detail list,
  but the named issuer/bank counterparty and credential-source declaration are
  captured within the credential / fixture / proof rows rather than tracked as
  separate acceptance rows here.

---

## 2. Canonical Inputs Reviewed

1. `ai-status.json` and `ai-activity-log.jsonl` at the canonical machine-truth
   root
2. `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md` section
   2.10
3. `docs/03-runbooks/phase1-release-truth-sync-20260519.md`
4. `docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md`
   sections 2, 5, 7
5. `docs/03-runbooks/partner-eligibility-manual-review-runbook.md`
6. `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md`
7. `support/sidecars/PARTNER-ELIG-LIVE-001/PH1GC-PARTNER-002-CLOSEOUT-20260522.md`

---

## 3. Directive Section E Evidence Matrix

| Evidence item | Current state | Why not acceptable yet | Required external input |
| --- | --- | --- | --- |
| Issuer sandbox credential reference | Missing | No real sandbox credential bundle, secret path, or allowlist proof is attached in repo. | `EXT-001-BLK-002` |
| Allowed test cards / reference fixtures | Missing | No issuer-approved eligible / ineligible / manual-review / timeout fixture matrix is attached. | `EXT-001-BLK-003` |
| `eligible` / `ineligible` / `manual_review` proof | Missing | No real issuer sandbox session logs or screenshots exist; repo-local mocks are not acceptable. | `EXT-001-BLK-002`, `EXT-001-BLK-003`, `EXT-001-BLK-005` |
| Timeout / retry proof | Missing | Repo defaults exist, but there is no issuer-confirmed sandbox run proving accepted timeout/retry behavior. | `EXT-001-BLK-003`, `EXT-001-BLK-004` |
| Booking linkage proof | Missing | No real sandbox verification id was generated, so no booking record can prove `eligibilityVerificationId` linkage. | `EXT-001-BLK-002`, `EXT-001-BLK-003` |
| Billing / reporting linkage proof | Missing | Without a real verification id and partner booking, invoice/report linkage cannot be evidenced. | `EXT-001-BLK-002`, `EXT-001-BLK-003`, `EXT-001-BLK-006` |
| Audit proof | Missing | No real sandbox verification lifecycle exists to emit audit rows under approved data-handling rules. | `EXT-001-BLK-002`, `EXT-001-BLK-003`, `EXT-001-BLK-006` |

---

## 4. External Gate Snapshot

`support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md` remains the binding
external gate packet. The remaining blockers are:

| Blocker ID | Missing input |
| --- | --- |
| `EXT-001-BLK-001` | Issuer / bank API contract authority |
| `EXT-001-BLK-002` | Sandbox credentials and network allowlist |
| `EXT-001-BLK-003` | Allowed test card / reference fixture matrix |
| `EXT-001-BLK-004` | Timeout and retry behavior confirmation |
| `EXT-001-BLK-005` | Manual-review fallback business sign-off |
| `EXT-001-BLK-006` | Sensitive-data handling and retention approval |

Until those six inputs are attached, no claim about sandbox verification,
manual-review proof, or downstream linkage can be accepted.

---

## 5. Workflow Gate Read

Allowed current gate language:

- "`WF-PARTNER-001` is repo/static complete but still external-gated for real
  issuer sandbox proof."
- "`PH1GC-PARTNER-002` preserves the blocked-state sidecar path and remaining
  blocker set; it does not claim sandbox PASS."

Not allowed:

- "`WF-PARTNER-001` = PASS (sandbox evidence)"
- "Issuer sandbox credentials are present and validated."
- "Allowed test cards were executed successfully."
- "Manual review was proven in a real issuer sandbox."
- "Booking, billing/reporting, and audit linkage were proven with a real
  issuer verification id."

---

## 6. Resume Conditions

`PH1GC-PARTNER-002` can resume only after an owner can attach all of the
following:

1. Redacted issuer/bank sandbox credential reference plus allowlist path
2. Issuer-approved allowed test card / reference fixture matrix
3. Real sandbox outcome evidence for `eligible`, `ineligible`, and
   `manual_review`
4. Real sandbox timeout / retry evidence
5. Booking record linkage showing `eligibilityVerificationId`
6. Billing/reporting linkage showing invoice/export propagation
7. Audit-row linkage showing masked reference handling

If trunk needs the reserved hold-state sidecar path before those inputs arrive,
replay the clean restore from `origin/codex2/ph1gc-partner-002@bddba93c` onto a
fresh `origin/dev` branch instead of merging this older audit lineage.

Once the external inputs exist, update this sidecar with dated evidence
pointers and only then promote the workflow gate read to
`PASS (sandbox evidence)`.

---

## 7. Verification Notes

Verification in this task was source review and branch-lineage validation only:

- confirmed `origin/dev` still lacks `support/sidecars/PARTNER-ELIG-LIVE-001/`
- confirmed the clean replay branch is `origin/codex2/ph1gc-partner-002@bddba93c`
- confirmed the current `codex/ph1gc-partner-002` branch is older audit
  history and should not claim merge-readiness
- confirmed the partner spec still requires real issuer sandbox evidence and
  rejects mocked card data
- confirmed `EXT-001` still defines the same unresolved external input set

No live issuer sandbox probe was executed in this task because the required
external credentials, allowed test cards, and approvals are still absent.

## 8. Repository Re-Verification

The following repo-local materials were re-checked and are **not** acceptable
substitutes for directive section E sandbox evidence:

- `docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md`
  defines the contract and lists the required sandbox proof set, but does not
  include issuer-issued evidence.
- `tests/e2e/E2E-007-partner-airport-transfer.sh` and
  `tests/e2e/E2E-008-partner-booking-cutover.sh` exercise repo-local/system
  flows, but they do not prove execution against a real issuer sandbox with an
  issuer-approved test card.
- `tests/unit/*`, UAT docs, and reporting/billing specs mention
  `eligibilityVerificationId`, `manual_review`, and downstream linkage fields,
  but those are contract assertions, not sandbox transcripts.
- `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md` still declares
  `EXT-001-BLK-001` through `EXT-001-BLK-006` open, which means the credential,
  fixture, timeout, manual-review approval, and data-handling prerequisites are
  still unmet.

Therefore the only defensible machine-truth outcome remains:

- `PH1GC-PARTNER-002` = `blocked_external`
- `WF-PARTNER-001` must not be upgraded to `PASS (sandbox evidence)`
- this sidecar remains a hold packet until real issuer sandbox evidence is
  attached
