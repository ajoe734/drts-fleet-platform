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

## Acceptance Matrix

- **A層 (Layer A)**: `controlled_receiver_verified` - Verified using internal GitHub-hosted workflow and controlled receivers.
- **B/C層 (Layer B/C)**: 仍保留 `SR-LIVE-PUSH` gate。不能用受控 receiver 或 browsermock 稱真夥伴/裝置達標。

## Pinned Candidate & Artifacts

- **Candidate SHA**: `1a824201acd34747ee5ffa887a1c9d5b6e7c5bb3`
- **Report/Artifacts**: See UAT pipeline execution artifacts for full HTML and JSON test reports.
