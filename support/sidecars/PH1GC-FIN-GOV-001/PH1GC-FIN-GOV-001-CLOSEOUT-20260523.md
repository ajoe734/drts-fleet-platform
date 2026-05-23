# PH1GC-FIN-GOV-001 — Closeout Report

Date: 2026-05-23
Task: `PH1GC-FIN-GOV-001`
Authority: directive §H `FIN-GOV-001` — `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md`

This closeout follows the directive §7 format. It records what landed on `origin/dev` for the governance-aware billing/reporting slice, the 13-field verification body coverage, the directive-mandated verification commands, and the external dependencies that remain on adjacent tasks.

---

## Directive §7 closeout body

```text
Task ID:                       PH1GC-FIN-GOV-001
Owner:                         Claude
Reviewer:                      Codex
Branch:                        claude/ph1gc-fin-gov-001 (base: dev)
PR:                            #237 (PH1GC-DOC-BATCH-1) merged spec + UAT; #256 (PH1GC-E2E-010) merged the executable proof; this closeout is owner finalize on the post-review branch.
Commit:                        Recorded by ai-status.sh done at closeout time (see machine truth COMMIT_HASH after push).
Files changed:                 support/sidecars/PH1GC-FIN-GOV-001/PH1GC-FIN-GOV-001-CLOSEOUT-20260523.md
                               (the canonical artifacts — spec, UAT, E2E-010 — already live on origin/dev via #237 / #256 and are not re-modified by this closeout.)
Verification commands:         bash -n tests/e2e/E2E-010-governance-aware-billing-reporting.sh
                               STRICT_VERIFICATION_BODY=1 bash -n tests/e2e/E2E-010-governance-aware-billing-reporting.sh
                               bash tests/e2e/run-e2e.sh --suite 010 --dry-run
                               git diff --check origin/dev...HEAD
                               git cat-file -e origin/dev:docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md
                               git cat-file -e origin/dev:docs/04-uat/governance-aware-billing-reporting-uat-20260519.md
                               git cat-file -e origin/dev:tests/e2e/E2E-010-governance-aware-billing-reporting.sh
Evidence artifact:             docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md
                               docs/04-uat/governance-aware-billing-reporting-uat-20260519.md
                               tests/e2e/E2E-010-governance-aware-billing-reporting.sh
                               support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md (prior static evidence pack)
                               support/sidecars/PH1GC-FIN-GOV-001/PH1GC-FIN-GOV-001-CLOSEOUT-20260523.md (this file)
Workflow family affected:      WF-FIN-GOV-001 (depends on WF-TGV-001 + WF-FIN-001; not a rename of WF-FIN-001)
Gate read before:              WF-FIN-GOV-001 = PASS (static evidence)
Gate read after:               WF-FIN-GOV-001 = PASS (static evidence) — uplift to PASS (live staging evidence) requires the matrix-row mechanical update (PH1GC-MATRIX-001) and a green STRICT_VERIFICATION_BODY=1 governed staging rerun. This task does not claim the live uplift has occurred.
Remaining non-claim:           No claim that WF-FIN-GOV-001 has reached PASS (live staging evidence).
                               No claim that a governed staging rerun has produced a reviewer-readable invoice/report artifact.
                               No claim that the staging IAP/WIF/IAM token-mint path is repaired.
                               No claim that the WF-FIN-GOV-001 row has been physically inserted into the release-gate matrix on origin/dev (that is PH1GC-MATRIX-001's mechanical edit).
External dependencies, if any: PH1GC-MATRIX-001 (release-gate matrix row insertion).
                               Staging IAM/IAP token-mint repair (Gemini lane infra). Current symptom: GitHub Actions staging-e2e-010 fails at "Mint IAP verification token" with `403 Permission 'iam.serviceAccounts.getOpenIdToken' denied`; `STAGING_WIF_PROVIDER` is absent from repo secrets.
                               GitHub Actions environment `staging` reviewer + secret configuration.
```

---

## 1. Delivered scope (already on origin/dev)

| Acceptance item                                                                                       | Status on origin/dev | Landing commit                                                          |
| ----------------------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------- |
| `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md` visible on origin/dev      | satisfied            | `6607dea8` (PH1GC-DOC-BATCH-1, PR #237)                                 |
| `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md` visible on origin/dev                | satisfied            | `6607dea8` (PH1GC-DOC-BATCH-1, PR #237)                                 |
| UAT covers all 13 directive §H verification-body fields                                               | satisfied            | UAT §2 + §3 reference every field; see §2 below                         |
| `PH1GC-E2E-010` script asserts every field listed in the verification body                            | satisfied            | `49b49a25` (PH1GC-E2E-010, PR #256); `REQUIRED_KEYS=(…)` contains 13    |
| Closeout report follows directive §7 format                                                           | satisfied            | this file                                                               |
| Gate-read update for `WF-FIN-GOV-001` = PASS (live staging evidence) drives matrix change             | **deferred**         | gated externally — see §3 "Remaining non-claim" and §4 "Out-of-scope"   |

The deferred acceptance line is consistent with directive §H, which mandates the executable proof and the verification body but does not require this task to perform the matrix-row insertion (that is PH1GC-MATRIX-001) or to repair the staging IAM rail. The reviewer (Codex) already approved this task at `review_approved`, recognizing that the in-scope deliverables are satisfied and the live-staging uplift remains externally gated.

---

## 2. 13-field verification-body coverage

Directive §H lists the verification body as 13 lines. The UAT scenario set and the E2E-010 script both cover them:

| #   | Field                       | UAT coverage                                                                                        | E2E-010 assertion                                                                                |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | `costCenterCode`            | `UAT-FIN-GOV-001`, `-004`, `-005`, `-006`, `-007`, `-009`                                           | `REQUIRED_KEYS[*]` `has(.)` check + happy-path value assertion (`billing.costCenterCode==CC-A`)  |
| 2   | `costCenterName`            | `UAT-FIN-GOV-001` assert clause                                                                     | `REQUIRED_KEYS[*]` `has(.)` check                                                                |
| 3   | `ownerUserId`               | `UAT-FIN-GOV-001` assert clause                                                                     | `REQUIRED_KEYS[*]` `has(.)` check + chain assert (`billing.ownerUserId==OWNER_USER_ID`)          |
| 4   | `ownerName`                 | `UAT-FIN-GOV-001` assert clause                                                                     | `REQUIRED_KEYS[*]` `has(.)` check                                                                |
| 5   | `legacy_unmapped`           | `UAT-FIN-GOV-001` assert clause; integrity test `UAT-FIN-GOV-011`                                   | `REQUIRED_KEYS[*]` `has(.)` check                                                                |
| 6   | `approvalEvaluationId`      | `UAT-FIN-GOV-001`, `-002`, `-005`                                                                   | `REQUIRED_KEYS[*]` `has(.)` check                                                                |
| 7   | `approvalRequestId`         | `UAT-FIN-GOV-001` + `UAT-FIN-GOV-002` manual-approval trace                                         | `REQUIRED_KEYS[*]` `has(.)` check                                                                |
| 8   | `approvalState`             | `UAT-FIN-GOV-001`, `-002`, `-003`, `-008`                                                           | `REQUIRED_KEYS[*]` `has(.)` check + chain assert (`billing.approvalState==approved`)             |
| 9   | `quotaPeriodKey`            | `UAT-FIN-GOV-001`, `-004`, `-006`, `-007`                                                           | `REQUIRED_KEYS[*]` `has(.)` check + chain assert (`billing.quotaPeriodKey==QUOTA_PERIOD_KEY`)    |
| 10  | `quotaUsageDelta`           | `UAT-FIN-GOV-001`, `-004`, `-012`                                                                   | `REQUIRED_KEYS[*]` `has(.)` check + non-null assert                                              |
| 11  | `partnerProgramCode`        | `UAT-FIN-GOV-005`, `-013`                                                                           | `REQUIRED_KEYS[*]` `has(.)` check (null OK on non-partner path)                                  |
| 12  | `eligibilityVerificationId` | `UAT-FIN-GOV-005`                                                                                   | `REQUIRED_KEYS[*]` `has(.)` check                                                                |
| 13  | `platformEarningsRef`       | `UAT-FIN-GOV-006`                                                                                   | `REQUIRED_KEYS[*]` `has(.)` check (null OK on owned path)                                        |
| —   | chain: `auditId`            | `UAT-FIN-GOV-001`, `-009`, `-010`, `-011`, `-013`                                                   | `AUDIT_ID=$(json_get_first '.data[].auditId')` + audit-target chain assert (line 304)            |
| —   | chain: `reportArtifactId`   | `UAT-FIN-GOV-001`, `-012`                                                                           | `REPORT_ARTIFACT_ID` non-empty assert (line 230)                                                 |

`auditId` and `reportArtifactId` are listed in directive §H as a single chain entry (`auditId / reportArtifactId`); the E2E asserts both alongside the 13-key body. Strict mode (`STRICT_VERIFICATION_BODY=1`) hard-fails if any field is left `NOT_POPULATED`, so the script does not silently pass with placeholders.

---

## 3. Verification result on this branch

Repo-local verification was rerun on this branch on 2026-05-23 against the artifacts that already live on `origin/dev`:

- `bash -n tests/e2e/E2E-010-governance-aware-billing-reporting.sh` — passed.
- `STRICT_VERIFICATION_BODY=1 bash -n tests/e2e/E2E-010-governance-aware-billing-reporting.sh` — passed.
- `git diff --check origin/dev...HEAD` — passed.
- `git cat-file -e origin/dev:docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md` — passed.
- `git cat-file -e origin/dev:docs/04-uat/governance-aware-billing-reporting-uat-20260519.md` — passed.
- `git cat-file -e origin/dev:tests/e2e/E2E-010-governance-aware-billing-reporting.sh` — passed.
- `awk '/^REQUIRED_KEYS=\(/,/^\)/' tests/e2e/E2E-010-governance-aware-billing-reporting.sh | grep -cE '^[[:space:]]+[a-zA-Z_]+[[:space:]]*$'` — `13`.

A live `WF-FIN-GOV-001` staging rerun was **not** executed by this closeout because the staging IAP/WIF token-mint path remains externally blocked (see §4).

---

## 4. Out-of-scope for this closeout

The following items belong to adjacent tasks and external work, not to `PH1GC-FIN-GOV-001`:

- **`PH1GC-MATRIX-001`** — mechanical insertion of the `WF-FIN-GOV-001` row into `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` on `origin/dev`. Directive §B `MATRIX-001` enumerates this and four other matrix-row inserts as a single batched mechanical change; performing it inside `PH1GC-FIN-GOV-001` would conflate two different task scopes.
- **Staging IAM/IAP/WIF repair** — the governed staging rerun is gated on `STAGING_WIF_PROVIDER` being configured in repo secrets and on `iam.serviceAccounts.getOpenIdToken` being granted to the runtime service account. This is an infra task tracked through the Gemini lane and is not in `PH1GC-FIN-GOV-001`'s scope.
- **Live governed rerun + reviewer-readable artifact capture** — once the matrix row exists and the staging auth path is repaired, a green `STRICT_VERIFICATION_BODY=1` rerun against staging plus the resulting invoice/report artifact uplift `WF-FIN-GOV-001` to `PASS (live staging evidence)`. That uplift is recorded against `WF-FIN-GOV-001`'s gate row, not against this task.

This closeout therefore finalizes the directive §H deliverables that landed on `origin/dev` and explicitly retains the live-staging uplift as a tracked external dependency, in line with directive §9 ("不得用 sidecar produced 取代 live / sandbox evidence" / "不得把 external credential 缺失寫成『完成』").
