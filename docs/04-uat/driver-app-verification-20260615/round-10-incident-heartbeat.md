# Round 10 — Incident / SOS (`app/incident.tsx`) + Location Heartbeat

## Plan

- Display: 安全求援 (SOS) screen — long-press SOS, incident category chips,
  escalation note.
- Functional: create an incident (driver realm); active-trip location heartbeat.
- Automated: heartbeat + incident-screen + route-display unit tests.

## Execution

- `drts-driver://incident` → `screens/r10-incident-sos.png`.
- `POST /api/incidents` (driver realm) `{title,description,category:traffic,severity:medium,reportedBy:drv-demo-001,…}`.
- `vitest driver-location-heartbeat incident-screen route-display`.
- Location heartbeat permission flow observed in Round 3 (active trip requested
  FINE+COARSE+BACKGROUND location).

## Results — PARTIAL (1 high-severity finding)

| Check                           | Expected                        | Observed                                                           | Verdict  |
| ------------------------------- | ------------------------------- | ------------------------------------------------------------------ | -------- |
| SOS screen renders              | long-press SOS + categories     | 安全求援 + SOS + 乘客衝突/交通事故/車輛故障/醫療緊急/路線威脅/其他 | PASS     |
| Escalation note                 | notifies dispatch + safety lead | "送出後會…升級給派車台與安全主管優先處理"                          | PASS     |
| **Driver creates incident/SOS** | submission succeeds             | **403 — POST /api/incidents denied for driver realm**              | **FAIL** |
| Heartbeat logic                 | unit-covered                    | driver-location-heartbeat test passes                              | PASS     |
| Incident screen logic           | unit-covered                    | incident-screen test passes (3)                                    | PASS     |
| Route display                   | unit-covered                    | route-display test passes                                          | PASS     |
| Active-trip location perms      | requested on on_trip            | FINE+COARSE+BACKGROUND requested (Round 3)                         | PASS     |
| Unit tests total                | green                           | **7 passed / 3 files**                                             | PASS     |

## Defects / Findings

1. **[HIGH — safety-critical] Driver SOS/incident submission fails with 403.**
   The 安全求援 screen is fully enabled (feature flag `driver-app.incidents` on) and
   presents a live long-press SOS + category triage, but `POST /api/incidents` is
   **denied for the `driver` realm** (allowed realms exclude `driver`). A driver
   pressing SOS would get a 403 — the safety escalation never reaches the dispatch
   / safety lead. Fix options: (a) allow the `driver` realm to `POST /api/incidents`
   **scoped** to `reportedBy = relatedDriverId = authenticated driver`; or
   (b) route driver SOS through a dedicated driver-scoped incident/SOS endpoint.
   Mirrors the earnings/statements realm-scoping class of issue but is higher
   severity because it is safety-related and the UI is actionable.
2. **[Low, from R3] Background-location gate** before the active-trip screen renders
   (documented in Round 3); add an in-app rationale before the Settings hop.

## Test-case impact

Recommended new integration coverage: a driver-SOS E2E that asserts a driver can
raise an incident (currently red against `POST /api/incidents`), to lock in the fix
for finding 1. Heartbeat/incident/route logic already unit-covered (7 tests).
