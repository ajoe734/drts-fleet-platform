# TENANT-RULES-SLA-WEBHOOK-DURABLE-FLOW-20261015

Owner Codex; independent reviewer Codex2. R2 spec SHA256 `e1de6cd4199e688da73186e37f9eb79beddff1069ddc0f82869ec182b11c9cf3`. Baseline `ee731bba0` (full SHA below). This is an implementation checkpoint, not a candidate or acceptance claim.

Baseline full SHA: `ee731bba06354c219faed83a78db002e7a33144e`.

## Required acceptance descriptions (unchanged R2)

- `tenant_quota_rules_SLA_canonical_ACK_and_recovery`: All five original commands, real deferred/rejected/ACK repository and production controller/caller paths; no successful cache/audit/receipt before durable success, honest error, coherent failure/partial-write/retry and reconstructed state, original rules and SLA/tenant policy retained.
- `webhook_complete_commands_canonical_ack`: Actual endpoint create/update/manual-disable/secret-rotation commands wait for required durable ACK before success, correct canonical readback, audit and coherent failure handling; deferred and rejected real repository contract doubles prove before/fixed-after. Preserve no-repository behavior and original fields/roles/reasons/expiry/overlap/revalidation.
- `webhook_first_inflight_restart_payload_identity`: Actual producer commits recoverable first-attempt intent and original logical payload/deliveryId/tenant/event/key-version association before HTTP. A fresh service loaded only from persisted state resumes first interrupted attempts; existing retry policy, replay/dedupe and expired/revoked-secret boundaries remain intact; no fabricated delivered/new delivery identity.
- `webhook_successful_verification_authority`: Mounted authorized status-only API cannot bypass original successful tenant.webhook.test activation. Prove new/rotated/disabled→pending negative path plus successful current configuration verification and full valid UI/API create/edit/disable/rotate/retest/readback positive paths.
- `webhook_original_regressions_and_affected_callers`: Own unit/repository/controller tests show the three exact old failures and fixed-after behavior. Adapt only precise direct test callers to awaited ACK/legitimate verified setup without weakening old assertions. Preserve bytes/HMAC/status-only response semantics/deadline/backoff/failure notification/noDB/tenant scope binding/secret expiry/rotation/restart completed dedupe and passenger.* separate retry owner. Real receiver cases only on existing authorized hosted runner, no VM servers.
- `exact_candidate_independent_review_ci_merge`: Normal original owner/reviewer lifecycle: immutable candidate/handoff, independent review, repository mandatory CI on that exact SHA, protected merge/reachability and own key evidence. Source acceptance only; no full goal/live provider/Final/HOLD credit.

## Findings and executed evidence

| Finding / key | Production source | Before → after | Command / evidence | Remaining |
| --- | --- | --- | --- | --- |
| C028-F1/F2/F3 / tenant_quota_rules_SLA_canonical_ACK_and_recovery | service quota upsert, rule upsert/reorder/disable, SLA update; controller envelopes; repository transaction | Baseline six cases FAIL (early success and swallowed rejection); first repair six cases PASS | `pnpm exec vitest run tests/unit/tenant-rules-sla-webhook-durable-flow-20261015/commands.test.ts`; before vitest failure, after exit 0; machine logs `.local/tenant-rules-sla-webhook-durable-flow-20261015/` | Expand rule update/reorder/disable, lost COMMIT ACK, reconstructed canonical state, retry, original regressions. |
| C112-A / webhook_complete_commands_canonical_ack | endpoint create/update/disable/rotation | Pending | Not yet run | All original criteria retained. |
| C112-B / webhook_first_inflight_restart_payload_identity | enqueue / boot / dispatch | Pending | Not yet run | Actual first HTTP interruption, no fixture repair. |
| C112-C / webhook_successful_verification_authority | endpoint status activation / successful test | Pending | Not yet run | Mounted authorized negative and valid flows. |
| C008 / webhook_original_regressions_and_affected_callers | API-key page actorType shortcut vs signed scopes | Pending | Not yet run | Read-only catalog roles and manager positives. |
| C009 / tenant command and original regression keys | verified identity vs selector on tenant resource paths | Pending | Not yet run | Global JWT/realm/scope chain and zero denied-write effects. |
| exact_candidate_independent_review_ci_merge | candidate lifecycle | Pending | No handoff / review / CI / merge | Source-only task; no live/deployed/full-goal credit. |

SQL connection doubles execute the actual repository SQL and transaction control; they do not establish PostgreSQL behavior. No VM product, HTTP receiver, browser, PG or development servers were run. Hosted DB/receiver checks remain pending through the authorized existing workflow.

The generic `persistChanges` service helper remains best effort: C111 successful-auth usage telemetry is outside this repair. Existing noDB synchronous behavior is preserved. A rejected commit is reconciled by canonical readback rather than assumed rollback.

## Second implementation checkpoint (not a review candidate)

- Executed baseline in locked detached worktree `/tmp/tenant-durable-baseline-20261015` at full baseline SHA above. The four own suites executed 26 cases: **25 FAIL / 1 PASS**. Dependency/setup failures from earlier attempts are not counted as reproduction. The six initial C028 assertions directly reproduce early receipts/swallowed rejection; extra lost-ACK/reorder probes additionally encounter the old non-Promise command contract.
- Fixed working-source run (`tenant-own-after5.log`): **26 PASS**. Adds actual JWT signature verification, realm/scope guard, Nest route argument metadata including `CurrentIdentity`, populated B data, zero denied-write effects, same-tenant A, platform and system positives; page renders real manager and uses real server actions through actual controller/guard.
- Wider run (`tenant-regression8.log`): **78 PASS / 1 hosted-only PostgreSQL SKIP**; API service/controller run (`tenant-api-regression8.log`): **94 PASS**. These predate the latest readback guard/command serialization adjustments and are not final candidate checks. Subsequent intermediate formatting/type errors were detected and repaired; final reruns pending.
- `postgres.test.ts` is restricted to GitHub Actions + disposable `DATABASE_URL`, uses the official migrated schema, actual DatabaseService/pg/TenantPartnerRepository and real rollback/commit. It injects only second-statement rejection / lost COMMIT response. It has not been executed on this VM and has no PASS credit.
- Pending original caller coordination, requested through canonical task progress: production `apps/api/src/seed/tenant-governance-default.ts` (two missing awaits); `tests/integ/tenant-governance-negative.test.ts`; `tests/unit/system-remediation/sr-qa-tenant-001/tenant-approval-and-quota-lifecycle.test.ts`; `tests/unit/system-remediation/sr-qa-tenant-001/tenant-directory-and-settings.test.ts`; transport harness caller `tests/unit/system-remediation/sr-partner-notify-transport-20260918/worker.test.ts`. No writes to these ungranted paths. The transport harness needs legitimate successful test setup and its callers need awaits; this is not a new gate.
- Existing controlled receiver suite and e2e runner were adapted for awaited command results only; they remain hosted-only. Existing transport/security/backoff/SLA/quota tests remain required, including all original assertions.
- No handoff, independent review, exact-candidate CI or protected merge yet. All six own acceptance keys remain outstanding.
