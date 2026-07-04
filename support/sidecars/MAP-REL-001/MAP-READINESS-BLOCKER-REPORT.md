# MAP-REL-001 Readiness Blocker Report

Generated: `2026-07-04T04:50:45.685Z`
Branch@SHA: `codex/map-rel-001@141146cd072948cba837b2a82647525fe39375da`
Readiness verdict: `FAIL`

## Summary

- Release checks passing: 4
- Release checks failing: 6
- Repo-backed checks passing: 10

## Check Matrix

| Check | Release verdict | Repo-backed proof | Artifact path/link evidence | Blocker |
| --- | --- | --- | --- | --- |
| `FLEETS-MAP-ROLLOUT-FLAGS` | `PASS` | `PASS` | `apps/api/src/modules/feature-flags/feature-flags.service.ts`, `apps/api/tests/unit/feature-flags.service.test.ts` | none |
| `FLEETS-MAP-ROLLBACK` | `PASS` | `PASS` | `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md`, `docs/03-runbooks/production-rollback-drill-20260519.md`, `docs/03-runbooks/operational-observability-alert-runbook.md` | none |
| `FLEETS-MAP-POSTGIS-PREREQS` | `PASS` | `PASS` | `infra/migrations/V0047__service_area_geofence_authority.sql`, `infra/migrations/V0048__service_area_review_lifecycle.sql`, `docs/03-runbooks/map-geofence-observability-runbook.md` | none |
| `FLEETS-MAP-PROVIDER-PREREQS` | `FAIL` | `PASS` | `.env.example`, `scripts/check-map-provider-config.sh`, `apps/api/src/modules/geo/geo-provider-config.service.ts`, `docs/03-runbooks/map-provider-operational-runbook-20260630.md` | Runtime keeps MAP_PROVIDER_MODE=external fail-closed because the live provider adapter is not implemented. |
| `FLEETS-MAP-GATE-A` | `FAIL` | `PASS` | `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md`, `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md` | Repo-backed proof exists, but production release is still blocked by provider prerequisites/runtime. |
| `FLEETS-MAP-GATE-B` | `FAIL` | `PASS` | `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md`, `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`, `support/sidecars/MAP-UI-002/MAP-UI-002-INTEGRATE-001-CLOSEOUT.md`, `support/unblock/MAP-FE-ADM-001/MAP-FE-ADM-001-UNBLOCK-PLANNING-DECISION.md` | Canonical /service-area-governance UI publication and MAP-FE-ADM-001 final evidence are still missing. |
| `FLEETS-MAP-GATE-C` | `FAIL` | `PASS` | `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md`, `apps/ops-console-web/app/dispatch/ops-map-board.ts` | Repo-backed ops proof exists, but live-provider prerequisites still block production enablement. |
| `FLEETS-MAP-GATE-D` | `FAIL` | `PASS` | `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md`, `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md` | Driver device/simulator UAT is still absent and E2E-MAP-007 remains MANUAL-UAT. |
| `FLEETS-MAP-GATE-E` | `FAIL` | `PASS` | `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md`, `support/sidecars/MAP-OBS-001/MAP-OBS-001-FINAL-EVIDENCE.md`, `docs/03-runbooks/map-provider-operational-runbook-20260630.md` | Repo-backed degraded behavior exists, but production provider prerequisites/runtime still fail release. |
| `FLEETS-MAP-GAP-INVENTORY` | `PASS` | `PASS` | `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260701.md` | none |

## Blocking Conclusions

1. Governance release pass is still blocked because the canonical `/service-area-governance` UI publication and `MAP-FE-ADM-001` final evidence are not present.
2. Driver release pass is still blocked because `MAP-MOB-DRV-001` does not include device/simulator UAT and `E2E-MAP-007` remains manual.
3. Provider release pass is still blocked because runtime `MAP_PROVIDER_MODE=external` remains fail-closed until a live adapter exists, even after env/prereq reconciliation.
