# MTX-QUEUE-003 Acceptance Evidence

Date: 2026-07-24
Task ID: `MTX-QUEUE-003`
Title: Fleet C Queue Operations
Branch: `gemini/mtx-queue-003`
Authoritative requirement head:
`8f0a8cf3bfcfb11a6afece2ccf28bf592d56941f`

## Scope Status

| Scope                                         | Status     | Evidence                                                                                                                                    |
| --------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `MTX-QUEUE-UI-01` Queue Overview              | `verified` | production route `/dispatch/queue`, required columns, GET filters, loading outcome, empty and unavailable states                            |
| `MTX-QUEUE-UI-02` Queue Entry Detail          | `verified` | production route `/dispatch/queue/{queueEntryId}`, server profile/area/site/driver/vehicle/authorization/eligibility/check-in/update fields |
| `MTX-QUEUE-UI-03` Non-Bypassable Legal Denial | `verified` | server-denied `physical_rank` and `taxi_stand` states, persistent legal copy, no mutation control                                           |
| Existing `/dispatch` queue semantics          | `verified` | previous list/detail behavior retained and covered by the same Playwright suite                                                             |
| Backend queue list/detail read model          | `partial`  | UI consumes `GET /api/dispatch/queue[/{queueEntryId}]`; current `dev` exposes check-in/check-out commands but not these read endpoints      |

The three Ops screens are implemented and mock-integrated. Production runtime
integration cannot be marked closed until the queue backend dependency exposes
the server read model. The UI fails closed when that API is unavailable and
does not fabricate records or eligibility.

## Acceptance Matrix

| Requirement                                   | Status     | Evidence                                                                                                                             |
| --------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Queue mode is explicit text, never color-only | `verified` | queue overview/detail and existing dispatch surfaces render localized text plus raw mode identifier                                  |
| Overview columns and filters                  | `verified` | mode, profile, area, site, driver, vehicle, authorization, eligibility, check-in, update, and search filters                         |
| Server-authoritative eligibility              | `verified` | `queue-operations.ts` renders denial only from `eligibility.decision = denied`; unknown decisions remain unknown                     |
| Physical-rank denial                          | `verified` | dedicated `MTX-QUEUE-UI-03` E2E                                                                                                      |
| Taxi-stand denial                             | `verified` | dedicated `MTX-QUEUE-UI-03` E2E                                                                                                      |
| Ordinary taxi isolation                       | `verified` | ordinary `physical_rank + eligible` remains an ordinary eligible detail without legal-denial state                                   |
| No override or force check-in                 | `verified` | action allowlist plus interactive DOM scan rejects override, approval, and force-check-in controls/hrefs                             |
| Safe next action                              | `verified` | only enabled server `availableActions` matching read-navigation allowlist are rendered; unknown and mutation descriptors are omitted |
| Raw reason code is not primary copy           | `verified` | localized legal explanation is primary; optional server reason code is secondary audit text only                                     |
| No production fixture fallback                | `verified` | server failures return unavailable/error states; fixtures exist only in the isolated E2E mock server                                 |
| Traditional Chinese and English               | `verified` | queue-specific translation keys and bilingual E2E/unit assertions                                                                    |

## Changed Production Paths

```text
apps/ops-console-web/app/dispatch/queue/page.tsx
apps/ops-console-web/app/dispatch/queue/queue-view.tsx
apps/ops-console-web/app/dispatch/queue/[queueEntryId]/page.tsx
apps/ops-console-web/app/dispatch/page.tsx
apps/ops-console-web/lib/queue-operations.ts
apps/ops-console-web/lib/translations.ts
```

## Test Evidence

```text
pnpm --filter @drts/ops-console-web test -- queue-operations.test.ts queue-semantics.test.ts
PASS: 7 files, 28 tests

pnpm --filter @drts/ops-console-web lint
PASS: 0 warnings

pnpm --filter @drts/ops-console-web typecheck
PASS: Next route type generation and tsc --noEmit

MAP_GEOFENCE_OPS_MOCK_API_PORT=3116 \
  pnpm exec playwright test -c playwright.ops-queue-semantics.config.ts
PASS: 9 tests
```

The default mock API port `3106` was occupied by an existing process during
verification, so Playwright was rerun on isolated port `3116`; no unrelated
process was terminated.
