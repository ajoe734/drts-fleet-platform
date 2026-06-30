# MAP Gap-To-Task Production Coverage Matrix

**Sidecar task:** `MAP-GAP-COVERAGE-SIDECAR`

**Parent task:** `MAP-REL-001` - Map/geofence production release gates

**Parent owner/reviewer:** `Codex2` / `Codex`

**Sidecar owner/reviewer:** `Codex` / `Codex2`

**Scope boundary:** support artifact only. This matrix proves the gaps have owners and evidence contracts; it does **not** prove the implementation is production-ready.

## 1. Coverage Verdict

Every `MAP-GAP-001` through `MAP-GAP-013` has an execution owner task and an E2E/release evidence path.

Production readiness is still **not proven** because several owner tasks remain `review`, `todo`, or `backlog`, and final cross-surface evidence tasks are not complete:

- `MAP-QA-002` is still `todo`; final E2E-MAP-001 through E2E-MAP-007 evidence is missing.
- `MAP-OBS-001` is still `todo`; final metrics/audit/alert/runbook evidence is missing.
- `MAP-REL-001` is still `todo`; release Gate A-E closeout is missing.
- Tenant, concierge/partner, Platform Admin, and Driver implementation tasks are not complete.

## 2. Global Evidence Contracts Already Available

| Evidence contract | Current status | What it controls |
| --- | --- | --- |
| `MAP-QA-002-SIDECAR-PLAN` | `done` | E2E-MAP-001 through E2E-MAP-007 scenario/gate matrix. |
| `MAP-REL-001-SIDECAR-GATE-AUDIT` | `done` | Release Gate A-E tracker and do-not-claim rules. |
| `MAP-OBS-001-SIDECAR-EVIDENCE` | `done` | Metrics/audit/alert evidence contract for production observability. |
| `MAP-FE-CALL-001-SIDECAR-GATEA` | `done` | Callcenter Gate A evidence packet. |
| `MAP-MOB-DRV-001-SIDECAR-UAT` | `done` | Driver Gate D mobile UAT evidence packet. |
| `MAP-FE-ADM-001-SIDECAR-GATEB` | `done` | Platform Admin / Phase 2 Gate B governance packet. |
| `MAP-FE-ENTRY-SIDECAR-GATEE` | `done` | Tenant / Concierge / Partner Gate E consistency packet. |

## 3. Gap Coverage Matrix

| Gap | Production requirement | Owner execution tasks | Release gate / E2E evidence | Current blocker |
| --- | --- | --- | --- | --- |
| `MAP-GAP-001` Shared map provider abstraction | Web/native map provider adapters behind stable interfaces, with mock/provider fallback. | `MAP-PROD-000` (`done`), `MAP-INFRA-001` (`done`), `MAP-UI-001` (`review`), `MAP-FE-OPS-001` (`done`), `MAP-MOB-DRV-001` (`backlog`) | Gate C via `E2E-MAP-006`; Gate D via `E2E-MAP-007`; provider outage via Gate E. | Shared picker still review-gated; Driver native map is backlog; final E2E not complete. |
| `MAP-GAP-002` Geocoding / reverse-geocoding authority | API-backed geocode search/resolve/reverse with audit/cache/confidence and normalized address. | `MAP-BE-002` (`review`), `MAP-BE-003` (`review`), `MAP-QA-001` (`review`), `MAP-OBS-001` (`todo`) | Gate A/E evidence through `E2E-MAP-001`, `E2E-MAP-005`, and observability contract. | Geo gateway/API client/mock harness not approved; observability still todo. |
| `MAP-GAP-003` Callcenter map pinning rollout | Agent can search, pin, drag, and confirm pickup/dropoff; command includes lat/lng/provenance. | `MAP-FE-CALL-001` (`review`), `MAP-UI-001` (`review`), `MAP-BE-004` (`done`), `MAP-BE-005` (`review`) | Gate A via `E2E-MAP-001`, `E2E-MAP-003`, `E2E-MAP-005`; sidecar `MAP-FE-CALL-001-SIDECAR-GATEA`. | Parent task and BE snapshot still review-gated; full backend/provider E2E missing. |
| `MAP-GAP-004` Service-area evaluator integrated into order creation | Booking creation blocks, warns, or routes to manual review based on backend evaluator across all entry surfaces. | `MAP-BE-004` (`done`), `MAP-BE-005` (`review`), `MAP-FE-CALL-001` (`review`), `MAP-FE-TEN-001` (`backlog`), `MAP-FE-CON-001` (`backlog`) | Gate A/E via `E2E-MAP-001`, `E2E-MAP-002`, `E2E-MAP-003`, `E2E-MAP-004`, `E2E-MAP-005`. | Non-callcenter surfaces not implemented; final E2E and observability missing. |
| `MAP-GAP-005` Platform Admin geofence editor | Versioned polygon/circle/route editor with publish workflow and audit. | `MAP-UI-002` (`review`), `MAP-UI-002-HARDEN-001` (`review`), `MAP-UI-002-INTEGRATE-001` (`backlog`), `MAP-FE-ADM-001` (`todo`) | Gate B via `E2E-MAP-002`; sidecar `MAP-FE-ADM-001-SIDECAR-GATEB`. | GeometryEditor integration and Platform Admin implementation not complete. |
| `MAP-GAP-006` Ops map is not geographic | Real map board with orders, supply, stale/no-location states, service areas, and stop policies. | `MAP-FE-OPS-001` (`done`), `MAP-BE-003` (`review`), `MAP-BE-005` (`review`), `MAP-QA-002` (`todo`) | Gate C via `E2E-MAP-006`; Gate E provider-fallback leg. | Branch-level Ops implementation exists, but final E2E and backend snapshot review are missing. |
| `MAP-GAP-007` Driver app map/navigation surface | Native trip map, pickup/dropoff pins, current location, external navigation, and route authority copy. | `MAP-MOB-DRV-001` (`backlog`), `MAP-BE-003` (`review`), `MAP-BE-005` (`review`) | Gate D via `E2E-MAP-007`; sidecar `MAP-MOB-DRV-001-SIDECAR-UAT`. | Driver implementation and mobile/simulator UAT are missing. |
| `MAP-GAP-008` Tenant and concierge flows not coordinate-consistent | All entry surfaces use same picker/validation/serviceability model. | `MAP-FE-TEN-001` (`backlog`), `MAP-FE-CON-001` (`backlog`), `MAP-UI-001` (`review`), `MAP-BE-004` (`done`), `MAP-BE-005` (`review`) | Gate E via `E2E-MAP-004`, `E2E-MAP-005`; sidecar `MAP-FE-ENTRY-SIDECAR-GATEE`. | Tenant/concierge/partner implementation not started; final cross-surface E2E missing. |
| `MAP-GAP-009` Coordinate provenance metadata | Store source, provider, place ID/candidate ID, confidence, pinned actor/time, manual override reason. | `MAP-BE-001` (`review`), `MAP-BE-005` (`review`), `MAP-UI-001` (`review`), all entry-surface tasks | Gate A/E assertions in `E2E-MAP-001`, `E2E-MAP-004`, `E2E-MAP-005`; observability contract. | Contract/snapshot/shared picker tasks not approved; cross-surface persistence proof missing. |
| `MAP-GAP-010` Map/provider degradation policy | Deterministic provider outage, no-geocode, manual coordinate, and text-only manual-review/blocked behavior. | `MAP-PROD-000` (`done`), `MAP-INFRA-001` (`done`), `MAP-UI-001` (`review`), `MAP-FE-CALL-001` (`review`), `MAP-FE-TEN-001` (`backlog`), `MAP-FE-CON-001` (`backlog`), `MAP-OBS-001` (`todo`) | Gate E via `E2E-MAP-005`; observability contract; entry sidecar. | Non-callcenter degraded behavior and final observability are missing. |
| `MAP-GAP-011` Geometry publication workflow | Draft -> review -> active -> retired geometry lifecycle with effective dating usable without SQL. | `MAP-BE-006` (`done`), `MAP-UI-002` (`review`), `MAP-UI-002-HARDEN-001` (`review`), `MAP-UI-002-INTEGRATE-001` (`backlog`), `MAP-FE-ADM-001` (`todo`) | Gate B via `E2E-MAP-002`; admin governance sidecar. | Backend exists, but admin UI and integrated GeometryEditor are not complete. |
| `MAP-GAP-012` Spatial audit trail on orders | Every order stores serviceability decision and policy/version IDs used at creation. | `MAP-BE-005` (`review`), `MAP-BE-004` (`done`), `MAP-OBS-001` (`todo`), `MAP-QA-002` (`todo`) | Gate A/B/E audit assertions across `E2E-MAP-001` through `E2E-MAP-005`. | Snapshot task is review-gated; observability and final E2E evidence missing. |
| `MAP-GAP-013` UAT evidence for map flows | Playwright/mobile evidence with mocked provider and guarded stage smoke/UAT paths. | `MAP-QA-001` (`review`), `MAP-QA-002` (`todo`), `MAP-MOB-DRV-001` (`backlog`), `MAP-REL-001` (`todo`) | All gates A-E; `MAP-QA-002-SIDECAR-PLAN`; driver UAT sidecar. | Final E2E suite, driver UAT, observability, and release closeout are incomplete. |

## 4. Gate Closeout Ownership

| Gate | Required final proof | Blocking tasks as of this matrix |
| --- | --- | --- |
| Gate A: Callcenter safe to dispatch | Serviceable callcenter booking, blocked no-pickup/not-serviceable, manual-review routing, provider-degraded fallback, persisted snapshot, Ops visibility. | `MAP-BE-001/002/003/005`, `MAP-UI-001`, `MAP-FE-CALL-001`, `MAP-QA-001`, `MAP-QA-002`, `MAP-OBS-001`. |
| Gate B: Governance safe to publish | Platform Admin publish/retire, evaluator refresh, audit payload, invalid geometry rejection, callcenter blocked-after-publish, Phase 2 separation. | `MAP-UI-002`, `MAP-UI-002-HARDEN-001`, `MAP-UI-002-INTEGRATE-001`, `MAP-FE-ADM-001`, `MAP-QA-002`, `MAP-OBS-001`. |
| Gate C: Ops safe to operate | Ops real map pins, candidate freshness/no-location, overlays, provider fallback, queue focus. | `MAP-BE-003`, `MAP-BE-005`, `MAP-QA-002`. |
| Gate D: Driver safe to navigate | Driver trip map, coordinate-based navigation, heartbeat coexistence, route-authority copy, mobile UAT. | `MAP-MOB-DRV-001`, `MAP-BE-003`, `MAP-BE-005`, `MAP-QA-002`. |
| Gate E: Degraded safe | Provider outage cannot silently create normal coordinate-less orders on any entry surface; observability distinguishes outage/ambiguity/policy denial. | `MAP-FE-TEN-001`, `MAP-FE-CON-001`, `MAP-QA-002`, `MAP-OBS-001`, `MAP-REL-001`. |

## 5. Release Closeout Rules

`MAP-REL-001` should use this matrix as the gap closeout checklist.

- A gap is `covered` only when owner tasks exist and evidence contracts define the proof.
- A gap is `closed` only when implementation tasks are `done`, final E2E/observability evidence exists, and the release gate containing that gap is `pass`.
- A gap is `external-gated` only when a required physical-device, provider, or stage smoke item is explicitly documented with owner and date.
- A sidecar `done` status never substitutes for parent implementation or final E2E evidence.

## 6. Parent And QA Handoff

Recommended note for `MAP-REL-001`:

```text
Use support/sidecars/MAP-REL-001/MAP-GAP-TO-TASK-COVERAGE-MATRIX.md as the gap closeout checklist. Every MAP-GAP-001 through MAP-GAP-013 has owner tasks and evidence contracts, but production readiness remains blocked until implementation tasks, MAP-QA-002, MAP-OBS-001, and Gate A-E release evidence are complete.
```

Recommended note for `MAP-QA-002`:

```text
Use MAP-GAP-COVERAGE-SIDECAR to verify final E2E-MAP-001 through E2E-MAP-007 covers every MAP-GAP row, not just the visible web surfaces. Treat any missing tenant/concierge/partner/admin/driver evidence as release-blocking or explicitly external-gated.
```
