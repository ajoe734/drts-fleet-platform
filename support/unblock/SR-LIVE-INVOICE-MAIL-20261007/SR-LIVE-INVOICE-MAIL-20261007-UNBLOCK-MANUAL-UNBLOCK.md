# SR-LIVE-INVOICE-MAIL-20261007-UNBLOCK-MANUAL-UNBLOCK

## Blocker Diagnosis
The parent task `SR-LIVE-INVOICE-MAIL-20261007` PR #2425 has been successfully merged into `dev` after source review approval by `Codex`. The automated source code checks have passed (`ci_status: success`), meaning source readiness is satisfied.

However, the task remains explicitly blocked on manual operator acceptance testing. The parent's next step already records a failed `workflow_dispatch` run `37689594180`. As independently observed in the run log (job 113026069488), the `input-validation` preflight failed (exit 1). Variables including `DRTS_LIVE_INVOICE_MAIL_TEST_AUTHORIZED`, `API_ORIGIN`, `PORTAL_ORIGIN`, `ALLOWED_TARGETS`, primary fixture tenant/actor/invoice, non-allowlisted fixture, read-only fixture/recipient, and `INVITATION_ROLE_CODE` were empty in that run. Auth/provider/session/browser steps were skipped; final gate failed for missing/failed cleanup evidence. This failure stems from required configuration mapped in `.github/workflows/live-invoice-mail-acceptance.yml:47-61,109-119` and `session-bootstrap.ts invoiceEnvironmentToMailEnvironment`. Repeating the dispatch alone does not clear the known blocker.

## AI_COLLABORATION_GUIDE 0.7 Mapping
- **Content**: Task-scoped artifact diagnosing the remaining blocker and detailing the exact manual operator unblock steps.
- **Source**: `support/unblock/SR-LIVE-INVOICE-MAIL-20261007/SR-LIVE-INVOICE-MAIL-20261007-UNBLOCK-MANUAL-UNBLOCK.md`.
- **Check**: No automated product testing possible; exact source/log/metadata inspection establishes findings.
- **Evidence**: Commit/PR evidence for this helper task, and the failed run log `https://github.com/ajoe734/drts-fleet-platform/actions/runs/37689594180/job/113026069488`.
- **Remaining Limit**: The parent external live acceptance gate limit remains active.

## Unblock Action (Next Step)
The workflow requires an exact deployed candidate SHA. The parent candidate was `e901ba057a09e4590fa723211bdc1f6ad482ac98`, and the merge SHA is `e788524839c6b7640b64b110b62786815f3e7b51`. Do not equate merge with deployment; an actual runtime match is required.

The remaining blocker requires an authorized operator/Supervisor to:
1. Establish approved runtime/recipient/fixture configuration.
2. Verify the deployed source SHA and deployment window.
3. Manually trigger the `Live Mail Acceptance` workflow against the `dev` branch with the verified deployed SHA:
   `gh workflow run 377833148 --ref dev -f candidate_sha=<verified-full-deployed-source-sha>`
4. Map all four `required_acceptance` keys to real successful evidence and use same-candidate `record-acceptance`:
   - `reviewed_invoice_live_harness_same_sha_ci`: Hosted same-SHA CI passed evidence.
   - `authorized_invoice_runtime_recipient_and_fixture`: Authorized runtime/recipient/fixture/role evidence.
   - `genuine_invoice_mail_provider_inbox_and_download`: Genuine hosted provider/inbox/browser/download evidence.
   - `invoice_idempotency_failure_readback_and_cleanup`: Genuine product idempotency/failure readback and scoped cleanup evidence.
