# Sources and Case Matrix

## SD §14 Case Matrix

| Case Category | Scenario | Handled By |
| --- | --- | --- |
| Positive Path | Valid delivery -> 200/204 -> DB status 'delivered' | `partner-notification-uat.spec.ts` (C201) |
| Negative / Fault | Transport timeout -> 503 -> retry (attempt_count incremented) | `partner-notification-uat.spec.ts` (C202) |
| Negative / Fault | Unknown partner entry / Route missing -> 404 -> permanent failure | `partner-notification-uat.spec.ts` (C203) |
| Negative / Fault | Receiver invalid ack (HTTP 204 with payload) -> failed/retry | `partner-notification-uat.spec.ts` (C204) |
| Admin / Navigation | Admin UI displays notification binding and enables navigation | `partner-notification-uat.spec.ts` (C205) |

## Acceptance Matrix

- **A層 (Layer A)**: `integrated_controlled_receiver_negative_matrix_same_sha` - Verified using internal GitHub-hosted workflow and actual worker outbox deliveries to a controlled receiver loopback in E2E.
- **B/C層 (Layer B/C)**: 仍保留 `existing_webhook_tenant_gates_preserved_and_live_not_claimed` - Webhook CI testing pipeline handles multi-tenant existing gateways.

## Pinned Candidate & Artifacts

- **Candidate SHA**: `5dfd0c41d70fea4c33b6046dbfc821acdfc50a19`
- **Report/Artifacts**: See UAT pipeline execution artifacts for full HTML and JSON test reports.
