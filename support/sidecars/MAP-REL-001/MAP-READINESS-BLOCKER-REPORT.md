# MAP-REL-001 Readiness Blocker Report

Generated: `2026-07-04T05:05:14.076Z`
Branch@SHA: `codex/map-rel-001@9c37aa8e621407f74f0d44ccc0c0e2444beb360d`
Readiness verdict: `FAIL`

## Summary

- Release checks passing: 8
- Release checks failing: 2
- Repo-backed checks passing: 10

## Check Matrix

| Check | Release verdict | Repo-backed proof | Artifact path/link evidence | Blocker |
| --- | --- | --- | --- | --- |
| `FLEETS-MAP-ROLLOUT-FLAGS` | `PASS` | `PASS` | `apps/api/src/modules/feature-flags/feature-flags.service.ts`, `apps/api/tests/unit/feature-flags.service.test.ts` | none |
| `FLEETS-MAP-ROLLBACK` | `PASS` | `PASS` | `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md`, `docs/03-runbooks/production-rollback-drill-20260519.md`, `docs/03-runbooks/operational-observability-alert-runbook.md` | none |
| `FLEETS-MAP-POSTGIS-PREREQS` | `PASS` | `PASS` | `infra/migrations/V0047__service_area_geofence_authority.sql`, `infra/migrations/V0048__service_area_review_lifecycle.sql`, `docs/03-runbooks/map-geofence-observability-runbook.md` | none |
| `FLEETS-MAP-PROVIDER-PREREQS` | `PASS` | `PASS` | `.env.example`, `scripts/check-map-provider-config.sh`, `apps/api/src/modules/geo/geo-provider-config.service.ts`, `apps/api/src/modules/geo/google-geo.provider.ts`, `apps/api/src/modules/geo/geo.module.ts`, `docs/03-runbooks/map-provider-operational-runbook-20260630.md` | none |
| `FLEETS-MAP-GATE-A` | `PASS` | `PASS` | `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md`, `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` | none |
| `FLEETS-MAP-GATE-B` | `FAIL` | `PASS` | `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md`, `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`, `support/sidecars/MAP-UI-002/MAP-UI-002-INTEGRATE-001-CLOSEOUT.md`, `support/unblock/MAP-FE-ADM-001/MAP-FE-ADM-001-UNBLOCK-PLANNING-DECISION.md` | Canonical /service-area-governance UI publication and MAP-FE-ADM-001 final evidence are still missing. |
| `FLEETS-MAP-GATE-C` | `PASS` | `PASS` | `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md`, `apps/ops-console-web/app/dispatch/ops-map-board.ts` | none |
| `FLEETS-MAP-GATE-D` | `FAIL` | `PASS` | `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md`, `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md` | Driver device/simulator UAT is still absent and E2E-MAP-007 remains MANUAL-UAT. |
| `FLEETS-MAP-GATE-E` | `PASS` | `PASS` | `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md`, `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`, `docs/03-runbooks/map-provider-operational-runbook-20260630.md` | none |
| `FLEETS-MAP-GAP-INVENTORY` | `PASS` | `PASS` | `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260701.md` | none |

## Blocking Conclusions

1. Gate B: Governance safe to publish: Canonical /service-area-governance UI publication and MAP-FE-ADM-001 final evidence are still missing.
2. Gate D: Driver safe to navigate: Driver device/simulator UAT is still absent and E2E-MAP-007 remains MANUAL-UAT.
