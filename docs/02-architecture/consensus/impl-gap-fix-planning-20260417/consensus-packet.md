# Consensus Packet — Impl Gap Fix Planning

**Status:** DRAFT — awaiting human acceptance
**Drafted by:** Claude (Supervisor) after 4 review rounds
**Date:** 2026-04-17

---

## Arbitration Summary

All four reviewers completed their rounds. The following decisions incorporate
amendments from Codex (R1), Qwen (R2), Gemini (R3), and Copilot (R4).

### Key Decisions Made During Review

| Decision                                               | Rationale                                                                      | Source               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ | -------------------- |
| GAP-P1-001/002 (DEMO_TENANT_ID) → P2-S1                | Phase 1 is single-tenant; 40+ sites require careful per-tenant Map refactoring | Codex R1, Copilot R4 |
| GAP-P1-004 (minPhotoCount) → P2-S1                     | Changing default breaks 2 test fixtures; enterprise intent is correct          | Codex R1             |
| GAP-P2S1-002 (severity=critical) → No contracts change | `IncidentSeverity = "critical"` already at contracts:1660                      | Codex R1             |
| GAP-P2S2-003 (webhook engine) → Sprint 1               | HMAC already built; only fetch() wiring needed (~130 LOC)                      | Qwen R2              |
| GAP-P2S2-008 (WebSocket) → SSE                         | Cloud Run stateless; SSE avoids sticky session requirement                     | Gemini R3            |
| GAP-P2S1-006 (auth) → Internal key middleware          | `--no-allow-unauthenticated` breaks E2E; minimal 20 LOC approach               | Gemini R3            |
| GAP-003 → Split into 3 tasks                           | 40+ sites; monolithic PR is high-risk                                          | Copilot R4           |
| Add MISS-003 (audit log cap)                           | Unbounded in-memory growth                                                     | Copilot R4           |
| Add MISS-004 (rate limiting)                           | Staging open to abuse                                                          | Copilot R4           |

---

## Phase 1 Hotfixes (Must complete before UAT close)

| Task ID    | Title                                                                | Owner   | Effort      |
| ---------- | -------------------------------------------------------------------- | ------- | ----------- |
| GAP-P1-003 | tenant-portal-web: webhook UI disclaimer ("delivery engine Phase 2") | Copilot | S (< 1 day) |

**Only 1 true P1 hotfix.** All others moved to P2-S1 after review.

---

## Phase 2 Sprint 1 — Full Approved Backlog

| Task ID                | Title                                                                      | Owner  | Effort |
| ---------------------- | -------------------------------------------------------------------------- | ------ | ------ |
| GAP-P2S1-001           | driver-app: SOS screen (category=safety, severity=critical)                | Qwen   | M      |
| GAP-P2S1-002           | driver-app: incident.tsx use severity=critical for SOS path                | Qwen   | S      |
| GAP-P2S1-003           | billing: driver statement live trip ingestion (no new DB needed)           | Codex  | M      |
| GAP-P2S1-004-CONTRACTS | contracts: DriverProfileRecord + Create/Update commands                    | Codex  | S      |
| GAP-P2S1-004-API       | api: driver-profile module (blocked on -CONTRACTS)                         | Qwen   | M      |
| GAP-P2S1-005           | platform-earnings: 3 demo seed records                                     | Codex  | S      |
| GAP-P2S1-006           | api: x-drts-internal-key middleware + Cloud Run env var injection          | Gemini | S      |
| GAP-P2S1-007           | owned-mobility: code comment on enterprise dispatch minPhotoCount=1 intent | Codex  | XS     |
| GAP-P2S1-008           | audit-notification: in-memory log cap (max 1000, rotate oldest)            | Codex  | S      |
| GAP-P2S1-009           | billing-settlement: per-tenant store refactor (remove DEMO_TENANT_ID)      | Codex  | L      |
| GAP-P2S1-010           | tenant-partner: per-tenant store refactor (remove DEMO_TENANT_ID)          | Qwen   | L      |
| GAP-P2S1-011           | tests: E2E + unit update for multi-tenant header assertions                | Codex  | M      |
| GAP-P2S1-012           | api: NestJS ThrottlerModule rate limiting (global + per-route)             | Gemini | S      |
| GAP-P2S1-013           | webhook: WebhookDispatchService (fetch + retry, uses existing HMAC)        | Codex  | M      |
| GAP-P2S1-014           | webhook: order status change event hooks → dispatch trigger                | Codex  | M      |

---

## Phase 2 Sprint 2

| Task ID      | Title                                                                       | Owner  | Effort |
| ------------ | --------------------------------------------------------------------------- | ------ | ------ |
| GAP-P2S2-001 | driver-app: trip screen proof bundle (photo picker + CompletionProofBundle) | Qwen   | L      |
| GAP-P2S2-002 | driver-app: trip screen Expo Location metrics                               | Qwen   | M      |
| GAP-P2S2-003 | db: V0019\_\_driver_locations.sql migration                                 | Gemini | S      |
| GAP-P2S2-004 | regulatory-registry: driver location heartbeat endpoint + haversine ETA     | Qwen   | M      |
| GAP-P2S2-005 | driver-app: location heartbeat sender (Expo Location)                       | Qwen   | M      |
| GAP-P2S2-006 | forwarder: ForwarderAdapterInterface + Grab Taiwan webhook stub             | Codex  | M      |
| GAP-P2S2-007 | api: NestJS SSE endpoint for driver task assignment events                  | Qwen   | M      |
| GAP-P2S2-008 | platform-admin: inspect switchboard/page.tsx for hidden gaps                | Codex  | XS     |

---

## Phase 2 Sprint 3

| Task ID      | Title                                                                   | Owner  | Effort |
| ------------ | ----------------------------------------------------------------------- | ------ | ------ |
| GAP-P2S3-001 | auth: Cloud IAP / OIDC JWT production (replace bootstrap trust)         | Gemini | XL     |
| GAP-P2S3-002 | ops-console: critical incident / SOS priority queue view                | Qwen   | M      |
| GAP-P2S3-003 | regulatory-registry: real-time ETA from driver_locations                | Qwen   | M      |
| GAP-P2S3-004 | ops-console: SSE dispatch board live updates                            | Qwen   | M      |
| GAP-P2S3-005 | api: @FeatureGated decorator + NestJS guard                             | Codex  | M      |
| GAP-P2S3-006 | db: V0020\_\_settlement_driver_index.sql + per-driver settlement query  | Gemini | M      |
| GAP-P2S3-007 | forwarder: platform code registry + service bucket enum expansion       | Codex  | S      |
| GAP-P2S3-008 | driver-app: settings.tsx → driver-profile API (blocked on P2S1-004-API) | Qwen   | S      |

---

## Size Estimates

| Size | Meaning                       |
| ---- | ----------------------------- |
| XS   | < 1 hour, < 20 LOC            |
| S    | < 4 hours, < 100 LOC          |
| M    | 1-2 days, 100-300 LOC         |
| L    | 3-5 days, 300-600 LOC         |
| XL   | 1-2 weeks, architecture-level |

---

## Dependency Graph (Sprint 1)

```
GAP-P2S1-004-CONTRACTS (Codex)
    └── GAP-P2S1-004-API (Qwen)
            └── GAP-P2S3-008 (Qwen)

GAP-P2S1-013 (webhook dispatch)
    └── GAP-P2S1-014 (order event hooks)

GAP-P2S1-009 + GAP-P2S1-010 (DEMO_TENANT_ID)
    └── GAP-P2S1-011 (test updates)
```

All other Sprint 1 tasks are independent and can run in parallel.

---

## Open Questions (Not Resolved in Review)

1. **GAP-P2S2-008 (platform-admin switchboard):** Content unknown. Must be inspected
   before Sprint 2 planning can be finalized.

2. **Rate limiting thresholds (GAP-P2S1-012):** What are the appropriate per-route
   limits? Requires product decision (not purely technical).

3. **Forwarder external partner (GAP-P2S2-006):** Grab Taiwan webhook ingest requires
   external API credentials and partnership agreement. Timeline depends on biz dev.

---

## Acceptance Gate

**Human must explicitly accept this packet before supervisor resumes
`supervisor_managed_execution` mode and dispatches Sprint 1 tasks.**

Upon acceptance, `ai-status.json` will be updated:

- `execution_mode` → `supervisor_managed_execution`
- GAP-P1-003 → `in_progress` (Copilot)
- All Sprint 1 tasks → `backlog` with approved owners
- `discussion_loop.current_owner` → null (planning complete)
