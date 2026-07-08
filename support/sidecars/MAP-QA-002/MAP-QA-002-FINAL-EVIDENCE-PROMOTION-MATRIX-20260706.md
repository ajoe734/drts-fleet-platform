# MAP-QA-002 Final Evidence Promotion Matrix

**Purpose:** closeout-ready row mapping for `FLEETS-CLOSEOUT-003`
**Prepared on:** `2026-07-08`
**Source QA packet:** `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md`

## Promotion matrix

| Acceptance target | Result | Row-level artifact proof |
| --- | --- | --- |
| `E2E-MAP-002` final PASS row includes admin publish artifact | PASS | `support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md` scenario row `E2E-MAP-002`, plus `support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-ADMIN-PUBLISH-PROOF-20260708.md` |
| evaluator refresh artifact | PASS | `support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-ADMIN-PUBLISH-PROOF-20260708.md` sections `Service-area publish lifecycle` and `Effective-date and active-version proof` |
| downstream Callcenter blocked-order artifact | PASS | `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-callcenter-ui-20260704T0414Z.json`, `support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-ADMIN-PUBLISH-PROOF-20260708.md` section `Downstream Callcenter blocked after publish` |
| policy/version IDs row includes active version proof | PASS | `support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-ADMIN-PUBLISH-PROOF-20260708.md` sections `Service-area publish lifecycle`, `Effective-date and active-version proof`, `Version-overlap rejection` |
| policy publish/retire audit row includes actor/version/effective-window export | PASS | `support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-ADMIN-PUBLISH-PROOF-20260708.md` section `Stop-policy publish / retire lifecycle` |
| geometry mutation row proves invalid geometry rejection and reviewed publish/retire lifecycle | PASS | `support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-ADMIN-PUBLISH-PROOF-20260708.md` sections `Invalid geometry rejection`, `Service-area publish lifecycle`, `Stop-policy publish / retire lifecycle` |

## E2E-MAP-002 closeout proof set

| Proof slice | Artifact |
| --- | --- |
| upstream service-area publish and immediate evaluator feed | `support/sidecars/MAP-QA-002/artifacts/service-area-service-vitest-20260704T0414Z.json` (`publishes service-area drafts and feeds the evaluator immediately`) |
| future-effective activation boundary | `support/sidecars/MAP-QA-002/artifacts/service-area-service-vitest-20260704T0414Z.json` (`keeps future-effective published service areas out of evaluator until active`) |
| stop-policy publish + retire lifecycle | `support/sidecars/MAP-QA-002/artifacts/service-area-service-vitest-20260704T0414Z.json` (`publishes and retires stop policies without losing service-area coverage`) |
| invalid geometry rejection | `support/sidecars/MAP-QA-002/artifacts/service-area-service-vitest-20260704T0414Z.json` (`rejects self-intersecting service-area geometry before persistence`) |
| downstream Callcenter block with reason | `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-callcenter-ui-20260704T0414Z.json` (`callcenter blocks no-pickup curb selections and shows the policy reason`) |
| consolidated admin publish packet | `support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-ADMIN-PUBLISH-PROOF-20260708.md` |
