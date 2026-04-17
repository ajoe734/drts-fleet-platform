# Review Round 1 — Codex

**Reviewer:** Codex
**Baton received:** 2026-04-17T04:35:00Z
**Focus:** Phase boundary Q1/Q5, incident severity enum, GAP-003 severity assessment, backlog validation

---

## Q1: GAP-001b — minPhotoCount Phase Boundary

**Code verified:**

`apps/api/src/modules/owned-mobility/owned-mobility.service.ts:467` — enterprise dispatch
order creates with `minPhotoCount: command.minPhotoCount ?? 1`.

Test fixtures in `tests/unit/owned-mobility.test.ts:258` set `minPhotoCount: 1`.
`tests/unit/wire-contract-conformance.test.ts:334` also uses `minPhotoCount: 1`.

**Verdict: NOT a Phase 1 hotfix — promote to Phase 2 Sprint 1.**

Rationale: Changing the enterprise dispatch default breaks 2 existing unit test fixtures.
The more correct fix is to ensure the driver app sends a valid proof bundle, not to
silently weaken the server-side validation. The demo orders created via the standard
`createOrder` path default to `minPhotoCount: 0` (service.ts:208-210), which is why
the demo works today. Enterprise orders intentionally require proof.

**Recommended amendment:** Move GAP-P1-004 to `GAP-P2S1-007`:
add code comment to enterprise dispatch path clarifying the `minPhotoCount: 1` intent,
update backlog to deliver proof bundle in driver app first (GAP-P2S2-001).

---

## Q5: Incident Severity Enum

**Code verified — `packages/contracts/src/index.ts:1656-1661`:**

```typescript
export const INCIDENT_SEVERITIES = [
  "low",
  "medium",
  "high",
  "critical", // ← ALREADY EXISTS
] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];
```

**`"critical"` is already a valid IncidentSeverity.** No contracts change needed.

**BUT:** `INCIDENT_CATEGORIES` (contracts:1664-1674) does NOT include `"emergency"`:

```typescript
export const INCIDENT_CATEGORIES = [
  "safety",
  "vehicle_damage",
  "passenger_injury",
  "driver_injury",
  "property_damage",
  "weather",
  "traffic",
  "operational",
  "other",
] as const;
```

**Impact on GAP-006 (SOS screen):** The driver app `incident.tsx` sends
`category: "operational"` (hardcoded). For SOS, we should use `category: "safety"` +
`severity: "critical"`. **No new enum value needed.** GAP-P2S1-002 scope reduces to:

- Driver app `sos.tsx`: `category: "safety"`, `severity: "critical"`, one-tap UX
- No contracts extension required
- Ops console filter on severity=critical is the "priority queue" view

**Recommend:** Update GAP-P2S1-002 title to reflect no-contract-change scope.

---

## GAP-003 Assessment: DEMO_TENANT_ID Phase Severity

**Code verified — tenant-partner.service.ts:** DEMO_TENANT_ID appears **30+ times**
in tenant-partner.service.ts (lines 40, 107, 122, 140, 156, 200, 216, 237, 347, 349,
368, 372, 388, 427, 457, 518, 546, 590, 610, 648, 695, 756, 801, 827, 883, 953, 1042,
1123, 1153, 1174, 1178, 1205, 1221, 1236...).

**This is NOT a simple find-replace.** Each site needs:

1. The controller to extract tenantId from `@Headers("x-tenant-id")`
2. Pass it down to service methods
3. Service to shard in-memory maps by tenantId
4. Seed data to be per-tenant

**Revised estimate:** 3-4 days of careful work for billing + tenant-partner combined.

**Phase 1 necessity:** If Phase 1 staging only ever demos with ONE tenant
(`tenant-demo-001`), the hardcode is NOT a blocker. The current E2E tests all use
`tenant-demo-001` header. Multi-tenant isolation only matters when a second tenant
is added to the demo.

**Recommendation:** Downgrade GAP-P1-001 and GAP-P1-002 from "P1-hotfix" to
"P2-S1". Add a note: "Required before adding a second tenant to staging demo."

---

## Backlog Amendments

| Task           | Issue                                           | Recommendation                                            |
| -------------- | ----------------------------------------------- | --------------------------------------------------------- |
| GAP-P1-004     | minPhotoCount change breaks tests               | Move to P2-S1 as GAP-P2S1-007 (add code comment only)     |
| GAP-P1-001/002 | 30+ DEMO_TENANT_ID sites, multi-day work        | Downgrade to P2-S1; only needed before 2nd tenant in demo |
| GAP-P2S1-002   | Severity "critical" already in contracts        | Revise scope: SOS = safety+critical, no enum extension    |
| GAP-P2S1-001   | SOS category should be "safety" not "emergency" | Clarify in task description                               |

---

## Summary Verdict

- **The starter draft gap identification is accurate and well-cited.**
- **Critical revision:** GAP-P1-001/002 (DEMO_TENANT_ID) should be P2-S1, not P1-hotfix.
  Phase 1 is single-tenant; hardcode is not a blocker unless staging adds tenant #2.
- **Positive finding:** `IncidentSeverity = "critical"` already exists in contracts
  (index.ts:1660). GAP-P2S1-002 requires NO contract change.
- **GAP-001b** should move to P2; fixing minPhotoCount default would weaken
  intentional enterprise validation and break existing tests.
- **GAP-P1-003** (webhook UI disclaimer) remains a P1-hotfix — low effort, high
  customer-expectations value. Confirmed.

**Passing baton to Qwen for Round 2.**
