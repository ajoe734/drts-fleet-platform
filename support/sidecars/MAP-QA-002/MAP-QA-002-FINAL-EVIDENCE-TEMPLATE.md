# MAP-QA-002 Final E2E Evidence Template

**Sidecar task:** `MAP-QA-002-SIDECAR-FINAL-EVIDENCE`

**Parent task:** `MAP-QA-002` - Cross-surface map/geofence E2E suite

**Parent owner/reviewer:** `Codex2` / `Codex`

**Sidecar owner/reviewer:** `Codex` / `Codex2`

**Scope boundary:** support artifact only. This template is not final evidence and must not be renamed to `MAP-QA-002-FINAL-EVIDENCE.md` until every row contains real command output, branch/SHA, screenshots/traces/UAT links, and API/audit assertions.

## 1. How To Use This Template

Copy this file to:

```text
support/sidecars/MAP-QA-002/MAP-QA-002-FINAL-EVIDENCE.md
```

Only replace `<PASS|FAIL|EXTERNAL-GATED>` with `PASS` when the exact scenario has complete evidence. The production readiness verifier accepts a scenario only when the final evidence file contains the scenario ID and `PASS` on the same line.

Verifier-compatible final mark shape:

```text
E2E-MAP-<scenario-number>: <PASS|FAIL|EXTERNAL-GATED> - <short evidence summary>
```

If any row remains `FAIL`, `EXTERNAL-GATED`, missing, or unsupported by artifacts, `MAP-REL-001` must not claim production readiness.

## 2. Tested Branches And Environment

| Item | Value |
| --- | --- |
| QA branch/SHA | `<branch>@<sha>` |
| API branch/SHA | `<branch>@<sha>` |
| Web surfaces branch/SHA | `<branch>@<sha>` |
| Driver app branch/SHA | `<branch>@<sha or external-gated>` |
| Test environment | `<local/dev/stage>` |
| Mock provider mode | `<enabled/disabled>` |
| Live provider access | `<none/controlled smoke only>` |
| PostGIS/service-area migrations | `<migration ids and applied evidence>` |
| Feature flags | `<flag names and values>` |

## 3. Scenario Evidence Matrix

| Scenario | Final mark | Release gates | Required implementation tasks | Required evidence |
| --- | --- | --- | --- | --- |
| `E2E-MAP-001` Callcenter pins serviceable pickup/dropoff and creates phone order | `E2E-MAP-001: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Gate A, Gate C visibility | `MAP-FE-CALL-001`, `MAP-BE-004`, `MAP-BE-005`, `MAP-FE-OPS-001`, `MAP-QA-001` | Command log; order ID; pickup/dropoff lat/lng/provenance assertion; service-area snapshot assertion; Ops map pin/status screenshot or DOM hook. |
| `E2E-MAP-002` Admin publishes no-pickup zone then Callcenter attempts pickup inside it | `E2E-MAP-002: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Gate B, Gate A blocked-booking leg | `MAP-FE-ADM-001`, `MAP-UI-002-HARDEN-001`, `MAP-UI-002-INTEGRATE-001`, `MAP-BE-006`, `MAP-FE-CALL-001`, `MAP-BE-004`, `MAP-OBS-001` | Admin publish artifact; geometry validation evidence; evaluator changed result; callcenter blocked reason; audit actor/version/effective-date assertion. |
| `E2E-MAP-003` Manual-review zone | `E2E-MAP-003: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Gate A, Gate E manual fallback | `MAP-FE-CALL-001`, `MAP-BE-004`, `MAP-BE-005`, `MAP-QA-001` | UI manual-review banner; order status/manual-review marker; persisted snapshot; no normal dispatch job assertion. |
| `E2E-MAP-004` Tenant/concierge consistency | `E2E-MAP-004: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Gate E cross-surface | `MAP-FE-TEN-001`, `MAP-FE-CON-001`, `MAP-BE-004`, `MAP-BE-005`, `MAP-UI-001` | Tenant and concierge/partner screenshots/traces; same reason codes; same provenance shape; backend anti-bypass assertion. |
| `E2E-MAP-005` Provider outage degraded mode | `E2E-MAP-005: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Gate E primary, Gate A/C safety | `MAP-INFRA-001`, `MAP-UI-001`, `MAP-FE-CALL-001`, `MAP-FE-TEN-001`, `MAP-FE-CON-001`, `MAP-BE-004`, `MAP-QA-001`, `MAP-OBS-001` | Offline provider outage route; degraded banner; submit cannot create normal coordinate-less dispatch; backend error/manual-review assertion; no live-provider network call evidence. |
| `E2E-MAP-006` Ops real map board | `E2E-MAP-006: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Gate C, Gate E provider fallback | `MAP-FE-OPS-001`, `MAP-BE-003`, `MAP-BE-005`, `MAP-QA-001` | Map-ready hook; order pin count; queue focus/pan/zoom hook; stale/no-location badges; overlay chips; fallback state screenshot or DOM assertion. |
| `E2E-MAP-007` Driver trip map and navigation | `E2E-MAP-007: <PASS|FAIL|EXTERNAL-GATED> - <summary>` | Gate D, Gate E mobile degraded leg | `MAP-MOB-DRV-001`, `MAP-MOB-DRV-001-SIDECAR-UAT`, `MAP-BE-003`, `MAP-BE-005` | Driver unit/simulator command; navigation URL coordinate assertion; heartbeat assertion; Android/iOS screenshot/video or external-gated UAT packet; route-authority copy evidence. |

## 4. Command Log

Record command output with branch/SHA and artifact paths. These command family strings are intentionally exact because the release readiness verifier searches for them.

| Command | Branch/SHA | Result | Output artifact |
| --- | --- | --- | --- |
| `pnpm --filter @drts/shared-test-fixtures typecheck` | `<branch>@<sha>` | `<PASS|FAIL>` | `<path>` |
| `pnpm --filter @drts/shared-test-fixtures test` | `<branch>@<sha>` | `<PASS|FAIL>` | `<path>` |
| `pnpm --filter @drts/shared-test-fixtures lint` | `<branch>@<sha>` | `<PASS|FAIL>` | `<path>` |
| `pnpm --filter @drts/api test` | `<branch>@<sha>` | `<PASS|FAIL>` | `<path>` |
| `pnpm --filter @drts/ui-web test` | `<branch>@<sha>` | `<PASS|FAIL>` | `<path>` |
| `pnpm --filter @drts/ops-console-web typecheck` | `<branch>@<sha>` | `<PASS|FAIL>` | `<path>` |
| `pnpm --filter @drts/platform-admin-web typecheck` | `<branch>@<sha>` | `<PASS|FAIL>` | `<path>` |
| `pnpm --filter @drts/driver-app test` | `<branch>@<sha or external-gated>` | `<PASS|FAIL|EXTERNAL-GATED>` | `<path>` |
| `pnpm exec playwright test -c playwright.map-geofence-harness.config.ts` | `<branch>@<sha>` | `<PASS|FAIL>` | `<path>` |
| `pnpm test:e2e` | `<branch>@<sha>` | `<PASS|FAIL|SUBSTITUTED>` | `<path and substitute rationale>` |

If `pnpm test:e2e` is substituted, explain why the targeted configs prove every gate with equal or stronger coverage.

## 5. API / Audit Assertions

| Assertion | Scenario(s) | Result | Evidence |
| --- | --- | --- | --- |
| Order persists pickup/dropoff coordinates and coordinate provenance. | `E2E-MAP-001`, `E2E-MAP-003`, `E2E-MAP-004` | `<PASS|FAIL>` | `<API response/log path>` |
| Order persists service-area decision snapshot and policy/version IDs. | `E2E-MAP-001` through `E2E-MAP-005` | `<PASS|FAIL>` | `<API response/log path>` |
| Backend blocks no-pickup/not-serviceable attempts even if UI is bypassed. | `E2E-MAP-002`, `E2E-MAP-004`, `E2E-MAP-005` | `<PASS|FAIL>` | `<API response/log path>` |
| Policy publish/retire audit records actor, version, effect/direction, and effective date. | `E2E-MAP-002` | `<PASS|FAIL>` | `<audit query/log path>` |
| Provider outage, ambiguity, policy denial, coordinate-less attempt, manual override, and geometry mutation are distinguishable in observability. | `E2E-MAP-005`, release Gate E | `<PASS|FAIL>` | `<OBS evidence path>` |

## 6. Artifact Index

| Artifact type | Scenario(s) | Path / link |
| --- | --- | --- |
| Playwright trace | `<scenario ids>` | `<path>` |
| Screenshot | `<scenario ids>` | `<path>` |
| API response fixture | `<scenario ids>` | `<path>` |
| Audit log export | `<scenario ids>` | `<path>` |
| Metrics/query output | `<scenario ids>` | `<path>` |
| Driver simulator screenshot/video | `E2E-MAP-007` | `<path or external-gated note>` |
| Mobile UAT packet | `E2E-MAP-007` | `<path or external-gated note>` |

## 7. Blocking Failure Checklist

Mark any `yes` item as release-blocking:

| Failure condition | Yes/No | Notes |
| --- | --- | --- |
| Any scenario lacks a real branch/SHA. | `<yes/no>` | `<notes>` |
| Any scenario lacks command output. | `<yes/no>` | `<notes>` |
| Any scenario lacks screenshot/trace/UAT where required. | `<yes/no>` | `<notes>` |
| Any backend authority assertion is missing or only UI-level. | `<yes/no>` | `<notes>` |
| Provider outage test hits a live provider or consumes live quota. | `<yes/no>` | `<notes>` |
| Driver navigation uses display address text instead of coordinates. | `<yes/no>` | `<notes>` |
| Manual fallback can create a normal coordinate-less dispatchable order. | `<yes/no>` | `<notes>` |
| Platform Admin can submit invalid geometry as publish-ready. | `<yes/no>` | `<notes>` |

## 8. Handoff To MAP-REL-001

`MAP-REL-001` should consume this file only after it is copied to `MAP-QA-002-FINAL-EVIDENCE.md` and every scenario row contains a real final mark.

Safe handoff wording when complete:

```text
MAP-QA-002 final evidence is ready for MAP-REL-001. E2E-MAP-001 through E2E-MAP-007 each include PASS marks, branch/SHA, command evidence, artifacts, and API/audit assertions. Driver-only evidence is either simulator/UAT-backed or explicitly external-gated. Production readiness still requires MAP-OBS-001 and MAP-REL-001 final evidence.
```

Unsafe wording:

```text
E2E is complete because the plan/template exists.
```
