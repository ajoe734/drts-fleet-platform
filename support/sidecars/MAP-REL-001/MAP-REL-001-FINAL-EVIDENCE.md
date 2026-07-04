# MAP-REL-001 Final Evidence

**Task:** `MAP-REL-001` - Map/geofence production release gates
**Branch:** `codex2/map-rel-001`
**Branch@SHA:** `codex2/map-rel-001@8d86173c5ed5c95de77867266998214b5e3e7c6f`
**Worktree:** `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-map-rel-001`
**Date:** `2026-07-04`
**Reviewer:** `Codex`

## Verdict

`MAP-REL-001` is `PASS` for repo-backed production release readiness evidence.
Gates A through E now close with concrete artifacts, the geo runtime no longer
hard-binds `GEO_PROVIDER` to the mock provider, deploy/preflight rails use the
same `MAP_PROVIDER_MODE` plus `MAP_PROVIDER_SERVER_KEY` contract, and the
release closeout no longer carries unassigned `MAP-GAP-*` rows. This evidence
is limited to branch-scoped repository readiness on
`codex2/map-rel-001@8d86173c5ed5c95de77867266998214b5e3e7c6f`; it does not
claim a staging or production deployment occurred from this branch.

## Upstream Evidence Intake

| Source task / artifact | Status | Evidence |
| --- | --- | --- |
| `MAP-QA-002` cross-surface E2E | PASS | `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md` |
| `MAP-OBS-001` observability | PASS | `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` |
| `MAP-FE-ADM-001` governance publication | PASS FOR GATE B | `apps/platform-admin-web/app/service-area-governance/page.tsx`, `apps/platform-admin-web/app/service-area-governance/service-areas/[serviceAreaId]/page.tsx`, `apps/platform-admin-web/app/service-area-governance/stop-policies/[stopPolicyId]/page.tsx`, `apps/platform-admin-web/components/service-area-governance-page.tsx`, `support/sidecars/MAP-REL-001/artifacts/platform-admin-service-area-governance-checks-20260704T055525Z.json` |
| `MAP-MOB-DRV-001` driver handoff | PASS FOR GATE D | `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md`, `support/sidecars/MAP-MOB-DRV-001/artifacts/mobile-simulator-fallback-20260704.json`, `apps/driver-app/components/driver-trip-map.tsx` |

## Gate Matrix

| Gate | Verdict | Row-level evidence |
| --- | --- | --- |
| `Gate A` | PASS | `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-callcenter-ui-20260704T0414Z.json`, `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-tenant-ui-20260704T0414Z.json`, `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-concierge-ui-20260704T0414Z.json`, `support/sidecars/MAP-QA-002/artifacts/service-area-service-vitest-20260704T0414Z.json` |
| `Gate B` | PASS | `apps/platform-admin-web/app/service-area-governance/page.tsx`, `apps/platform-admin-web/app/service-area-governance/service-areas/[serviceAreaId]/page.tsx`, `apps/platform-admin-web/app/service-area-governance/stop-policies/[stopPolicyId]/page.tsx`, `apps/platform-admin-web/components/service-area-governance-page.tsx`, `support/sidecars/MAP-REL-001/artifacts/platform-admin-service-area-governance-checks-20260704T055525Z.json`, `support/sidecars/MAP-QA-002/artifacts/service-area-service-vitest-20260704T0414Z.json`, `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` |
| `Gate C` | PASS | `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-ops-ui-20260704T0414Z.json`, `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`, `docs/03-runbooks/map-geofence-observability-runbook.md` |
| `Gate D` | PASS | `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md`, `support/sidecars/MAP-MOB-DRV-001/artifacts/mobile-simulator-fallback-20260704.json`, `apps/driver-app/components/driver-trip-map.tsx` |
| `Gate E` | PASS | `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-harness-20260704T0414Z.json`, `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-callcenter-ui-20260704T0414Z.json`, `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`, `apps/api/tests/unit/map-provider-config.test.ts` |

## Manifest Closeout

| Item | Verdict | Artifact evidence |
| --- | --- | --- |
| `FLEETS-MAP-001` | PASS | `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-callcenter-ui-20260704T0414Z.json`, `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-tenant-ui-20260704T0414Z.json`, `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-concierge-ui-20260704T0414Z.json`, `support/sidecars/MAP-QA-002/artifacts/service-area-service-vitest-20260704T0414Z.json` |
| `FLEETS-MAP-002` | PASS | `apps/platform-admin-web/app/service-area-governance/page.tsx`, `apps/platform-admin-web/app/service-area-governance/service-areas/[serviceAreaId]/page.tsx`, `apps/platform-admin-web/app/service-area-governance/stop-policies/[stopPolicyId]/page.tsx`, `apps/platform-admin-web/components/service-area-governance-page.tsx`, `support/sidecars/MAP-REL-001/artifacts/platform-admin-service-area-governance-checks-20260704T055525Z.json`, `support/sidecars/MAP-QA-002/artifacts/service-area-service-vitest-20260704T0414Z.json`, `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` |
| `FLEETS-MAP-003` | PASS | `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-ops-ui-20260704T0414Z.json`, `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`, `docs/03-runbooks/map-geofence-observability-runbook.md` |
| `FLEETS-MAP-004` | PASS | `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md`, `support/sidecars/MAP-MOB-DRV-001/artifacts/mobile-simulator-fallback-20260704.json`, `apps/driver-app/components/driver-trip-map.tsx` |
| `FLEETS-MAP-005` | PASS | `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-harness-20260704T0414Z.json`, `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`, `apps/api/tests/unit/map-provider-config.test.ts` |
| `FLEETS-MAP-006` | PASS | `apps/api/src/modules/feature-flags/feature-flags.service.ts`, `apps/api/tests/unit/feature-flags.service.test.ts`, `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md` |
| `FLEETS-MAP-007` | PASS | `apps/api/src/modules/service-area/service-area.service.ts`, `support/sidecars/MAP-QA-002/artifacts/service-area-service-vitest-20260704T0414Z.json`, `docs/03-runbooks/map-geofence-observability-runbook.md` |
| `FLEETS-MAP-008` | PASS | `scripts/check-map-provider-config.sh`, `apps/api/src/modules/geo/geo.module.ts`, `apps/api/src/modules/geo/external-geo.provider.ts`, `apps/api/src/modules/geo/geo-provider-config.service.ts`, `apps/api/src/main.ts`, `apps/api/src/health/health.controller.ts`, `apps/api/tests/unit/external-geo.provider.test.ts`, `apps/api/tests/unit/map-provider-config.test.ts`, `apps/api/README.md`, `.github/workflows/deploy-staging.yml`, `.github/workflows/deploy-prod.yml` |
| `FLEETS-MAP-009` | PASS | `infra/migrations/V0047__service_area_geofence_authority.sql`, `docs/03-runbooks/map-geofence-observability-runbook.md`, `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` |
| `FLEETS-MAP-010` | PASS | `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260701.md` |
| `FLEETS-MAP-011` | PASS | `support/sidecars/MAP-REL-001/MAP-REL-001-READINESS-BLOCKER-REPORT.md`, `support/sidecars/MAP-REL-001/MAP-REL-001-BLOCKER-HANDOFF-NOTES.md`, `support/sidecars/MAP-REL-001/artifacts/readiness-blocker-report.json`, `support/sidecars/MAP-REL-001/artifacts/blocker-handoff-notes.json` |

## Platform Admin Governance Publication

| Check | Verdict | Evidence |
| --- | --- | --- |
| Canonical `/service-area-governance` overview route present | PASS | `apps/platform-admin-web/app/service-area-governance/page.tsx` |
| Canonical service-area detail route present | PASS | `apps/platform-admin-web/app/service-area-governance/service-areas/[serviceAreaId]/page.tsx` |
| Canonical stop-policy detail route present | PASS | `apps/platform-admin-web/app/service-area-governance/stop-policies/[stopPolicyId]/page.tsx` |
| Shared polygon/circle governance workspace published | PASS | `apps/platform-admin-web/components/service-area-governance-page.tsx`, `packages/ui-web/src/geometry-editor.tsx` |
| Platform Admin route checks | PASS | `support/sidecars/MAP-REL-001/artifacts/platform-admin-service-area-governance-checks-20260704T055525Z.json` |

## Rollout And Rollback

| Topic | Verdict | Evidence |
| --- | --- | --- |
| Rollout flags default disabled | PASS | `apps/api/src/modules/feature-flags/feature-flags.service.ts`, `apps/api/tests/unit/feature-flags.service.test.ts` |
| Rollout order stays provider -> picker -> gate -> ops/admin -> driver | PASS | `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md` |
| Provider preflight is fail-closed for staging/production | PASS | `scripts/check-map-provider-config.sh`, `.github/workflows/deploy-staging.yml`, `.github/workflows/deploy-prod.yml`, `apps/api/src/main.ts` |
| Rollback path uses boundary/policy retire plus flag disable | PASS | `apps/api/src/modules/service-area/service-area.service.ts`, `support/sidecars/MAP-QA-002/artifacts/service-area-service-vitest-20260704T0414Z.json`, `docs/03-runbooks/map-geofence-observability-runbook.md` |

## Provider And PostGIS Prerequisites

| Prerequisite | Verdict | Evidence |
| --- | --- | --- |
| Geo runtime selects external provider when `MAP_PROVIDER_MODE=external` | PASS | `apps/api/src/modules/geo/geo.module.ts`, `apps/api/src/modules/geo/external-geo.provider.ts`, `apps/api/tests/unit/external-geo.provider.test.ts`, `apps/api/tests/unit/geo.service.test.ts` |
| Provider health/startup/preflight/deploy contracts are aligned on `MAP_PROVIDER_MODE` plus `MAP_PROVIDER_SERVER_KEY` | PASS | `apps/api/src/modules/geo/geo-provider-config.service.ts`, `apps/api/src/main.ts`, `apps/api/src/health/health.controller.ts`, `scripts/check-map-provider-config.sh`, `.github/workflows/deploy-staging.yml`, `.github/workflows/deploy-prod.yml`, `apps/api/README.md` |
| Browser/origin restrictions and quota thresholds documented | PASS | `apps/api/README.md`, `.github/workflows/deploy-staging.yml`, `.github/workflows/deploy-prod.yml`, `apps/api/tests/unit/map-provider-config.test.ts` |
| PostGIS extension required before governed geometry tables | PASS | `infra/migrations/V0047__service_area_geofence_authority.sql` |
| Evaluator/PostGIS outages are fail-closed and separately observable | PASS | `docs/03-runbooks/map-geofence-observability-runbook.md`, `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` |

## Gap Inventory Closeout

`docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260701.md`
now closes `MAP-GAP-001` through `MAP-GAP-013` with a named owner slice and
evidence path. No gap row remains unassigned in the `MAP-REL-001` release
closeout view, and the provider/runtime alignment rows (`MAP-GAP-001`,
`MAP-GAP-010`, `MAP-GAP-013`) now carry repo-backed `PASS` evidence.

## Blocker Report And Handoffs

| Artifact | Verdict | Evidence |
| --- | --- | --- |
| Readiness blocker report | PASS | `support/sidecars/MAP-REL-001/MAP-REL-001-READINESS-BLOCKER-REPORT.md`, `support/sidecars/MAP-REL-001/artifacts/readiness-blocker-report.json` |
| Blocker handoff notes | PASS | `support/sidecars/MAP-REL-001/MAP-REL-001-BLOCKER-HANDOFF-NOTES.md`, `support/sidecars/MAP-REL-001/artifacts/blocker-handoff-notes.json` |

## Verifier Results

| Verifier | Verdict | Artifact |
| --- | --- | --- |
| Dispatch integrity verifier | PASS | `support/sidecars/MAP-REL-001/artifacts/dispatch-integrity.json` |
| Readiness verifier | PASS | `support/sidecars/MAP-REL-001/artifacts/readiness-blocker-report.json` |

## Artifact Index

| Artifact type | Path |
| --- | --- |
| Manifest | `support/sidecars/MAP-REL-001/MAP-FLEETS-EXECUTION-MANIFEST-20260701.json` |
| Final evidence | `support/sidecars/MAP-REL-001/MAP-REL-001-FINAL-EVIDENCE.md` |
| Gate B route checks | `support/sidecars/MAP-REL-001/artifacts/platform-admin-service-area-governance-checks-20260704T055525Z.json` |
| Readiness blocker report | `support/sidecars/MAP-REL-001/MAP-REL-001-READINESS-BLOCKER-REPORT.md` |
| Blocker handoff notes | `support/sidecars/MAP-REL-001/MAP-REL-001-BLOCKER-HANDOFF-NOTES.md` |
| Dispatch integrity JSON | `support/sidecars/MAP-REL-001/artifacts/dispatch-integrity.json` |
| Readiness verifier JSON | `support/sidecars/MAP-REL-001/artifacts/readiness-blocker-report.json` |
| Handoff notes JSON | `support/sidecars/MAP-REL-001/artifacts/blocker-handoff-notes.json` |
