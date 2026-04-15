# FBP-007: Tenant Portal Web Sunset Record

**Sunset rule:** `SUNSET-001-tenant-portal-web`
**Executed:** 2026-04-15
**Task:** FBP-007 — retire `apps/tenant-portal-web` as a production target
**Owner:** Claude
**Reviewer:** Codex

---

## Decision

`apps/tenant-portal-web` is **not** the production tenant portal and must not be treated as a
production target in any active rollout, master plan, or topology record.

This decision was fixed in the full-blueprint consensus packet
(`docs/02-architecture/consensus/phase2-full-blueprint-planning-20260415/consensus-packet.md`
§3.2 Tenant Portal Topology).

---

## Rationale

| Factor                        | Detail                                                                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Production tenant UI          | `tenant-commute-hub` (external repo)                                                                                                                                                             |
| BFF / authority               | `drts-fleet-platform` → `/api/tenant/*`                                                                                                                                                          |
| BFF parity completed          | FBP-005 (commit `78cb874`)                                                                                                                                                                       |
| Commute-hub cutover completed | FBP-006 (commit `ddfc087`)                                                                                                                                                                       |
| Internal scaffold role        | `apps/tenant-portal-web` served as the Wave D implementation reference while the contracts, BFF endpoints, and UI patterns were being established. It is not the external-facing tenant product. |

---

## Sunset Rule Execution Checklist

| Step                                                                  | Status       | Notes                                                                                                                                                                                  |
| --------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/tenant-portal-web/README.md` updated with SUNSET notice         | **done**     | Clearly marks the app as retired, non-production, and references this record                                                                                                           |
| `TARGET_ARCHITECTURE.md` §3 updated                                   | **done**     | Entry marked `RETIRED (SUNSET-001-tenant-portal-web, 2026-04-15)`                                                                                                                      |
| `ROADMAP.md` updated                                                  | **done**     | Topology note added under Wave 7 section                                                                                                                                               |
| Active rollout / master plan (`ai-status.json`, `current-work.md`)    | **done**     | FBP-007 task class `execution_cleanup` closes the retire obligation; no task remains that treats this app as a live production target                                                  |
| Deploy pipeline (`deploy-staging.yml`)                                | **done**     | Build & push step and deploy step for `tenant-portal-web` removed; `drts-tenant-portal-web` removed from staging URL print list                                                        |
| GCP service spec (`infra/gcp/staging/tenant-portal-web-service.yaml`) | **done**     | SUNSET notice comment added; file retained as frozen reference only; must NOT be applied to any environment                                                                            |
| Docker compose prod (`docker-compose.prod.yml`)                       | **done**     | `tenant-portal-web` service entry removed from active compose topology                                                                                                                 |
| Hard-delete decision                                                  | **deferred** | The frozen reference shell may be hard-deleted once Wave D scaffolding is no longer needed for historical reference. A fresh task should be opened when the repo is ready for cleanup. |

---

## Topology After This Sunset

```
Tenant user
    │
    ▼
tenant-commute-hub  (external repo — sole production tenant UI)
    │  pure UI consumer, no backend authority
    ▼
drts-fleet-platform  /api/tenant/*  (BFF + authority)
    │
    ▼
drts-fleet-platform backend domains
(tenant-partner, billing-settlement, audit-notification, reporting-filing, …)
```

`apps/tenant-portal-web` is **outside** this topology. It is a frozen reference shell only.

---

## References

- Consensus packet: `docs/02-architecture/consensus/phase2-full-blueprint-planning-20260415/consensus-packet.md` §3.2
- BFF parity matrix: `docs/02-architecture/authority/fbp-005-tenant-bff-parity-matrix.md`
- Commute-hub cutover spec: `docs/02-architecture/authority/fbp-006-tenant-commute-hub-cutover-spec.md`
- Authority map: `docs/02-architecture/authority/rgp-002-authority-map.md`
- Tenant boundary contract: `docs/02-architecture/tenant-commute-hub-boundary.md`
