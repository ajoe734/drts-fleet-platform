# Sources and Case Matrix

## SD §14 Case Matrix

| Case Category | Scenario | Handled By |
| --- | --- | --- |
| Negative / Fault | 204 / HTML200 / Invalid response body | partner-notification-uat.spec.ts (204 / HTML200) |
| Negative / Fault | Timeout after partner ACK | partner-notification-uat.spec.ts (Duplicate ack) |
| Negative / Fault | DB write failure after ACK | partner-notification-uat.spec.ts (Fence transaction) |
| Navigation | Invalid entry / Logout | partner-notification-uat.spec.ts (Navigation Identity Handoff) |
| Multi-tenant | Session isolation between apps | partner-notification-uat.spec.ts (Session isolation) |
| Multi-tenant | Tenant migration isolation | partner-notification-uat.spec.ts (Tenant migration isolation) |
| State | Revoked link / Route missing | partner-notification-uat.spec.ts (Recipient revoked, Route missing) |
| State | Concurrency claim owner | partner-notification-uat.spec.ts (Concurrency claim owner) |
| Retry | Max attempts (5x backoff) | partner-notification-uat.spec.ts (Retry limit backoff) |
| Retry | Admin UI real state & manual retry | partner-notification-uat.spec.ts (Admin UI test) |
