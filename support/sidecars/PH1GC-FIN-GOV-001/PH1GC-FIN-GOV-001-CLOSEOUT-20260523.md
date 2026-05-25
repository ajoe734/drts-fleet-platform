# PH1GC-FIN-GOV-001 — Closeout Report

Date: 2026-05-23 (initial); 2026-05-25 (Codex2 review reconciliation refresh)
Task: `PH1GC-FIN-GOV-001`
Owner: `Claude`
Reviewer: `Codex2`
Authority: directive §H `FIN-GOV-001` — `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md`
Predecessor evidence pack: `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md`

This closeout follows the directive §7 format. It records what landed on `origin/dev` (and what is staged on the owner branch for the next merge) for the governance-aware billing/reporting slice, the canonical 13-field verification body coverage, the directive-mandated verification commands, and the external dependencies that remain on adjacent tasks.

The 2026-05-25 refresh exists because reviewer `Codex2` reopened the prior closeout: the previous draft of this report counted `ownerName` + `approvalEvaluationId` as strict body fields and relegated `auditId` + `reportArtifactId` to "chain extras", which contradicts the spec's §3.8 directive-to-strict reconciliation now landing on this branch. The reconciliation aligns the closeout, the spec, the UAT, and the E2E script on the same canonical 13-field body.

---

## Directive §7 closeout body

```text
Task ID:                       PH1GC-FIN-GOV-001
Owner:                         Claude
Reviewer:                      Codex2
Branch:                        claude/ph1gc-fin-gov-001 (base: dev)
PR:                            #237 (PH1GC-DOC-BATCH-1) merged the initial spec + UAT; #256 (PH1GC-E2E-010) merged the executable proof; the owner-lane reconciliation PR (the next push from `claude/ph1gc-fin-gov-001`) layers the canonical 13-field reconciliation (spec §3.8, UAT §4, E2E `VB_FIELD_NAMES`) on top. Codex draft PR `#290` is the parallel-lane source of the same reconciliation; the content adopted here is the canonical 13-field interpretation captured by that draft.
Commit:                        Recorded by ai-status.sh done at closeout time (see machine truth COMMIT_HASH after push).
Files changed:                 docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md
                               docs/04-uat/governance-aware-billing-reporting-uat-20260519.md
                               tests/e2e/E2E-010-governance-aware-billing-reporting.sh
                               support/sidecars/PH1GC-FIN-GOV-001/PH1GC-FIN-GOV-001-CLOSEOUT-20260523.md
Verification commands:         bash -n tests/e2e/E2E-010-governance-aware-billing-reporting.sh
                               STRICT_VERIFICATION_BODY=1 bash -n tests/e2e/E2E-010-governance-aware-billing-reporting.sh
                               bash tests/e2e/run-e2e.sh --suite 010 --dry-run
                               git diff --check origin/dev...HEAD
                               git cat-file -e origin/dev:docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md
                               git cat-file -e origin/dev:docs/04-uat/governance-aware-billing-reporting-uat-20260519.md
                               git cat-file -e origin/dev:tests/e2e/E2E-010-governance-aware-billing-reporting.sh
                               awk '/^readonly -a VB_FIELD_NAMES=\(/,/^\)/' tests/e2e/E2E-010-governance-aware-billing-reporting.sh | grep -cE '^[[:space:]]+"[a-zA-Z_]+"[[:space:]]*$'   # → 13
                               grep -nE '^readonly EXPECTED_VB_FIELD_COUNT=13$' tests/e2e/E2E-010-governance-aware-billing-reporting.sh
Evidence artifact:             docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md (now contains §3.8 directive-to-strict reconciliation)
                               docs/04-uat/governance-aware-billing-reporting-uat-20260519.md (now contains §4 verification-body traceability table)
                               tests/e2e/E2E-010-governance-aware-billing-reporting.sh (`VB_FIELD_NAMES` 13-field inventory + strict-mode emitter)
                               support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md (prior static evidence pack)
                               support/sidecars/PH1GC-FIN-GOV-001/PH1GC-FIN-GOV-001-CLOSEOUT-20260523.md (this file)
Workflow family affected:      WF-FIN-GOV-001 (depends on WF-TGV-001 + WF-FIN-001; not a rename of WF-FIN-001)
Gate read before:              WF-FIN-GOV-001 = PASS (static evidence)
Gate read after:               WF-FIN-GOV-001 = PASS (static evidence) — uplift to PASS (live staging evidence) requires the matrix-row mechanical update (PH1GC-MATRIX-001) and a green STRICT_VERIFICATION_BODY=1 governed staging rerun. This task does not claim the live uplift has occurred.
Remaining non-claim:           No claim that WF-FIN-GOV-001 has reached PASS (live staging evidence).
                               No claim that a governed staging rerun has produced a reviewer-readable invoice/report artifact.
                               No claim that the staging IAP/WIF/IAM token-mint path is repaired.
                               No claim that the WF-FIN-GOV-001 row has been physically inserted into the release-gate matrix on origin/dev (that is PH1GC-MATRIX-001's mechanical edit).
                               No claim that every verification-body field is populated on the current runtime; the shell records missing fields as `NOT_POPULATED` and strict mode gates the uplift.
External dependencies, if any: PH1GC-MATRIX-001 (release-gate matrix row insertion).
                               Staging IAM/IAP token-mint repair (Gemini lane infra). Current symptom: GitHub Actions staging-e2e-010 fails at "Mint IAP verification token" with `403 Permission 'iam.serviceAccounts.getOpenIdToken' denied`; `STAGING_WIF_PROVIDER` is absent from repo secrets.
                               GitHub Actions environment `staging` reviewer + secret configuration.
```

---

## 1. Delivered scope on this branch

The 2026-05-25 reconciliation on `claude/ph1gc-fin-gov-001` reshapes the three task-owned artifacts so spec, UAT, and E2E all assert the same canonical 13-field verification body. The content for the reconciliation was sourced from the parallel-lane draft on `origin/codex/ph1gc-fin-gov-001` (Codex draft PR `#290`), which is the canonical interpretation Codex2's review is anchored against.

| Acceptance item                                                                                       | Status                                                                                                                                                                                          | Landing commit / next-merge target                                                                                                       |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md` visible on origin/dev      | Satisfied at the file-existence level by `6607dea8` (PR #237). The canonical §3.8 directive-to-strict reconciliation lands when this branch's reconciliation PR merges.                          | `6607dea8` baseline; reconciliation queued on `claude/ph1gc-fin-gov-001`                                                                  |
| `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md` visible on origin/dev                | Satisfied at the file-existence level by `6607dea8` (PR #237). The canonical §4 verification-body traceability table lands when this branch's reconciliation PR merges.                          | `6607dea8` baseline; reconciliation queued on `claude/ph1gc-fin-gov-001`                                                                  |
| UAT covers all 13 directive §H verification-body fields                                               | Satisfied. UAT §1 + §2 + §3 enumerate the canonical 13-field body, and §4 maps every field to a primary UAT scenario plus the corresponding `E2E-010` evidence path. Supplemental directive evidence (`ownerName`, approval-evaluation snapshot) is recorded separately so the directive is fully covered without inventing non-existent runtime fields. | Spec §3 + §3.8; UAT §1 + §4                                                                                                              |
| `PH1GC-E2E-010` script asserts every field listed in the verification body                            | Satisfied. `VB_FIELD_NAMES` enumerates the canonical 13 fields exactly, `EXPECTED_VB_FIELD_COUNT=13` is a `readonly` guard against drift, and `emit_verification_body_fields` records every field at the end of the run. Default-mode runs allow `NOT_POPULATED` as soft evidence; `STRICT_VERIFICATION_BODY=1` hard-fails the shell if any field is unpopulated. | `tests/e2e/E2E-010-governance-aware-billing-reporting.sh` lines 130–145 (`VB_FIELD_NAMES`), 217–240 (`emit_verification_body_fields`)    |
| Gate-read update for `WF-FIN-GOV-001` = PASS (live staging evidence) drives matrix change             | **Deferred** — gated externally. See §3 "Remaining non-claim" and §4 "Out-of-scope".                                                                                                            | `PH1GC-MATRIX-001` + Gemini-lane staging IAM/IAP/WIF repair                                                                              |
| Closeout report follows directive §7 format                                                           | Satisfied — this file.                                                                                                                                                                          | This file                                                                                                                                |

The deferred acceptance line is consistent with directive §H, which mandates the executable proof and the verification body but does not require this task to perform the matrix-row insertion (that is `PH1GC-MATRIX-001`) or to repair the staging IAM rail.

---

## 2. Canonical 13-field verification-body coverage

Directive §H's bullet list contains 13 lines. The 2026-05-25 spec §3.8 reconciles those 13 bullets to the strict 13-field verification body so the executable gate stays aligned with contracts that actually exist on `origin/dev`. The reconciliation moves `ownerName` and the `approvalEvaluationId` intent into supplemental evidence (still recorded), and promotes both `auditId` and `reportArtifactId` into the strict body.

| #   | Strict field                | Directive §H bullet                  | UAT coverage                                                                          | E2E-010 evidence path                                                       |
| --- | --------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | `costCenterCode`            | `costCenterCode`                     | `UAT-FIN-GOV-001`, `-004`, `-005`, `-006`, `-007`, `-009`                             | `FG-01 lineCostCenterCode`, final `VERIFY costCenterCode`                   |
| 2   | `costCenterName`            | `costCenterName`                     | `UAT-FIN-GOV-001`                                                                     | `FG-01 lineCostCenterName`, `FG-04 reportCostCenterField`, `VERIFY costCenterName` |
| 3   | `ownerUserId`               | `ownerUserId / ownerName` (id half)  | `UAT-FIN-GOV-001`                                                                     | `FG-01 lineOwnerUserId`, `FG-04 reportOwnerUserField`, `VERIFY ownerUserId` |
| 4   | `legacy_unmapped`           | `legacy_unmapped flag`               | `UAT-FIN-GOV-001`, `-011`                                                             | `FG-01 lineLegacyUnmapped`, `FG-04 reportLegacyUnmappedField`, `FG-07 coverage*`, `VERIFY legacy_unmapped` |
| 5   | `approvalRequestId`         | `approvalRequestId`                  | `UAT-FIN-GOV-001`, `-002`, `-003`, `-005`                                             | `FG-03 approvalRequestId`, `VERIFY approvalRequestId`                       |
| 6   | `approvalState`             | `approvalState`                      | `UAT-FIN-GOV-001`, `-002`, `-003`, `-008`                                             | `FG-01 lineApprovalState`, `FG-03 approvalRequestState`, `FG-04 reportApprovalStateField`, `VERIFY approvalState` |
| 7   | `quotaPeriodKey`            | `quotaPeriodKey`                     | `UAT-FIN-GOV-001`, `-004`, `-005`, `-006`                                             | `FG-02 quotaPeriodKey`, `VERIFY quotaPeriodKey`                             |
| 8   | `quotaUsageDelta`           | `quotaUsageDelta`                    | `UAT-FIN-GOV-001`, `-004`, `-012`                                                     | `FG-02 quotaUsageDelta`, `VERIFY quotaUsageDelta`                           |
| 9   | `partnerProgramCode`        | `partnerProgramCode`                 | `UAT-FIN-GOV-005`                                                                     | `FG-05 settlementPartnerProgramId`, `VERIFY partnerProgramCode`             |
| 10  | `eligibilityVerificationId` | `eligibilityVerificationId`          | `UAT-FIN-GOV-005`                                                                     | `FG-01 lineEligibilityVerificationId`, `VERIFY eligibilityVerificationId`   |
| 11  | `platformEarningsRef`       | `platformEarningsRef when forwarded` | `UAT-FIN-GOV-006`                                                                     | `FG-01 linePlatformEarningsRef`, `FG-06 platformEarningsRef`, `VERIFY platformEarningsRef` |
| 12  | `auditId`                   | `auditId / reportArtifactId` (audit half) | `UAT-FIN-GOV-001`, `-009`, `-010`, `-011`, `-012`, `-013`                          | `FG-08 invoiceAuditId`, `VERIFY auditId`                                    |
| 13  | `reportArtifactId`          | `auditId / reportArtifactId` (artifact half) | `UAT-FIN-GOV-001`, `-004`, `-005`, `-006`                                       | `FG-04 reportArtifactId`, `VERIFY reportArtifactId`                         |

Supplemental directive evidence (recorded but intentionally not promoted into the strict 13-field body on current contracts):

| Supplemental directive evidence | Why supplemental                                                                                                                                                       | UAT coverage                                                 | E2E-010 evidence path                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `ownerName`                     | Mutable display snapshot resolved at billing time; `ownerUserId` is the immutable reconciliation key.                                                                  | `UAT-FIN-GOV-001`                                            | `FG-01 lineOwnerName`, `FG-04 reportOwnerNameField`                                    |
| approval-evaluation snapshot (`approvalEvaluationId` intent) | `origin/dev` exposes approval lineage through `approvalRequestId` + the snapshot probe, not a distinct `approvalEvaluationId` contract. | `UAT-FIN-GOV-002`, `-003`                                    | `FG-03 evaluatedAt`, `FG-03 decision`, plus `approvalRequestId` / `approvalState` recorded as strict fields |

`STRICT_VERIFICATION_BODY=1` hard-fails the E2E if any of the 13 strict fields is recorded as `NOT_POPULATED`, so the script does not silently pass with placeholders. The supplemental fields above are always recorded for reviewer visibility but never promoted into the strict gate.

---

## 3. Verification result on this branch (2026-05-25 reconciliation pass)

Repo-local verification was rerun on this branch on 2026-05-25 against the reconciled artifacts:

- `bash -n tests/e2e/E2E-010-governance-aware-billing-reporting.sh` — passed.
- `STRICT_VERIFICATION_BODY=1 bash -n tests/e2e/E2E-010-governance-aware-billing-reporting.sh` — passed.
- `bash tests/e2e/run-e2e.sh --suite 010 --dry-run` — listed `E2E-010-governance-aware-billing-reporting.sh` exactly once.
- `git cat-file -e origin/dev:docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md` — passed (baseline file present; canonical §3.8 lands when this PR merges).
- `git cat-file -e origin/dev:docs/04-uat/governance-aware-billing-reporting-uat-20260519.md` — passed (baseline file present; canonical §4 lands when this PR merges).
- `git cat-file -e origin/dev:tests/e2e/E2E-010-governance-aware-billing-reporting.sh` — passed (baseline file present; canonical `VB_FIELD_NAMES` lands when this PR merges).
- `awk '/^readonly -a VB_FIELD_NAMES=\(/,/^\)/' tests/e2e/E2E-010-governance-aware-billing-reporting.sh | grep -cE '^[[:space:]]+"[a-zA-Z_]+"[[:space:]]*$'` — `13`.
- `grep -nE '^readonly EXPECTED_VB_FIELD_COUNT=13$' tests/e2e/E2E-010-governance-aware-billing-reporting.sh` — present.

A live `WF-FIN-GOV-001` staging rerun was **not** executed by this closeout because the staging IAP/WIF token-mint path remains externally blocked (see §4).

---

## 4. Out-of-scope for this closeout

The following items belong to adjacent tasks and external work, not to `PH1GC-FIN-GOV-001`:

- **`PH1GC-MATRIX-001`** — mechanical insertion of the `WF-FIN-GOV-001` row into `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` on `origin/dev`. Directive §B `MATRIX-001` enumerates this and four other matrix-row inserts as a single batched mechanical change; performing it inside `PH1GC-FIN-GOV-001` would conflate two different task scopes.
- **Staging IAM/IAP/WIF repair** — the governed staging rerun is gated on `STAGING_WIF_PROVIDER` being configured in repo secrets and on `iam.serviceAccounts.getOpenIdToken` being granted to the runtime service account. This is an infra task tracked through the Gemini lane and is not in `PH1GC-FIN-GOV-001`'s scope.
- **Live governed rerun + reviewer-readable artifact capture** — once the matrix row exists and the staging auth path is repaired, a green `STRICT_VERIFICATION_BODY=1` rerun against staging plus the resulting invoice/report artifact uplift `WF-FIN-GOV-001` to `PASS (live staging evidence)`. That uplift is recorded against `WF-FIN-GOV-001`'s gate row, not against this task.
- **Codex draft PR `#290`** — the parallel-lane source of the same canonical reconciliation. The content adopted here is functionally identical to the spec/UAT/E2E touched by that draft; coordination of which PR lands first is left to the supervisor / human gate-keeper. This closeout does not claim PR `#290` has been merged.

This closeout therefore finalizes the directive §H deliverables that landed on `origin/dev` (baseline files) and that are queued on `claude/ph1gc-fin-gov-001` (canonical 13-field reconciliation), and explicitly retains the live-staging uplift as a tracked external dependency, in line with directive §9 ("不得用 sidecar produced 取代 live / sandbox evidence" / "不得把 external credential 缺失寫成『完成』").
