# MAP-REL-001 Final Evidence

**Task:** `MAP-REL-001` - Map/geofence production release gates
**Branch:** `codex2/map-rel-001`
**Branch@SHA:** `codex2/map-rel-001@7d997b1bd5abff23da279cee03d4f1493ed8b75a`
**Worktree:** `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-map-rel-001`
**Date:** `2026-07-04`
**Reviewer:** `Codex`

## Verdict

`MAP-REL-001` is currently `FAIL` for repo-backed production release readiness
evidence. This closeout records the real blocker state instead of claiming a
production-safe release. Gate B still lacks canonical
`/service-area-governance` route publication under
`apps/platform-admin-web/app`, and Gate D still lacks release-grade
simulator/device UAT evidence in
`support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md`.

## Upstream Evidence Intake

| Source task / artifact | Status | Evidence |
| --- | --- | --- |
| `MAP-QA-002` cross-surface E2E | PASS | `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md` |
| `MAP-OBS-001` observability | PASS | `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` |
| `MAP-FE-ADM-001` governance publication | INSUFFICIENT FOR GATE B | `docs/05-ui/platform-admin-service-area-governance-screen-requirements-20260703.md`, `support/sidecars/MAP-REL-001/MAP-REL-001-READINESS-BLOCKER-REPORT.md` |
| `MAP-MOB-DRV-001` driver handoff | INSUFFICIENT FOR GATE D | `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md`, `support/sidecars/MAP-REL-001/MAP-REL-001-READINESS-BLOCKER-REPORT.md` |

## Gate Matrix

| Gate | Verdict | Row-level evidence |
| --- | --- | --- |
| `Gate A` | PASS | `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-callcenter-ui-20260704T0414Z.json`, `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-tenant-ui-20260704T0414Z.json`, `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-concierge-ui-20260704T0414Z.json`, `support/sidecars/MAP-QA-002/artifacts/service-area-service-vitest-20260704T0414Z.json` |
| `Gate B` | FAIL | `support/sidecars/MAP-REL-001/MAP-REL-001-READINESS-BLOCKER-REPORT.md`, `docs/05-ui/platform-admin-service-area-governance-screen-requirements-20260703.md` |
| `Gate C` | PASS | `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-ops-ui-20260704T0414Z.json`, `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`, `docs/03-runbooks/map-geofence-observability-runbook.md` |
| `Gate D` | FAIL | `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md`, `support/sidecars/MAP-REL-001/MAP-REL-001-READINESS-BLOCKER-REPORT.md` |
| `Gate E` | PASS | `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-harness-20260704T0414Z.json`, `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-callcenter-ui-20260704T0414Z.json`, `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`, `apps/api/tests/unit/map-provider-config.test.ts` |

## Manifest Closeout

| Item | Verdict | Artifact evidence |
| --- | --- | --- |
| `FLEETS-MAP-001` | PASS | `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-callcenter-ui-20260704T0414Z.json`, `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-tenant-ui-20260704T0414Z.json`, `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-concierge-ui-20260704T0414Z.json`, `support/sidecars/MAP-QA-002/artifacts/service-area-service-vitest-20260704T0414Z.json` |
| `FLEETS-MAP-002` | FAIL | `support/sidecars/MAP-REL-001/MAP-REL-001-READINESS-BLOCKER-REPORT.md`, `docs/05-ui/platform-admin-service-area-governance-screen-requirements-20260703.md` |
| `FLEETS-MAP-003` | PASS | `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-ops-ui-20260704T0414Z.json`, `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`, `docs/03-runbooks/map-geofence-observability-runbook.md` |
| `FLEETS-MAP-004` | FAIL | `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md`, `support/sidecars/MAP-REL-001/MAP-REL-001-READINESS-BLOCKER-REPORT.md` |
| `FLEETS-MAP-005` | PASS | `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-harness-20260704T0414Z.json`, `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`, `apps/api/tests/unit/map-provider-config.test.ts` |
| `FLEETS-MAP-006` | PASS | `apps/api/src/modules/feature-flags/feature-flags.service.ts`, `apps/api/tests/unit/feature-flags.service.test.ts`, `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md` |
| `FLEETS-MAP-007` | PASS | `apps/api/src/modules/service-area/service-area.service.ts`, `support/sidecars/MAP-QA-002/artifacts/service-area-service-vitest-20260704T0414Z.json`, `docs/03-runbooks/map-geofence-observability-runbook.md` |
| `FLEETS-MAP-008` | PASS | `scripts/check-map-provider-config.sh`, `apps/api/README.md`, `.github/workflows/deploy-staging.yml`, `.github/workflows/deploy-prod.yml` |
| `FLEETS-MAP-009` | PASS | `infra/migrations/V0047__service_area_geofence_authority.sql`, `docs/03-runbooks/map-geofence-observability-runbook.md`, `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` |
| `FLEETS-MAP-010` | PASS | `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260701.md` |
| `FLEETS-MAP-011` | PASS | `support/sidecars/MAP-REL-001/MAP-REL-001-READINESS-BLOCKER-REPORT.md`, `support/sidecars/MAP-REL-001/MAP-REL-001-BLOCKER-HANDOFF-NOTES.md`, `support/sidecars/MAP-REL-001/artifacts/readiness-blocker-report.json`, `support/sidecars/MAP-REL-001/artifacts/blocker-handoff-notes.json` |

## Rollout And Rollback

| Topic | Verdict | Evidence |
| --- | --- | --- |
| Rollout flags default disabled | PASS | `apps/api/src/modules/feature-flags/feature-flags.service.ts`, `apps/api/tests/unit/feature-flags.service.test.ts` |
| Rollout order stays provider -> picker -> gate -> ops/admin -> driver | PASS | `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md` |
| Provider preflight is fail-closed for staging/production | PASS | `scripts/check-map-provider-config.sh`, `apps/api/tests/unit/map-provider-config.test.ts`, `apps/api/README.md` |
| Rollback path uses boundary/policy retire plus flag disable | PASS | `apps/api/src/modules/service-area/service-area.service.ts`, `support/sidecars/MAP-QA-002/artifacts/service-area-service-vitest-20260704T0414Z.json`, `docs/03-runbooks/map-geofence-observability-runbook.md` |

## Provider And PostGIS Prerequisites

| Prerequisite | Verdict | Evidence |
| --- | --- | --- |
| Google server-side geocode/routes keys required when `MAP_PROVIDER_BACKEND=google` in staging/production | PASS | `scripts/check-map-provider-config.sh`, `apps/api/tests/unit/map-provider-config.test.ts`, `.github/workflows/deploy-staging.yml`, `.github/workflows/deploy-prod.yml` |
| Browser/origin restrictions and quota thresholds documented | PASS | `apps/api/README.md`, `.github/workflows/deploy-staging.yml`, `.github/workflows/deploy-prod.yml` |
| PostGIS extension required before governed geometry tables | PASS | `infra/migrations/V0047__service_area_geofence_authority.sql` |
| Evaluator/PostGIS outages are fail-closed and separately observable | PASS | `docs/03-runbooks/map-geofence-observability-runbook.md`, `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` |

## Gap Inventory Closeout

`docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260701.md`
still maps `MAP-GAP-001` through `MAP-GAP-013` to a named owner slice and
evidence path, and no `MAP-GAP-*` row remains unassigned. The closeout table now
marks `MAP-GAP-005`, `MAP-GAP-007`, and `MAP-GAP-013` as `BLOCKED` until Gate B
route publication and Gate D mobile UAT evidence land.

## Blocker Report And Handoffs

| Artifact | Verdict | Evidence |
| --- | --- | --- |
| Readiness blocker report | PASS | `support/sidecars/MAP-REL-001/MAP-REL-001-READINESS-BLOCKER-REPORT.md`, `support/sidecars/MAP-REL-001/artifacts/readiness-blocker-report.json` |
| Blocker handoff notes | PASS | `support/sidecars/MAP-REL-001/MAP-REL-001-BLOCKER-HANDOFF-NOTES.md`, `support/sidecars/MAP-REL-001/artifacts/blocker-handoff-notes.json` |

## Verifier Results

| Verifier | Verdict | Artifact |
| --- | --- | --- |
| Dispatch integrity verifier | FAIL | `support/sidecars/MAP-REL-001/artifacts/dispatch-integrity.json` |
| Readiness verifier | FAIL | `support/sidecars/MAP-REL-001/artifacts/readiness-blocker-report.json` |

## Artifact Index

| Artifact type | Path |
| --- | --- |
| Manifest | `support/sidecars/MAP-REL-001/MAP-FLEETS-EXECUTION-MANIFEST-20260701.json` |
| Final evidence | `support/sidecars/MAP-REL-001/MAP-REL-001-FINAL-EVIDENCE.md` |
| Readiness blocker report | `support/sidecars/MAP-REL-001/MAP-REL-001-READINESS-BLOCKER-REPORT.md` |
| Blocker handoff notes | `support/sidecars/MAP-REL-001/MAP-REL-001-BLOCKER-HANDOFF-NOTES.md` |
| Dispatch integrity JSON | `support/sidecars/MAP-REL-001/artifacts/dispatch-integrity.json` |
| Readiness verifier JSON | `support/sidecars/MAP-REL-001/artifacts/readiness-blocker-report.json` |
| Handoff notes JSON | `support/sidecars/MAP-REL-001/artifacts/blocker-handoff-notes.json` |
