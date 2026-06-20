# MOB-BE-001 — Sidecar Acceptance Packet & Dependency Map

- **Sidecar task:** `MOB-BE-001-SIDECAR-ACCEPTANCE`
- **Parent task:** `MOB-BE-001` — Batch heartbeat API + `telemetry.driver_location_events`
- **Helper kind:** `acceptance_packet` (support-only; `mutates_canonical=false`)
- **Owner:** Claude · **Reviewer:** Codex
- **Prepared:** 2026-06-20
- **Evidence base commit:** `43a34659572402b8b5aeafc58a1312c9d3afe1d1` (branch `claude/mob-be-001-sidecar-acceptance` == `origin/dev`, P1D-WP0 merged via #791)

> Support artifact only. This packet does **not** edit canonical truth and does
> not implement MOB-BE-001. It maps the parent task's acceptance criteria to
> SD anchors and the current code surface, captures a gap analysis, and hands a
> verification checklist to the reviewer / parent owner (Codex). The parent
> owner decides whether to absorb it into the mainline slice.

---

## 1. Parent scope (machine truth, verbatim)

> 依 SD §3.4/§2.9/§4.9：POST /api/driver/location-heartbeats/batch（單次≤100），
> 保留單筆 /api/regulatory-registry/driver-location；落 telemetry.driver_location_events
> (unique device_id+sequence_no)。Heartbeat 寫 telemetry 不寫 business audit（SD §8）。附 tests。

**Parent acceptance (from board):**
- Batch heartbeat ingests up to 100; events persisted with dedupe index;
  `pnpm --filter @drts/api typecheck` + `test` pass.

**Wave boundary note (SD line 1755–1756):** Wave 3 splits backend heartbeat
work into two tasks — `MOB-BE-001 Batch heartbeat API` and
`MOB-BE-002 Idempotency / freshness`. This packet scopes acceptance to the
**MOB-BE-001 API + persistence + dedupe-index** surface. Deeper freshness
classification / out-of-order resolution / clock-skew handling beyond the
unique-index dedupe is MOB-BE-002 territory and is flagged but not gated here.

---

## 2. Dependency map

| Dependency | Status | Evidence | What MOB-BE-001 consumes from it |
|---|---|---|---|
| `P1D-WP0` (contracts + migration skeleton + scaffolds) | `done` / `merged_to_dev` | commit `43a34659` (#791); board `push_ref=origin/dev` | (a) heartbeat contracts; (b) telemetry table + dedupe index; (c) RegulatoryRegistryModule host |

**Dependency artifact anchors (all verified present at base commit):**

1. **Contracts** — `packages/contracts/src/phase1-delta-supply-eligibility.ts`
   - `DriverLocationHeartbeatEnvelope` (L254–280): `eventId`, `deviceId`,
     `driverId`, `vehicleId?`, `taskId?`, `sequenceNo`, `recordedAt`, `lat`,
     `lng`, `accuracyM?`, `workState` (7-value enum), `appState`,
     `transportMode`, `networkType`.
   - `DriverLocationHeartbeatAck` (L282–288): `eventId`, `accepted`,
     `duplicate`, `currentLocationUpdated`, `serverReceivedAt`.
   - Exported via `packages/contracts/src/index.ts`.
   - Matches SD §2.9 (doc L408–446) field-for-field.

2. **Migration** — `infra/migrations/V0034__phase1_delta_supply_eligibility_mobile_reporting.sql`
   - `CREATE SCHEMA IF NOT EXISTS telemetry;` (L23).
   - `telemetry.driver_location_events` table (L249–271): `event_id uuid PK`,
     `device_id`, `driver_id`, `vehicle_id?`, `task_id?`, `sequence_no bigint`,
     `recorded_at`, `received_at default now()`, `lat`/`lng`, `accuracy_m?`,
     `work_state`/`app_state`/`transport_mode`/`network_type`, plus
     `clock_skew_ms?` and `out_of_order default false` (MOB-BE-002 columns,
     already present in skeleton).
   - **Dedupe index** `idx_driver_device_sequence UNIQUE (device_id, sequence_no)`
     (L273–274) — the unique constraint the parent acceptance requires.
   - Lookup index `idx_driver_location_time (driver_id, recorded_at DESC)`
     (L276–277).
   - Matches SD §4.9 DDL (doc L1002–1030).

3. **Module host** — `apps/api/src/modules/regulatory-registry/`
   - `regulatory-registry.controller.ts`, `.service.ts`, `.repository.ts`,
     `.module.ts`. The retained single-shot endpoint already lives here.

---

## 3. Current code surface vs. required surface (gap analysis)

| Requirement (SD anchor) | Required | Present at base `43a34659`? | Location / note |
|---|---|---|---|
| Retain single-shot `POST /api/regulatory-registry/driver-location` (SD §3.4) | keep | ✅ present | controller L151–162 `recordDriverLocation`; service L651 `recordDriverLocation(...)` |
| New batch `POST /api/driver/location-heartbeats/batch` (SD §3.4) | add | ❌ **not implemented** | no `location-heartbeats` / `batch` route in controller; no `/api/driver` route group found |
| Request `{ items: DriverLocationHeartbeatEnvelope[] }` / Response `{ items: DriverLocationHeartbeatAck[] }` (SD §3.4 L689–703) | add | ❌ pending batch impl | contracts exist; wiring does not |
| Single call ≤ 100 items (SD §3.4 L705) | enforce | ❌ pending | guard + reject/validation behavior to be added |
| Persist into `telemetry.driver_location_events` (SD §4.9) | add | ⚠️ table ready, no writer | repository has no insert into `telemetry.driver_location_events` at base |
| Dedupe on `(device_id, sequence_no)` (parent acceptance) | enforce | ⚠️ index ready, no handling | unique index exists; ON CONFLICT / duplicate→Ack mapping pending |
| Heartbeat → telemetry, **not** business audit (SD §8 L1483) | enforce | ❌ pending impl | batch ingest must NOT emit `ingest_driver_location_batch` per-row audit; aggregate-only |
| Tests (parent acceptance) | add | ⚠️ existing suite only | `apps/api/tests/unit/regulatory-registry.service.test.ts` exists; no batch-heartbeat coverage yet |

**Reading:** the dependency floor (contracts + table + dedupe index + module
host) is fully in place. The parent slice itself (batch route, ingest writer,
≤100 guard, duplicate→Ack mapping, telemetry-not-audit discipline, tests) is the
remaining implementation. This packet does not implement any of it.

> ⚠️ **Audit-events nuance for the reviewer:** SD §8 lists
> `ingest_driver_location_batch` as a named audit event (doc L1477) *and* states
> "Heartbeat 每筆不寫 business audit … 避免 audit flood" (L1483). Reconcile as:
> per-row heartbeats emit **no** business audit; an optional single
> batch-level `ingest_driver_location_batch` event (one per request, not per
> item) is consistent with both statements. Confirm the intended granularity
> with the parent owner before treating either reading as a hard gate.

---

## 4. Acceptance checklist (for reviewer / parent owner)

Each item cites the authoritative SD anchor. Mark PASS/FAIL against the parent
implementation branch when MOB-BE-001 lands, not against this support branch.

### A. API surface (SD §3.4)
- [ ] `POST /api/driver/location-heartbeats/batch` exists and is routed.
- [ ] Retained `POST /api/regulatory-registry/driver-location` still works (no regression).
- [ ] Request body is `{ items: DriverLocationHeartbeatEnvelope[] }`.
- [ ] Response body is `{ items: DriverLocationHeartbeatAck[] }`, one Ack per submitted item, order/`eventId`-aligned.
- [ ] Batch with > 100 items is rejected (documented error contract / status), not silently truncated.
- [ ] Empty batch and malformed envelope handled deterministically.

### B. Persistence + dedupe (SD §4.9 + parent acceptance)
- [ ] Accepted items persist to `telemetry.driver_location_events` with all NOT NULL columns populated.
- [ ] Duplicate `(device_id, sequence_no)` does not error the batch; the Ack carries `duplicate=true`, `accepted` reflects intended semantics.
- [ ] Unique index `idx_driver_device_sequence` is the dedupe mechanism (no second source of truth).
- [ ] `currentLocationUpdated` in the Ack reflects whether this event advanced the driver's newest location (newest-wins; an older/out-of-order item does not regress current location).

### C. Audit discipline (SD §8)
- [ ] No per-row business audit event is written for heartbeats.
- [ ] Telemetry/ingestion metrics path is used (per SD §8 L1483 + §9 Mobile observability L1507–1515); batch-level audit granularity confirmed with owner.

### D. Quality gates (parent acceptance)
- [ ] `pnpm --filter @drts/api typecheck` passes.
- [ ] `pnpm --filter @drts/api test` passes, including new batch-heartbeat tests.
- [ ] `pnpm --filter @drts/contracts build` passes (contracts unchanged or additively extended).

### E. Scenario coverage (SD §11)
- [ ] `INT-MOB-001 batch heartbeat idempotency` (doc L1625) is covered by a test.
- [ ] `E2E-021-driver-heartbeat-replay` shape (doc L1657–1666: duplicate / out-of-order / offline backlog → dedupe → current location newest → tracking status correct) is at least unit/integration-approximated for the MOB-BE-001 surface; full E2E is `MOB-QA-001`.

---

## 5. Suggested verification commands (reviewer)

Run against the **parent** MOB-BE-001 branch once it exists (not this sidecar branch):

```bash
# contracts compile
pnpm --filter @drts/contracts build

# api typecheck + tests
pnpm --filter @drts/api typecheck
pnpm --filter @drts/api test

# confirm the batch route is wired
grep -rn "location-heartbeats/batch\|location-heartbeats" apps/api/src/modules

# confirm the ingest writer targets the dedupe-indexed table
grep -rn "driver_location_events" apps/api/src

# confirm no per-row business audit on the heartbeat path
grep -rn "ingest_driver_location_batch" apps/api/src
```

---

## 6. Scope guard / out-of-scope

- **In scope (MOB-BE-001):** batch ingest endpoint, ≤100 guard, persistence to
  `telemetry.driver_location_events`, `(device_id, sequence_no)` dedupe,
  telemetry-not-audit discipline, tests.
- **Deferred (MOB-BE-002 — Idempotency / freshness):** richer freshness
  classification (`fresh`/`stale`/`low_accuracy`/`missing`), `clock_skew_ms`
  population, `out_of_order` resolution beyond unique-index dedupe.
- **Deferred (MOB-APP-00x):** SQLite offline queue, permission gate, restart
  recovery, online-available tracking (client-side).
- **Deferred (MOB-QA-001):** full `E2E-021` harness.
- This sidecar created **no** canonical edits; only this support artifact.

---

## 7. Handoff

- **From:** Claude (sidecar owner)
- **To:** Codex (reviewer; also parent MOB-BE-001 owner)
- **Ask:** validate the dependency map and acceptance checklist against intended
  MOB-BE-001 scope; flag any anchor I mis-cited; decide whether to absorb this
  checklist into the mainline slice's test/acceptance plan.
- **Integration status:** `not_applicable` (support-only packet; `NO_COMMIT_REQUIRED`
  eligible, but the artifact will be committed + pushed on the task branch for
  durable evidence).
