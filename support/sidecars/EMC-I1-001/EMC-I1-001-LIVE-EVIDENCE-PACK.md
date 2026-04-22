# EMC-I1-001 Forwarded-Order Live-Evidence Expansion Pack

**Task:** `EMC-I1-001`
**Owner:** `Claude`
**Reviewer:** `Codex`
**Date:** `2026-04-22`
**Status:** ready for review

---

## Purpose

This packet closes the EMC-I1-001 acceptance bar:

1. Document what was expanded in `E2E-002-forwarded-order.sh` and why.
2. Declare the env-gate split (repo-controllable vs staging-dependent vs external-adapter-dependent).
3. Provide a triage guide for operators running E2E-002 in environments that skip Phase 2 or Phase 3.
4. Confirm that forwarded-order evidence is now repeatable in any environment where the API is reachable.

This is a support-only evidence packet. It does not change canonical product truth.

---

## What Changed

### `tests/e2e/E2E-002-forwarded-order.sh`

The script was restructured from a single env-gated driver-surface scenario into a three-phase scenario with explicit env-gate tiers.

| Before (single env-gated path)                                                | After (three-phase tiered structure)                                              |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Tried to find a forwarded task in `/driver/tasks`; gracefully skipped if none | Phase 1: Always-runnable forwarder API lifecycle (ingest → list → adapter health) |
| Did not exercise forwarder API directly                                       | Phase 2: Registry-dependent lifecycle (broadcast → relay accept → sync-status)    |
| No triage documentation in script                                             | Phase 3: External-adapter-dependent driver surface (original legs, preserved)     |
| Graceful skip gave no diagnostic signal                                       | Each phase emits specific triage instructions when skipping                       |

#### Phase 1 — Repo-Controllable Forwarder Lifecycle

New legs added (always runnable):

- **1.1** `POST /forwarder/orders/inbound` — seeds a test external order with platform `grab_taiwan` and a run-unique `externalOrderId`. Uses new fixture `tests/e2e/fixtures/e2e-forwarder-ingest.json`.
- **1.2** `GET /forwarder/orders` — verifies the ingested mirror order appears in the list.
- **1.3** `GET /forwarder/adapters/health` — verifies the `grab_taiwan` adapter is registered and healthy.

Phase 1 requires only: API is reachable, forwarder module is loaded.

#### Phase 2 — Broadcast / Accept / Sync-Status Chain

New legs added (registry-dependent):

- **2.1** `POST /forwarder/orders/:mirrorOrderId/broadcast` — broadcasts to the seed driver ID; expects the regulatory registry to have at least one eligible `standard_taxi` candidate. Skips gracefully on `NO_ELIGIBLE_FORWARDER_CANDIDATES`.
- **2.2** `POST /forwarder/orders/:mirrorOrderId/accept` — relays the seed driver's accept to produce `accept_pending` status.
- **2.3** `POST /forwarder/orders/:mirrorOrderId/sync-status` — syncs `confirmed_by_platform` native status to converge the mirror order.
- **2.4** `GET /forwarder/orders` — verifies final mirror status is `confirmed_by_platform`.

Phase 2 requires: Phase 1 + seed driver/vehicle in regulatory registry as dispatchable and eligible for `standard_taxi`.

#### Phase 3 — Driver App Surface (preserved from original)

Original legs re-numbered and preserved:

- **3.1** `GET /driver/tasks` — find forwarded task in driver surface.
- **3.2** `GET /driver/tasks/:taskId` — verify `routeLocked` and `sourcePlatform`.
- **3.3** `POST /driver/tasks/:taskId/accept` — driver accepts.
- **3.4** `GET /driver/tasks/:taskId` — verify status after accept.
- **3.5** `GET /dispatch/tasks` — verify no owned dispatch assignment was created.

Phase 3 requires: Phase 2 + forwarded task visible in `/driver/tasks` (live adapter or explicit seed).

### `tests/e2e/fixtures/e2e-forwarder-ingest.json`

New fixture for the Phase 1 ingest step:

```json
{
  "platformCode": "grab_taiwan",
  "externalOrderId": "__EXTERNAL_ORDER_ID__",
  "payload": {
    "serviceBucket": "standard_taxi",
    "origin": "E2E-002-forwarded-order"
  }
}
```

The `externalOrderId` field is replaced at runtime with a run-unique ID to avoid collisions.

---

## Env-Gate Declaration

| Phase     | Requirement                                                                | What blocks it                                                        | Accepted verdict                                       |
| --------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------ |
| Phase 1   | API reachable; forwarder module loaded                                     | API not running; module misconfigured                                 | Must pass in all environments                          |
| Phase 2   | Seed driver/vehicle in regulatory registry as eligible for `standard_taxi` | Dry-run / local dev without seed data; driver not dispatchable        | SKIP acceptable in non-seeded envs                     |
| Phase 3   | Forwarded task visible in `/driver/tasks`                                  | No live adapter; forwarder broadcast not wired to driver task surface | SKIP acceptable; ENV-GATED per `FBP-014`               |
| Full PASS | Phases 1 + 2 + 3                                                           | Any of the above missing                                              | Requires staging with live adapter and seeded registry |

---

## Triage Guide

### Symptom: E2E-002 Phase 1 fails at step 1.1 (HTTP error on POST /forwarder/orders/inbound)

Likely causes:

- API is not running or not reachable at `E2E_API_URL`.
- The forwarder module is not loaded (check `ForwarderModule` is imported in `AppModule`).
- Auth headers are rejected — verify `E2E_INTERNAL_KEY` or bearer token is set for the target env.

### Symptom: E2E-002 Phase 1 fails at step 1.2 (mirror order not in list)

Likely cause: The forwarder in-memory store or persistence layer lost the record between the ingest and list calls. This should not happen in normal operation; indicates a forwarder service bug.

### Symptom: E2E-002 Phase 2 skips with "No eligible forwarder candidates"

Expected in environments without seed data applied. To enable Phase 2:

1. Confirm seed `infra/seeds/S0002__demo_operational_seed.sql` has been applied.
2. Confirm driver `10000000-0000-0000-0000-000000000381` is registered in the regulatory registry with `dispatchableFlag = true` and `exclusivityApproved = true`.
3. Confirm vehicle `10000000-0000-0000-0000-000000000351` supports the `standard_taxi` service bucket.
4. Re-run with `E2E_SEED_DRIVER_ID` and `E2E_SEED_VEHICLE_ID` pointing to eligible seed pairs.

### Symptom: E2E-002 Phase 3 skips with "No forwarded task found in driver task list"

Expected in staging without a live platform adapter. This is the same ENV-GATED verdict recorded in `FBP-014`. To enable Phase 3:

1. Confirm Phase 2 passed (the forwarder lifecycle must have created a broadcast with the seed driver).
2. Verify that the forwarder broadcast logic routes a driver task to `/driver/tasks` for the accepted driver — if the broadcast-to-driver-task wiring is missing, this gap must be tracked separately.
3. Alternatively, use a live external platform adapter (Grab Taiwan or equivalent) to inject a real forwarded order.

### Symptom: Phase 2 passes but Phase 3 still skips

The broadcast/accept/sync-status forwarder lifecycle is working, but forwarded tasks are not being surfaced through `/driver/tasks`. This means the forwarder module does not yet wire broadcast events to the owned-mobility / driver-task surface. This is consistent with the `MSC-I1-001` closeout finding: the forwarded-order driver surface depends on live platform adapter delivery, not just the internal forwarder lifecycle.

---

## Acceptance Verdict

| Criterion                                                                                   | Result |
| ------------------------------------------------------------------------------------------- | ------ |
| Forwarded-order evidence flow is repeatable (Phase 1 always runnable)                       | PASS   |
| Env gate and triage guide are explicitly documented (in script header and this packet)      | PASS   |
| Repo-controllable verification automation expansion complete (Phase 1 + Phase 2 legs added) | PASS   |
| Phase 3 (driver surface) env gate preserved from `FBP-014` without regression               | PASS   |

---

## Reviewer Notes

Please verify:

1. The Phase 1 legs are genuinely always-runnable — no hidden dependency on seed data or external adapters.
2. The Phase 2 graceful skip correctly identifies the regulatory registry as the root dependency rather than a forwarder bug.
3. The triage guide covers the common operator failure modes for each phase.
4. The original Phase 3 legs (driver surface) are functionally equivalent to the prior E2E-002 behavior and do not introduce regressions.
5. The `e2e-forwarder-ingest.json` fixture uses a platform code (`grab_taiwan`) that matches the registered stub adapter.
