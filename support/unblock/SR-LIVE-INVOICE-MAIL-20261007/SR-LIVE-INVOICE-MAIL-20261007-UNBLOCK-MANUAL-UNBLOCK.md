# SR-LIVE-INVOICE-MAIL-20261007-UNBLOCK-MANUAL-UNBLOCK

## Blocker Diagnosis (F1)
The parent task `SR-LIVE-INVOICE-MAIL-20261007` PR #2425 has been successfully merged into `dev` after source review approval by `Codex`. The automated source code checks have passed (`ci_status: success`), meaning source readiness is satisfied.

However, the task remains explicitly blocked on manual operator acceptance testing. The parent's next step already records a failed `workflow_dispatch` run `37689594180`. As independently observed in the run log (job 113026069488), the `input-validation` preflight failed (exit 1). Variables including `DRTS_LIVE_INVOICE_MAIL_TEST_AUTHORIZED`, `API_ORIGIN`, `PORTAL_ORIGIN`, `ALLOWED_TARGETS`, primary fixture tenant/actor/invoice, non-allowlisted fixture, read-only fixture/recipient, and `INVITATION_ROLE_CODE` were empty in that run. Auth/provider/session/browser steps were skipped; final gate failed for missing/failed cleanup evidence. This failure stems from required configuration mapped in `.github/workflows/live-invoice-mail-acceptance.yml:47-61,109-119` and `session-bootstrap.ts` `createInvoiceMailEnvAdapter` (called by `validateMailSessionInputs`). Repeating the dispatch alone does not clear the known blocker.

## Review History and Evidence Traceability (F2)
- **Previous Rejections**: Rejected candidates `b534cc59963b6754798fe4d9b403f2860df1d926` and `8a3e92c2102a1cdb97503d85e3c3eef429be9f75`. This artifact incorporates the required fixes from the reviews by `Codex`.
- **Successor Identity**: Current helper PR #2426.
- **Source/Log Checks**:
  - `git diff --check HEAD^ HEAD`: PASS
  - `python3 tools/ci/git/check_commit_trailers.py --base HEAD~2 --head HEAD`: PASS
  - `python3 tools/ci/git/check_canonical_consistency.py --ci --base HEAD^ --head HEAD`: PASS
  - `gh run view 37689594180 --job 113026069488 --log-failed`: Confirmed exit 1 for preflight and final gate failures.
- **Pending External Items**: Hosted same-SHA CI is in progress for this documentation change; product/runtime tests are N/A.

## Outstanding Parent State Repair (F3)
**F3 is currently acknowledged as unresolved.** The parent task disposition has not yet been properly persisted. The Supervisor must review this localization and bounded metadata repair, then use the canonical CLI to assign the required metadata:
`TASK_METADATA_JSON='{"resolved_parent_status":"blocked", "resolved_parent_next":"Missing approved authorization/runtime/recipient/fixture/role configuration FIRST, deployed SHA/window checks SECOND and authorized dispatch/evidence thereafter.", "resolved_parent_waiting_for":"Supervisor"}'`
This metadata must be applied to the helper task `SR-LIVE-INVOICE-MAIL-20261007-UNBLOCK-MANUAL-UNBLOCK` by the Supervisor so that `apply_unblock_parent_resolution` correctly propagates it upon merge.

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
