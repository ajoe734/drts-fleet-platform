# PH1GC-FIN-GOV-001 — Closeout Report

Task ID: `PH1GC-FIN-GOV-001`
Owner: `Codex2`
Reviewer: `Claude`
Branch: `codex2/ph1gc-fin-gov-001`
PR: not opened from this branch
Status: `blocked`
Current branch head: `aac5ba47` (`wip(PH1GC-FIN-GOV-001): anchor closeout head evidence current`)
Files changed:
- `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`
- `docs/03-runbooks/phase1-release-truth-sync-20260519.md`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
- `docs/04-uat/fbp-014a-e2e-matrix.md`
- `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md`
- `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`
- `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md`
- `support/sidecars/PH1GC-FIN-GOV-001/PH1GC-FIN-GOV-001-CLOSEOUT.md`
- `tests/e2e/E2E-010-governance-aware-billing-reporting.sh`
- `tests/e2e/README.md`
- `tests/e2e/run-e2e.sh`
Verification commands:
- `bash -n tests/e2e/E2E-010-governance-aware-billing-reporting.sh`
- `STRICT_VERIFICATION_BODY=1 bash -n tests/e2e/E2E-010-governance-aware-billing-reporting.sh`
- `bash tests/e2e/run-e2e.sh --suite 010 --dry-run`
- `curl -i -sS --max-time 20 https://api.staging.drts-fleet.cctech-support.com/api/health`
- `gh secret list --repo ajoe734/drts-fleet-platform | grep 'WIF'`
- `git diff --check`
Evidence artifact:
- `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md`
- `support/sidecars/PH1GC-FIN-GOV-001/PH1GC-FIN-GOV-001-CLOSEOUT.md`
Workflow family affected:
- `WF-FIN-GOV-001`
Gate read before:
- `PASS (static evidence)`
Gate read after:
- `PASS (static evidence)`; live uplift still blocked
Remaining non-claim:
- No claim that `WF-FIN-GOV-001` is already `PASS (live staging evidence)`
- No claim that every governance verification-body field is populated on the current reachable staging runtime
- No claim that the staging IAP/WIF/IAM path is repaired
External dependencies, if any:
- email-bearing staging IAP bearer path
- staging WIF provider configuration
- successful governed staging rerun with `STRICT_VERIFICATION_BODY=1`

## Delivered Scope

This branch reconciles the governance-aware billing/reporting artifact chain to the owner lane:

1. Spec and UAT authority lines now point back to directive §H while preserving execution-worklist and alignment-audit cross references.
2. The spec explicitly separates always-hard-fail contract regressions from mandatory 13-field recording, and defines `STRICT_VERIFICATION_BODY=1` as the gate-keeper for any future live-staging uplift.
3. The UAT uplift rule now requires both field recording and a green strict-mode `E2E-010` run.
4. `E2E-010` now records every verification-body field in all runs and hard-fails in strict mode if any field is still `NOT_POPULATED`.
5. Release-truth and blueprint-alignment wording now state that `WF-FIN-GOV-001` remains `PASS (static evidence)` until a governed staging rerun passes strict mode.
6. The evidence pack now includes a 2026-05-23 revalidation showing the protected host still returns unauthenticated IAP redirect and the repo still lacks `STAGING_WIF_PROVIDER`.

## Current Acceptance Read

- Acceptance items 1, 2, 3, 4, and 6 are satisfied on this branch.
- Acceptance item 5 remains blocked by staging auth, not by missing repo artifacts.

## 2026-05-23 Revalidation

- `bash -n tests/e2e/E2E-010-governance-aware-billing-reporting.sh` passed.
- `STRICT_VERIFICATION_BODY=1 bash -n tests/e2e/E2E-010-governance-aware-billing-reporting.sh` passed.
- `bash tests/e2e/run-e2e.sh --suite 010 --dry-run` listed `E2E-010-governance-aware-billing-reporting.sh`.
- `git diff --check origin/dev...HEAD` passed.
- `curl -i -sS --max-time 20 https://api.staging.drts-fleet.cctech-support.com/api/health` still returns `HTTP/2 302` with body `Invalid IAP credentials: empty token`.
- `gh secret list --repo ajoe734/drts-fleet-platform | grep 'WIF'` shows `DEV_WIF_PROVIDER`, `DEV_WIF_SERVICE_ACCOUNT`, `STAGING_WIF_SERVICE_ACCOUNT`, `WIF_PROVIDER`, and `WIF_SERVICE_ACCOUNT`; `STAGING_WIF_PROVIDER` is still absent.

## Blocker

Fresh 2026-05-23 validation still shows:

- `https://api.staging.drts-fleet.cctech-support.com/api/health` returns `302` with `Invalid IAP credentials: empty token`
- local human `gcloud` accounts remain unusable for non-interactive token minting
- repo secrets show `STAGING_WIF_SERVICE_ACCOUNT` but not `STAGING_WIF_PROVIDER`

Until a valid staging bearer path exists and a governed rerun can pass `STRICT_VERIFICATION_BODY=1`, this task should stay in `progress` or move to `blocked`, not `done`.
