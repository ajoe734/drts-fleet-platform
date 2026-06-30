# MAP-REL-001 Final Release Evidence Template

**Sidecar task:** `MAP-REL-001-SIDECAR-FINAL-EVIDENCE`

**Parent task:** `MAP-REL-001` - Map/geofence production release gates

**Parent owner/reviewer:** `Codex2` / `Codex`

**Sidecar owner/reviewer:** `Codex` / `Codex2`

**Scope boundary:** support artifact only. This template is not final release evidence and must not be renamed to `MAP-REL-001-FINAL-EVIDENCE.md` until every gate, rollout/rollback item, environment prerequisite, gap closeout row, and command log contains real evidence.

## 1. How To Use This Template

Copy this file to:

```text
support/sidecars/MAP-REL-001/MAP-REL-001-FINAL-EVIDENCE.md
```

Only replace `<PASS|FAIL|EXTERNAL-GATED>` with `PASS` when the exact row has complete reviewer-acceptable evidence. The production readiness verifier requires the identifier and a real `PASS` verdict on the same line. Placeholder text such as `<PASS|FAIL|EXTERNAL-GATED>` is intentionally not accepted.

Verifier-compatible final gate mark shape:

```text
Gate <A-E>: <PASS|FAIL|EXTERNAL-GATED> - <short evidence summary>
```

If any Gate A-E row remains `FAIL`, `EXTERNAL-GATED`, missing, or unsupported by artifacts, this release is not production-ready.

## 2. Release Snapshot

| Item | Value |
| --- | --- |
| Release branch/SHA | `<branch>@<sha>` |
| API branch/SHA | `<branch>@<sha>` |
| Web surfaces branch/SHA | `<branch>@<sha>` |
| Driver app branch/SHA | `<branch>@<sha or external-gated>` |
| QA final evidence | `MAP-QA-002: <PASS|FAIL|EXTERNAL-GATED> - <path to MAP-QA-002-FINAL-EVIDENCE.md>` |
| OBS final evidence | `MAP-OBS-001: <PASS|FAIL|EXTERNAL-GATED> - <path to MAP-OBS-001-FINAL-EVIDENCE.md>` |
| Readiness verifier command | `node scripts/verify-map-geofence-production-readiness.mjs --json` |
| Readiness verifier result | `<PASS|FAIL>` |
| Environment | `<local/dev/stage/prod>` |
| Release owner | `<name>` |
| Reviewer | `<name>` |

## 3. Gate A-E Verdicts

| Gate | Final mark | Required evidence |
| --- | --- | --- |
| Callcenter safe to dispatch | `Gate A: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | `E2E-MAP-001`, `E2E-MAP-003`, `E2E-MAP-005`, order coordinate/provenance assertions, service-area snapshot assertions, blocked/manual-review reason visibility, Ops visibility. |
| Governance safe to publish | `Gate B: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | `E2E-MAP-002`, integrated GeometryEditor evidence, Platform Admin publish/retire evidence, evaluator refresh, audit actor/version/effective-date, invalid geometry rejection. |
| Ops safe to operate | `Gate C: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | `E2E-MAP-006`, real order pins, supply freshness/no-location states, overlays, queue focus, provider fallback state. |
| Driver safe to navigate | `Gate D: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | `E2E-MAP-007`, driver trip map pins, navigation URL coordinates, heartbeat coexistence, route-authority copy, simulator/UAT screenshots/video. |
| Degraded safe | `Gate E: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | `E2E-MAP-004`, `E2E-MAP-005`, provider outage, address ambiguity, manual override, coordinate-less attempt prevention, tenant/concierge/partner consistency, OBS evidence. |

## 4. Command Log

Record command output with branch/SHA and artifact paths.

| Command | Branch/SHA | Result | Output artifact |
| --- | --- | --- | --- |
| `pnpm --filter @drts/contracts typecheck` | `<branch>@<sha>` | `<PASS|FAIL>` | `<path>` |
| `pnpm --filter @drts/api typecheck` | `<branch>@<sha>` | `<PASS|FAIL>` | `<path>` |
| `pnpm --filter @drts/api lint` | `<branch>@<sha>` | `<PASS|FAIL>` | `<path>` |
| `pnpm --filter @drts/api test` | `<branch>@<sha>` | `<PASS|FAIL>` | `<path>` |
| `pnpm --filter @drts/api-client typecheck` | `<branch>@<sha>` | `<PASS|FAIL>` | `<path>` |
| `pnpm --filter @drts/ui-web typecheck` | `<branch>@<sha>` | `<PASS|FAIL>` | `<path>` |
| `pnpm --filter @drts/ui-web lint` | `<branch>@<sha>` | `<PASS|FAIL>` | `<path>` |
| `pnpm --filter @drts/ui-web test` | `<branch>@<sha>` | `<PASS|FAIL>` | `<path>` |
| `pnpm --filter @drts/ops-console-web typecheck` | `<branch>@<sha>` | `<PASS|FAIL>` | `<path>` |
| `pnpm --filter @drts/ops-console-web lint` | `<branch>@<sha>` | `<PASS|FAIL>` | `<path>` |
| `pnpm --filter @drts/platform-admin-web typecheck` | `<branch>@<sha>` | `<PASS|FAIL>` | `<path>` |
| `pnpm --filter @drts/platform-admin-web lint` | `<branch>@<sha>` | `<PASS|FAIL>` | `<path>` |
| `pnpm --filter @drts/driver-app test` | `<branch>@<sha or external-gated>` | `<PASS|FAIL|EXTERNAL-GATED>` | `<path>` |
| `pnpm exec playwright test -c playwright.map-geofence-harness.config.ts` | `<branch>@<sha>` | `<PASS|FAIL>` | `<path>` |
| `pnpm test:e2e` | `<branch>@<sha>` | `<PASS|FAIL|SUBSTITUTED>` | `<path and substitute rationale>` |
| `node scripts/verify-map-geofence-production-readiness.mjs --json` | `<branch>@<sha>` | `<PASS|FAIL>` | `<path>` |

If any broad command is substituted, explain why the targeted substitute proves the same release gates with equal or stronger coverage.

## 5. QA / OBS Evidence Links

| Evidence packet | Final mark | Required contents | Artifact |
| --- | --- | --- | --- |
| `MAP-QA-002` final evidence | `MAP-QA-002: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | `E2E-MAP-001` through `E2E-MAP-007`, branch/SHA, command output, screenshots/traces/UAT, API/audit assertions. | `<path>` |
| `MAP-OBS-001` final evidence | `MAP-OBS-001: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Required metrics, audit events, alerts, runbook distinctions, queries/commands/artifacts. | `<path>` |

## 6. Rollout Evidence

| rollout item | Final mark | Required evidence |
| --- | --- | --- |
| provider health / mock mode | `rollout provider health: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Feature flag values, provider health config, mock-provider CI mode proof. |
| address picker preview | `rollout address picker preview: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Flag and surface list for callcenter/tenant/concierge/partner. |
| service-area enforcement | `rollout service-area enforcement: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Backend gate enabled order, fail-closed behavior, rollback owner. |
| callcenter pinned booking | `rollout callcenter pinned booking: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Gate A evidence and operator communication. |
| ops real map | `rollout ops real map: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Gate C evidence and fallback state. |
| platform geometry governance | `rollout platform geometry governance: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Gate B evidence and publish/retire controls. |
| tenant / concierge / partner entry surfaces | `rollout tenant concierge partner: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Gate E cross-surface evidence. |
| driver trip map / navigation | `rollout driver trip map: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Gate D simulator/UAT evidence. |

## 7. Rollback Evidence

| rollback item | Final mark | Required evidence |
| --- | --- | --- |
| disable provider-backed rendering | `rollback provider rendering: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Flag name, owner, propagation time, expected degraded UI behavior. |
| keep backend service-area authority fail-closed | `rollback service-area authority: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Backend policy behavior when UI/provider degraded. |
| route coordinate-less/manual fallback safely | `rollback manual fallback: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Manual-review or blocked route; no normal dispatch path. |
| PostGIS / migration rollback | `rollback postgis migration: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Migration IDs, rollback plan, owner, test evidence. |
| operator/user communication | `rollback operator communication: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Callcenter/Ops/driver copy and communication owner. |

## 8. Environment Prerequisites

| prerequisite | Final mark | Required evidence |
| --- | --- | --- |
| postgis availability | `postgis: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Target environment PostGIS/evaluator migration proof. |
| provider keys / allowed origins / CSP / mobile config | `provider: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Provider config, CSP/allowed origin, mobile SDK config or external-gated note. |
| provider quota alerting | `quota: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Alert config and quota thresholds linked to OBS final evidence. |
| mock provider CI mode | `mock provider: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | CI/offline harness proof; no live provider quota consumed by CI. |
| smoke / stage check | `smoke: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Dev/stage smoke evidence or explicit external-gated owner/date. |

## 9. Gap Closeout

Every inventory gap must be `closed`, `fail`, or `external-gated` with evidence. Do not mark a gap closed from a sidecar plan alone.

| Gap | Final mark | Required evidence |
| --- | --- | --- |
| `MAP-GAP-001` Shared map provider abstraction | `MAP-GAP-001: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Provider adapter/mock/fallback evidence across web/native surfaces. |
| `MAP-GAP-002` Geocoding / reverse-geocoding authority | `MAP-GAP-002: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Geo search/resolve/reverse API and audit/metrics evidence. |
| `MAP-GAP-003` Callcenter map pinning rollout | `MAP-GAP-003: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Gate A callcenter evidence. |
| `MAP-GAP-004` Service-area evaluator integrated into order creation | `MAP-GAP-004: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Backend authority across all entry surfaces. |
| `MAP-GAP-005` Platform Admin geofence editor | `MAP-GAP-005: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Gate B admin publish/retire evidence. |
| `MAP-GAP-006` Ops map is not geographic | `MAP-GAP-006: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Gate C ops map evidence. |
| `MAP-GAP-007` Driver app map/navigation surface | `MAP-GAP-007: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Gate D driver simulator/UAT evidence. |
| `MAP-GAP-008` Tenant and concierge coordinate consistency | `MAP-GAP-008: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Gate E tenant/concierge/partner evidence. |
| `MAP-GAP-009` Coordinate provenance metadata | `MAP-GAP-009: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Persisted provenance and audit evidence. |
| `MAP-GAP-010` Map/provider degradation policy | `MAP-GAP-010: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Provider outage/no-match/manual-review evidence. |
| `MAP-GAP-011` Geometry publication workflow | `MAP-GAP-011: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Draft/review/active/retired lifecycle evidence. |
| `MAP-GAP-012` Spatial audit trail on orders | `MAP-GAP-012: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Order snapshot/version/audit evidence. |
| `MAP-GAP-013` UAT evidence for map flows | `MAP-GAP-013: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Playwright/mobile UAT evidence. |

## 10. Artifact Index

| Artifact type | Gate / gap | Path / link |
| --- | --- | --- |
| QA final evidence | Gate A-E | `<path>` |
| OBS final evidence | Gate A-E | `<path>` |
| Readiness verifier JSON | Gate A-E | `<path>` |
| Rollout flag export | rollout | `<path>` |
| Rollback plan / runbook | rollback | `<path>` |
| PostGIS migration evidence | postgis | `<path>` |
| Provider/CSP/mobile config evidence | provider | `<path>` |
| Smoke output | smoke | `<path>` |
| Driver UAT screenshot/video | Gate D / `MAP-GAP-007` / `MAP-GAP-013` | `<path or external-gated note>` |

## 11. Blocking Failure Checklist

Mark any `yes` item as release-blocking:

| Failure condition | Yes/No | Notes |
| --- | --- | --- |
| Any Gate A-E row lacks real PASS evidence. | `<yes/no>` | `<notes>` |
| `MAP-QA-002-FINAL-EVIDENCE.md` is missing or contains placeholder rows. | `<yes/no>` | `<notes>` |
| `MAP-OBS-001-FINAL-EVIDENCE.md` is missing or contains placeholder rows. | `<yes/no>` | `<notes>` |
| Readiness verifier exits non-zero. | `<yes/no>` | `<notes>` |
| Any `MAP-GAP-001` through `MAP-GAP-013` row is not closed or external-gated with owner/date. | `<yes/no>` | `<notes>` |
| Driver evidence is web-only without simulator/UAT or external-gated owner/date. | `<yes/no>` | `<notes>` |
| Provider outage can silently create a normal coordinate-less dispatchable order. | `<yes/no>` | `<notes>` |
| Rollback disables UI map rendering but leaves backend service-area authority unsafe. | `<yes/no>` | `<notes>` |

## 12. Final Handoff Wording

Safe wording when complete:

```text
MAP-REL-001 final release evidence is ready for review. Gate A through Gate E each include PASS marks, linked MAP-QA-002 and MAP-OBS-001 final evidence, command output, rollout/rollback evidence, environment prerequisites, readiness verifier JSON, and MAP-GAP-001 through MAP-GAP-013 closeout rows. Production-ready claim remains reviewer-gated until this packet is approved.
```

Unsafe wording:

```text
Production-ready because all templates exist.
```
