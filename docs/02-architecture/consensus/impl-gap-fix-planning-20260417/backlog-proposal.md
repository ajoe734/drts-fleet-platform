# Backlog Proposal — Draft (Pending Review)

> This file is Claude's initial task decomposition proposal.
> Reviewers should amend this in their review-round-N.md files.
> Final version enters ai-status.json only after consensus-packet is accepted.

---

## Wave: Phase 1 Hotfixes

| Task ID    | Title                                                                  | Owner   | Description                                                                                                                                                                                         |
| ---------- | ---------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GAP-P1-001 | billing: remove DEMO_TENANT_ID hardcode in BillingSettlementService    | Codex   | Read tenantId from request context; scope all billing profile/invoice ops per tenant. Root cause: billing-settlement.service.ts:41                                                                  |
| GAP-P1-002 | tenant-partner: per-tenant sharding for slaProfile/webhooks/passengers | Qwen    | TenantPartnerService stores all data under DEMO_TENANT_ID. Shard by tenantId from request context. Root cause: tenant-partner.service.ts                                                            |
| GAP-P1-003 | billing: add webhook UI disclaimer (delivery engine not implemented)   | Copilot | Add visible note in tenant-portal-web webhook page: "Webhook delivery engine is scheduled for Phase 2." Prevents customer confusion.                                                                |
| GAP-P1-004 | owned-mobility: clarify enterprise dispatch default proofRequirements  | Codex   | Verify that enterprise dispatch order creation path's minPhotoCount is intentional (=1). Add code comment; update demo seed to minPhotoCount=0 if needed. Root cause: owned-mobility.service.ts:467 |

---

## Wave: Phase 2 Sprint 1

| Task ID      | Title                                                    | Owner  | Description                                                                                                                                                  |
| ------------ | -------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GAP-P2S1-001 | driver-app: SOS screen (one-tap emergency report)        | Qwen   | New screen apps/driver-app/app/sos.tsx; category=emergency, severity=critical, location attach. Root cause: no SOS screen in 9-screen driver app             |
| GAP-P2S1-002 | api: incident severity=critical support                  | Codex  | Verify/extend IncidentRecord.severity enum in contracts; ensure incident service accepts critical severity and routes to priority queue                      |
| GAP-P2S1-003 | billing: driver statement live trip ingestion            | Codex  | Add listLiveDriverTripsInPeriod() in billing-settlement.repository.ts; wire into generateDriverStatements(). Root cause: billing-settlement.service.ts:522   |
| GAP-P2S1-004 | driver-profile: new standalone module                    | Qwen   | apps/api/src/modules/driver-profile/ with self-service update endpoints; driver app settings.tsx integration                                                 |
| GAP-P2S1-005 | platform-earnings: add demo seed data                    | Codex  | Add 3 seed records to platform-earnings.service.ts matching billing settlement seed drivers. Root cause: platform-earnings.service.ts in-memory Map is empty |
| GAP-P2S1-006 | auth: restrict staging Cloud Run to service-account-only | Gemini | Configure Cloud Run `--no-allow-unauthenticated` for staging; add Cloud IAP or header-based service account allowlist                                        |

---

## Wave: Phase 2 Sprint 2

| Task ID      | Title                                               | Owner  | Description                                                                                                                                                  |
| ------------ | --------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GAP-P2S2-001 | driver-app: trip screen proof bundle (photo picker) | Qwen   | Photo picker in trip.tsx; assemble CompletionProofBundle with photoIds. Root cause: trip.tsx:85                                                              |
| GAP-P2S2-002 | driver-app: trip screen location metrics            | Qwen   | Expo Location API integration; actualDistanceKm/actualDurationSec from tracked route. Root cause: trip.tsx:87-88                                             |
| GAP-P2S2-003 | webhook: delivery engine (fetch + retry + HMAC)     | Codex  | WebhookDispatchService; fetch() delivery, exponential retry, HMAC-SHA256 signature. Root cause: tenant-partner.service.ts sendTestWebhook() never dispatches |
| GAP-P2S2-004 | webhook: order event hooks                          | Codex  | Hook into owned-mobility order status changes (created/cancelled/completed) to trigger webhook delivery                                                      |
| GAP-P2S2-005 | regulatory-registry: driver location heartbeat      | Qwen   | Driver app sends GPS heartbeat; new ops.phase1_driver_locations table; ETA calculation from haversine                                                        |
| GAP-P2S2-006 | db: migration for driver_locations table            | Gemini | New migration in infra/migrations/; schema for ops.phase1_driver_locations                                                                                   |
| GAP-P2S2-007 | forwarder: adapter interface design                 | Codex  | ForwarderAdapterInterface (plug-in pattern); first stub for Grab Taiwan webhook ingest                                                                       |
| GAP-P2S2-008 | api: WebSocket gateway for driver task events       | Qwen   | NestJS Gateway (Socket.IO); driver task assignment push events                                                                                               |

---

## Wave: Phase 2 Sprint 3

| Task ID      | Title                                                    | Owner  | Description                                                                               |
| ------------ | -------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| GAP-P2S3-001 | auth: Cloud IAP / OIDC JWT production                    | Gemini | Full Cloud IAP integration; replace bootstrap header trust with OIDC-verified JWT payload |
| GAP-P2S3-002 | ops-console: SOS incident queue view                     | Qwen   | Ops console page for critical/emergency incidents; priority sort                          |
| GAP-P2S3-003 | regulatory-registry: real-time ETA from driver locations | Qwen   | Use ops.phase1_driver_locations for proximity-based ETA; replace static etaMinutes        |
| GAP-P2S3-004 | ops-console: WebSocket dispatch board (SSE)              | Qwen   | Live-updating dispatch board via server-sent events                                       |
| GAP-P2S3-005 | api: @FeatureGated decorator + NestJS guard              | Codex  | Server-side feature flag enforcement; @FeatureGated("key") on relevant endpoints          |
| GAP-P2S3-006 | db: settlement migration for live driver trips           | Gemini | DB migration to support per-driver settlement trip queries from ops.phase1_owned_orders   |
| GAP-P2S3-007 | forwarder: platform code registry expansion              | Codex  | Extend service bucket enum; platform code → adapter mapping registry                      |

---

## Reviewer Notes Slot

_(Reviewers: add your amendments here with your agent name prefix)_
