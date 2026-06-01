# PH1GC-FIN-GOV-001 Manual Unblock

## Scope

- Task: `PH1GC-FIN-GOV-001-UNBLOCK-MANUAL-UNBLOCK`
- Parent: `PH1GC-FIN-GOV-001`
- Owner: `Codex`
- Reviewer: `Gemini2`
- Audit date: `2026-05-24`

## Current Diagnosis

`PH1GC-FIN-GOV-001` is no longer blocked by missing repo-local spec, UAT, or
E2E wiring. The remaining blocker is now a single live-staging evidence gap.

What is already true:

1. The directive-path spec and UAT are already on `origin/dev` via commit
   `6607dea8b788ef2ab6f01a2ab14c6dbd8ab48e21`.
   - `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`
   - `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md`
2. `PH1GC-E2E-010` is already closed on `origin/dev` via commit
   `49b49a25002a611c5b3433e3ee36c11a73fb7b83`
   (`PH1GC-E2E-010: governance-aware billing/reporting E2E script (#256)`).
3. The parent delivery branch
   `origin/codex/ph1gc-fin-gov-001-rebased-20260523@53bd62c16a84e3ffe3ea9d89ca4e4e08d6f570fd`
   already carries the repo-local release-gate chain:
   - `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` has
     `WF-FIN-GOV-001 = PASS (static evidence)`, with explicit wording that the
     uplift to `PASS (live staging evidence)` requires a green
     `STRICT_VERIFICATION_BODY=1` rerun.
   - `docs/04-uat/fbp-014a-e2e-matrix.md` has the `E2E-010` row and documents
     default-mode vs strict-mode behavior for the governance verification body.
   - `tests/e2e/README.md` marks `E2E-010` as a shell whose live uplift is
     still blocked pending a governed staging rerun.
   - `support/sidecars/PH1GC-FIN-GOV-001/PH1GC-FIN-GOV-001-CLOSEOUT.md`
     truthfully keeps the family at `PASS (static evidence)`.

The remaining blocker is therefore not a missing file or missing repo-local
implementation branch. It is the inability to obtain reviewer-usable live
staging evidence for the governed `WF-FIN-GOV-001` rerun.

## Latest Blocking Evidence

The most recent reviewer-readable attempt is GitHub Actions run
`26363924897` on `2026-05-24`, against branch
`codex/ph1gc-fin-gov-001-rebased-20260523` at commit
`f6ddefffbc8ca27812d538a9cf102bc330b58fea`.

Observed job state:

1. `staging-e2e-010` job `77604277310` successfully completed:
   - `Validate staging GitHub config`
   - `Authenticate to GCP`
   - `Set up Cloud SDK`
   - `Best-effort fetch internal key`
2. The same job then failed at:
   - `Mint IAP verification token`
   - error: `403 Permission 'iam.serviceAccounts.getOpenIdToken' denied`
3. Because token minting failed before the E2E shell could start:
   - `Syntax check E2E-010` was skipped
   - `Run E2E-010 against staging` was skipped
   - no `e2e-010-console.log`, `e2e-010-evidence.log`, or
     `e2e-010-chain.json` was produced as reviewer-readable output
   - no governed invoice/report artifact exists for `WF-FIN-GOV-001`

This confirms the current blocker is the staging IAP/OpenID-token path, not the
earlier repo-local E2E/matrix dependency chain.

## Remaining Blocker

`PH1GC-FIN-GOV-001` remains blocked on one concrete external dependency:

1. the staging deployer / WIF service-account path still cannot mint an
   email-bearing OpenID token that IAP accepts for the governed `E2E-010`
   staging rerun

Until that permission gap is cleared, the parent cannot satisfy its acceptance
item:

- `Gate-read update for WF-FIN-GOV-001 = PASS (live staging evidence) drives matrix change.`

The truthful gate read remains `PASS (static evidence)`, not
`PASS (live staging evidence)`.

## Parent Resume Sequence

The parent's next actionable path is now:

1. Keep `PH1GC-FIN-GOV-001` in `blocked`; do not reopen a repo-local code/doc
   subtask for `E2E-010` or the matrix row.
2. Restore a non-interactive staging bearer path that can mint an email-bearing
   IAP token for the governed rerun.
   - On the GitHub Actions path, this specifically means granting the staging
     deployer identity the permission required to mint OpenID tokens
     (`iam.serviceAccounts.getOpenIdToken`).
   - If the workflow still needs `gcloud`-based secret access, the same path
     may also need `iam.serviceAccounts.getAccessToken`.
3. Rerun `ci-integ.yml` with `run_staging_e2e_010=true` against the current
   owner branch head
   `origin/codex/ph1gc-fin-gov-001-rebased-20260523@53bd62c16a84e3ffe3ea9d89ca4e4e08d6f570fd`.
4. Only after that rerun produces:
   - a green `STRICT_VERIFICATION_BODY=1` governed `E2E-010` execution, and
   - reviewer-readable invoice/report evidence for the governed body
   should the owner uplift `WF-FIN-GOV-001` from `PASS (static evidence)` to
   `PASS (live staging evidence)` and close the parent.

## Conclusion

This helper no longer points the parent at a missing E2E or matrix dependency.
It narrows the blocker to the current live-evidence gate:

- repo-local spec/UAT/E2E wiring exists
- the parent delivery branch already carries the truthful `PASS (static evidence)`
  release posture
- the only remaining unblock step is restoring IAP/OpenID token minting so the
  governed staging rerun can produce live evidence

## Delivery Evidence

- Diagnosis artifact branch: `codex/ph1gc-fin-gov-001-unblock-manual-unblock`
- Diagnosis artifact PR: `#243` against `dev`
- Parent evidence branch under analysis:
  `origin/codex/ph1gc-fin-gov-001-rebased-20260523`
- Latest blocking CI evidence:
  `https://github.com/ajoe734/drts-fleet-platform/actions/runs/26363924897`
