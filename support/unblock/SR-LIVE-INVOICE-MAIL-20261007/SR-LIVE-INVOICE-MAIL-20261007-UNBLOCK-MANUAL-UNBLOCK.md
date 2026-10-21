# SR-LIVE-INVOICE-MAIL-20261007-UNBLOCK-MANUAL-UNBLOCK

Path: `support/unblock/SR-LIVE-INVOICE-MAIL-20261007/SR-LIVE-INVOICE-MAIL-20261007-UNBLOCK-MANUAL-UNBLOCK.md`

## Blocker Diagnosis (F1)
The parent task `SR-LIVE-INVOICE-MAIL-20261007` PR #2425 has been successfully merged into `dev` after source review approval by `Codex`. The automated source code checks have passed (`ci_status: success`), meaning source readiness is satisfied.

However, the task remains explicitly blocked on manual operator acceptance testing. The parent's next step already records a failed `workflow_dispatch` run `37689594180`. As independently observed in the run log (job 113026069488), the `input-validation` preflight failed (exit 1). Variables including `DRTS_LIVE_INVOICE_MAIL_TEST_AUTHORIZED`, `API_ORIGIN`, `PORTAL_ORIGIN`, `ALLOWED_TARGETS`, primary fixture tenant/actor/invoice, non-allowlisted fixture, read-only fixture/recipient, and `INVITATION_ROLE_CODE` were empty in that run. Auth/provider/session/browser steps were skipped; final gate failed for missing/failed cleanup evidence. This failure stems from required configuration mapped in `.github/workflows/live-invoice-mail-acceptance.yml:47-61,109-119` and `session-bootstrap.ts` `createInvoiceMailEnvAdapter` (called by `validateMailSessionInputs`). Repeating the dispatch alone does not clear the known blocker.

## Review History and Evidence Traceability (F2)
- **Previous Rejections**:
  - `b534cc59963b6754798fe4d9b403f2860df1d926` (rejected for missing source evidence).
  - `8a3e92c2102a1cdb97503d85e3c3eef429be9f75` (rejected for F3 unresolved disposition, and incomplete F2 path/symbol mappings).
- **Rejection Receipt**: "F3 [P1, SAME DEFECT SECOND CONSECUTIVE REVIEW: parent disposition/handoff still not persisted]... F2 [P2, remaining section0.7 evidence traceability]... Correct the copied source symbol at line6: actual session-bootstrap.ts export is createInvoiceMailEnvAdapter (line105), called by validateMailSessionInputs (line121)"
- **Successor Identity**: Current helper PR #2426.
- **Source/Log Checks**:
  - `git diff --check HEAD^ HEAD`: PASS
  - `python3 tools/ci/git/check_commit_trailers.py --base HEAD~3 --head HEAD`: PASS
  - `python3 tools/ci/git/check_canonical_consistency.py --ci --base HEAD^ --head HEAD`: PASS
  - `gh run view 37689594180 --job 113026069488 --log-failed`: Confirmed exit 1 for preflight and final gate failures.
- **Complete Paths**: File being updated is `support/unblock/SR-LIVE-INVOICE-MAIL-20261007/SR-LIVE-INVOICE-MAIL-20261007-UNBLOCK-MANUAL-UNBLOCK.md`
- **Pending External Items**: Hosted same-SHA CI is in progress for this documentation change; product/runtime tests are N/A.

## Parent State Repair (F3 - Resolved)
The parent task disposition has now been successfully repaired and persisted via legitimate Supervisor CLI, confirming the proper operational route. The previous attempt incorrectly used `waiting_for="Supervisor"` which was rejected because Supervisor is a control actor, not a registered agent. The correct route is via the registered agent `Pi`.
Actual readbacks from `.local/full-system-completion-20261008/metadata-readbacks.json`:
- `resolved_parent_status`: "blocked"
- `resolved_parent_next`: "Operator Pi under authorized Supervisor control FIRST obtains approved invoice authorization/runtime/recipient and exactlythree lawfulfixture/role sessions from actual authority; missing DRTS_LIVE_INVOICE_MAIL_* vars caused real37689594180 input-validationexit1 andcleanupgatefail (notjustdispatchpermission). Preserve merged harness e901ba057a09e4590fa723211bdc1f6ad482ac98/e788524839c6b7640b64b110b62786815f3e7b51 andsourceCI/review; currentruntime212 from37683644385 deployed+healthpassedbut12/16operational, notnewrunnerproof. SECOND verify immutabledeployedSHA includesreviewedrunner/producers andnoactive/scheduleddeploythroughteardown. THEN authorized exactcandidate_sha dispatch, allfour requiredkeys/source-runtimefixture/inboxMessageID/controlleddownload/idempotency-cleanup realproof. No fakeJWT/actors/recipient, fixedmailaliases notGoogleidentity; billing-profile zero-send authz checks/signingvsprivateinvoker remain. Parent blocked; ownerGemini2/reviewerCodex andsourceevidence unchanged. ActualCLI rejects waiting_for=Supervisor becauseSupervisor iscontrolactor, notregisteredagent; legally route operationalcoordination toregisteredPi, notnewidentity orrolebypass."
- `resolved_parent_waiting_for`: "Pi"

## Unblock Action (Next Step)
The workflow requires an exact deployed candidate SHA. The parent candidate was `e901ba057a09e4590fa723211bdc1f6ad482ac98`, and the merge SHA is `e788524839c6b7640b64b110b62786815f3e7b51`. Do not equate merge with deployment; an actual runtime match is required.

The remaining blocker requires the authorized operator `Pi` (under Supervisor coordination) to:
1. Establish approved runtime/recipient/fixture configuration.
2. Verify the deployed source SHA and deployment window.
3. Manually trigger the `Live Mail Acceptance` workflow against the `dev` branch with the verified deployed SHA:
   `gh workflow run 377833148 --ref dev -f candidate_sha=<verified-full-deployed-source-sha>`
4. Map all four `required_acceptance` keys to real successful evidence and use same-candidate `record-acceptance`:
   - `reviewed_invoice_live_harness_same_sha_ci`: Hosted same-SHA CI passed evidence.
   - `authorized_invoice_runtime_recipient_and_fixture`: Authorized runtime/recipient/fixture/role evidence.
   - `genuine_invoice_mail_provider_inbox_and_download`: Genuine hosted provider/inbox/browser/download evidence.
   - `invoice_idempotency_failure_readback_and_cleanup`: Genuine product idempotency/failure readback and scoped cleanup evidence.
