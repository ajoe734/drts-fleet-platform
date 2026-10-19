# Monthly driver billing scheduler

Task: BILLING-MONTHLY-BATCH-RESUMPTION-FLOW-20261015 (original C089).

The new POST /api/internal/scheduled-tasks/billing-monthly/run invokes the actual Billing producer. Empty JSON selects the preceding **UTC** calendar month, including leap years and year rollover. An explicit closed periodMonth permits continuation of an earlier month; the current or future month is rejected. operationId defaults to billing-monthly:YYYY-MM; x-request-id identifies the HTTP attempt. An operationId is durably bound to its period; reuse for a different period returns409. Neither is a new fee, financial cutoff or payment approval policy.

The source query joins canonical completed driver tasks and owned orders with the original business-dispatch/source eligibility. A source read failure is unavailable, not an empty successful seed batch. The batch returns per-driver statement/reimbursement IDs; a failed target produces HTTP503 BILLING_MONTHLY_PARTIAL_FAILURE with completed and failed receipts. Retry the same period/operation: each target reads canonical rows, preserves completed IDs/PDF bytes and completes only missing work. An empty canonical month is a completed zero-target result.

A target's original proposal is stored in the existing ops.idempotency_records under billing:driver-statement:target-proposal before any PDF or financial write. This acknowledges reservation only, not financial success. A PostgreSQL session advisory lock spans that target's work on one connection, including pool size1. Statement and reimbursement SQL can independently commit; no Promise.all rejection is treated as rollback. The next read/restart resumes the reserved snapshot and missing relation. Success cache/notification/audit publication follows confirmed target ACK; the separate success-fanout receipt prevents retry duplicates. It records a fanout claim, not proof of external message delivery. Existing notifications are process-local; hosted financial rows, object storage and actual delivery require their original live evidence.

## Operator preparation

Source workers must not run cloud commands, create jobs/IAM/identities, update secrets, deploy, or start a VM service. The script below is **prepared only** and tested with isolated stub commands. It manages the single fixed job name drts-billing-monthly, leaving existing mail/reminder jobs untouched. It does not enable services, edit IAM/registries/secrets or dispatch a job.

1. Confirm the accepted Source SHA is on the shared Cloud Run revision and the existing billing database/artifact configuration is operational.
2. The Operator uses the existing verified Google system-workload registry pattern documented in the internal-key exception inventory and the existing scheduled-tasks runbook. An approved service principal must name its real service account, the deployed API audience, scope billing:monthly:run and route scope POST /api/internal/scheduled-tasks/billing-monthly/run. Preserve its other registry entries and all existing issuer/JWKS/audience/route checks. Missing or unregistered identity remains a real unavailable/denied boundary; do not mint a privileged identity or broaden manual route realms. Any actual service-account/IAM step belongs to the existing Operator.
3. Set explicit verified PROJECT_ID, REGION, API_ORIGIN (HTTPS origin without slash), SCHEDULER_SERVICE_ACCOUNT, TIME_ZONE (IANA zone) and BILLING_MONTHLY_SCHEDULE (five numeric cron fields). The operator chooses firing time; there is no new business cutoff. The timezone affects firing only; the producer always closes months in UTC. The script validates configuration before any stub/cloud command. Run it only under the original Operator authorization:

```sh
PROJECT_ID=<verified-project> REGION=<verified-region> \
API_ORIGIN=<deployed-api-origin> SCHEDULER_SERVICE_ACCOUNT=<approved-account> \
TIME_ZONE=Etc/UTC BILLING_MONTHLY_SCHEDULE='<operator-chosen-cron>' \
operations/deployment/provision-billing-monthly-batch-scheduler.sh
```

4. Actual live acceptance must correlate Scheduler AttemptFinished and verified principal/route with Cloud Run revision/source SHA, operation/request IDs, per-target receipts and authoritative financial/artifact readback. Job creation, dispatch, lastAttemptTime or a source unit test alone is not completed execution. Qualify a replay, a partial failure/resume and a fresh revision/restart against the same period; preserve existing statement/batch IDs and bytes/hash. Keep wrong-realm/scope/unregistered denial evidence. No payment, real remittance upload, financial data purge or provider action is authorized by this Source runbook.
