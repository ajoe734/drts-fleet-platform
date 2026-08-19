# SD-DP-20260817-010 State Models Conformance Resolution

## Decision Record

- `decision_id`: `SD-DP-20260817-010`
- `title`: `Resolution of Forwarded Order (GAP-CONF-04) and Driver State Models (GAP-CONF-05) via Specification Amendment`
- `owner`: `Gemini2 / CONF-STATE-001`
- `reviewer`: `Gemini`
- `date`: `2026-08-17`
- `status`: `accepted`
- `approval`:
  - accepted by the repository owner on 2026-08-19, in answer to
    `docs/01-decisions/l1-amendment-acceptance-request-20260817.md`. This satisfies the
    human/system-design precondition `SD-DP-20260422-003` sets for a packet to supersede L1 wording
- `accepted_scope_note`:
  - `GAP-CONF-04` accepted as argued: the five removed forwarded states are pipeline phases, an
    external mirror already expressed by `authoritativeSnapshot.nativeStatus`, a per-driver action
    outcome, and two cases subsumed by `lost_race` / `cancelled_by_platform`
  - `GAP-CONF-05` accepted with the product question answered rather than assumed. A driver's
    acceptable dispatch types are **set by the platform at driver registration**
    (`CreateDriverMasterCommand.supportedServiceBuckets`, defaulting to `["standard_taxi"]`), and
    drivers have no self-selection. The removed `AVAILABLE_STANDARD` / `AVAILABLE_BUSINESS` /
    `AVAILABLE_HYBRID` states described driver agency that Phase 1 deliberately does not offer, so
    removing them records a design choice rather than deleting an unbuilt requirement. PRD 11.4
    states this explicitly
  - follow-up, not a blocker: there is no admin endpoint to change `supportedServiceBuckets` after
    registration. Recorded in the `PHASE1_OPEN_QUESTIONS.md` synchronisation backlog
- `task_id`: `CONF-STATE-001`
- `gaps_resolved`:
  - `GAP-CONF-04` (Forwarded order lifecycle states: PRD 11.2 13 states vs Contracts/Codebase 8 states)
  - `GAP-CONF-05` (Driver status model: PRD 11.4 11 states vs Multi-axis decoupled model)
- `affected_docs`:
  - `phase1_prd_detailed_v1.md` (Sections 11.2 and 11.4)
  - `CANONICAL_DOCUMENT_MAP.md`
  - `PHASE1_DECISION_LEDGER.md`
- `superseding_decision`:
  - **GAP-CONF-04**: The 8-state model in `FORWARDED_ORDER_STATUSES` (`packages/contracts/src/index.ts:5797-5806`) is ratified as the canonical lifecycle for forwarded order mirrors. The 5 absent states from PRD 11.2 (`MAPPED`, `ELIGIBLE`, `NATIVE_IN_PROGRESS`, `REJECTED`, `EXPIRED`) are resolved as specification over-specification and removed from the required top-level order enum. PRD 11.2 is amended to match the 8 canonical states (`received`, `broadcasted`, `accept_pending`, `confirmed_by_platform`, `completed_synced`, `lost_race`, `cancelled_by_platform`, `sync_failed`).
  - **GAP-CONF-05**: The monolithic 11-state driver enum in PRD 11.4 is ratified as replaced by the 4-axis orthogonal decoupled architecture implemented in the database schema and service layers:
    1. _Regulatory Driver Profile Status_ (`reg.driver_status_t`: `active`, `inactive`, `suspended`, `terminated`)
    2. _Shift & Platform Presence_ (`ShiftRecord.status`: `active`, `completed`; `PlatformPresenceStatus`: `online`, `offline`)
    3. _Driver Task Execution Lifecycle_ (`DriverTaskStatus`: `pending_acceptance`, `accepted`, `enroute_pickup`, `arrived_pickup`, `on_trip`, `proof_pending`, `completed`, `rejected`, `cancelled`)
    4. _Dynamic Qualification & Availability Engine_ (`regulatoryRegistryService.getDriverAvailability` / `VehicleEligibilityService.listEligibleSupply` evaluating license classes, vehicle exclusivity, shift status, and task occupancy)
    5. _Reservation Holds & Operational Locks_ (`ReservationHoldStatus`: `none`, `requested`, `released`, `redispatch_queue`, `exception_hold`, and `ops.order_status_t`: `preassigned`)
- `scope`:
  - `phase1_prd_detailed_v1.md` Sections 11.2 and 11.4
  - `CANONICAL_DOCUMENT_MAP.md`
  - Conformance audit documentation for `CONF-STATE-001`
- `out_of_scope`:
  - Adding or modifying any enum values or state types in `packages/contracts`, `infra/migrations`, or `apps/api`
  - Altering `phase1_service_contracts_v1.md` Section 3.7 forwarder reconciliation contracts (which already conform)
- `implementation_implications`:
  - No new production code or schema migrations are created by this task.
  - Future audits will verify conformance against `FORWARDED_ORDER_STATUSES` and the 4-axis decoupled driver architecture instead of obsolete monolithic drafts.
- `completion_bar`:
  - PRD Section 11.2 and Section 11.4 are updated with precise audit rationales.
  - Decision record is committed with clear, verifiable criteria for both gaps.
  - Zero state values or schema changes were added to the codebase.

---

## 1. GAP-CONF-04: Forwarded Order Lifecycle Resolution

### 1.1 Context and Problem Analysis

`phase1_prd_detailed_v1.md` Section 11.2 originally listed 13 draft states:
`RECEIVED`, `MAPPED`, `ELIGIBLE`, `BROADCASTED`, `ACCEPT_PENDING`, `CONFIRMED_BY_PLATFORM`, `NATIVE_IN_PROGRESS`, `COMPLETED_SYNCED`, `REJECTED`, `LOST_RACE`, `EXPIRED`, `CANCELLED_BY_PLATFORM`, `SYNC_ERROR`.

In contrast, the implemented and tested contracts (`FORWARDED_ORDER_STATUSES` in `packages/contracts/src/index.ts:5797-5806`) and forwarder service (`apps/api/src/modules/forwarder/forwarder.service.ts`) implement 8 states:
`received`, `broadcasted`, `accept_pending`, `confirmed_by_platform`, `completed_synced`, `lost_race`, `cancelled_by_platform`, `sync_failed`.

### 1.2 Evaluation of the Five Absent States

An audit across PRD Section 10.3 (Forwarder Flow), Service Contracts Section 3.7 (Forwarder Service), and `forwarder.service.ts` demonstrates why each of the 5 absent states must NOT exist as a persisted top-level order status:

1. **`MAPPED` & `ELIGIBLE`**:
   - _Nature_: Ingestion and broadcast pipeline phases.
   - _Rationale_: During `ingestExternalOrder` and `broadcastOrder`, external payload mapping (`resolveServiceBucket`) and candidate driver eligibility filtering (`vehicleEligibilityService.listEligibleSupply` / `regulatoryRegistryService.getEligibleCandidates`) execute synchronously in memory. Once validated and eligible candidates are resolved, the order immediately transitions to `broadcasted` (or remains `received` pending explicit broadcast). Persisting transient computation steps as discrete database lifecycle states would introduce intermediate state churn and race conditions without operational value.
2. **`NATIVE_IN_PROGRESS`**:
   - _Nature_: External execution mirror.
   - _Rationale_: Per Service Contracts Section 3.7, the external platform is the sole authoritative state machine for trip execution. DRTS acts as an upstream relay and mirror. When the external platform confirms driver acceptance, the mirror status transitions to `confirmed_by_platform`. During external trip execution, DRTS captures external state updates in `authoritativeSnapshot.nativeStatus` / `lastNativeStatus` (e.g. `dispatched`, `in_progress`), and the driver's unified task view surfaces `driverActionState: "in_progress"`. Creating a redundant top-level mirror enum `NATIVE_IN_PROGRESS` would create dual-authority ambiguity with the external platform's granular status updates.
3. **`REJECTED`**:
   - _Nature_: Driver action outcome, not order lifecycle state.
   - _Rationale_: A forwarded order broadcast is 1-to-N (sent to multiple candidate drivers). When an individual candidate driver rejects the broadcast via `rejectForwardedOrder()`, the response outcome is `"rejected"` and the driver is removed from `candidateDriverIds`, while the order remains `broadcasted` for other candidate drivers. Marking the order entity as `REJECTED` would prematurely kill the order for all other candidate drivers.
4. **`EXPIRED`**:
   - _Nature_: Broadcast timeout resolution.
   - _Rationale_: If an external order's validity window expires or the external platform cancels the request, the platform emits a cancellation webhook syncing to `cancelled_by_platform`. If local drivers do not accept in time and another party fulfills it, the status transitions to `lost_race`. Discrete expiration is thus fully subsumed by `cancelled_by_platform` and `lost_race`.
5. **`SYNC_ERROR` -> `sync_failed`**:
   - _Nature_: Naming alignment.
   - _Rationale_: Lowercase canonical `sync_failed` aligns with `ForwarderSyncErrorRecord`, `ReportForwarderSyncFailureCommand`, and domain event topic `forwarder.order.sync_failed` in Contracts Section 3.7.

### 1.3 Decision for GAP-CONF-04

**Specification Amendment**: Amend PRD Section 11.2 to standardize on the 8 canonical states. Contracts Section 3.7 forwarder reconciliation remains fully consistent with this model.

---

## 2. GAP-CONF-05: Driver Status Model Resolution

### 2.1 Context and Problem Analysis

`phase1_prd_detailed_v1.md` Section 11.4 originally listed 11 draft states:
`LOGGED_OUT`, `READY_OFFLINE`, `AVAILABLE_STANDARD`, `AVAILABLE_BUSINESS`, `AVAILABLE_HYBRID`, `RESERVED`, `ENROUTE`, `ON_TRIP`, `PAUSED`, `INCIDENT_HOLD`, `SUSPENDED`.

In the codebase, no monolithic 11-state enum exists. Instead, the system implements an orthogonal, multi-axis decoupled model backed by Postgres DDL (`infra/migrations/V0002__enum_types.sql`), contracts (`packages/contracts/src/index.ts`), and services (`regulatory-registry`, `shift-attendance`, `owned-mobility`).

### 2.2 Why the Multi-Axis Decoupled Model is Architecturally Superior

A single 11-state monolithic driver enum is a known operational anti-pattern in dispatch platforms because driver state is inherently multi-dimensional:

- A driver can be on a business trip (`ON_TRIP`) while their regulatory license is suspended by an admin (`SUSPENDED`). A single enum forces an impossible choice between task execution tracking and regulatory blocking.
- A driver pre-assigned to a future airport reservation (`RESERVED`) must still be able to complete immediate standard taxi trips until the reservation pickup window arrives.

The DRTS platform resolves this via four decoupled axes plus dynamic qualification:

1. **Axis 1: Regulatory Driver Profile Lifecycle (`reg.driver_status_t`)**:
   - Enum: `active`, `inactive`, `suspended`, `terminated` (`V0002:123-126`).
   - Invariant: `assertDriverAuthEligible()` (`regulatory-registry.service.ts:1971`) validates this on every authentication token check. `SUSPENDED` or `TERMINATED` immediately revokes API access and prevents dispatch.
2. **Axis 2: Shift Attendance & Presence (`PlatformPresenceStatus`)**:
   - Shift: `ShiftRecord.status` (`active` vs `completed`).
   - Presence: `PlatformPresenceStatus` (`online` vs `offline`).
   - Invariant: A driver must clock in to an active shift with a dispatchable vehicle before going online.
3. **Axis 3: Active Task Execution Lifecycle (`DriverTaskStatus`)**:
   - Enum: `pending_acceptance`, `accepted`, `enroute_pickup`, `arrived_pickup`, `on_trip`, `proof_pending`, `completed`, `rejected`, `cancelled` (`packages/contracts/src/index.ts:2863-2874`).
   - Maps task progress (`ENROUTE`, `ON_TRIP`, `PROOF_PENDING`) per assigned trip rather than overloading driver identity.
4. **Axis 4: Dynamic Qualification Engine (`getDriverAvailability`)**:
   - Real-time evaluation: `regulatoryRegistryService.getDriverAvailability(driverId, serviceBucket)` and `vehicleEligibilityService.listEligibleSupply()`.
   - Rationale: Drivers do not toggle static `AVAILABLE_STANDARD` / `AVAILABLE_BUSINESS` modes. Eligibility across service buckets (`standard_taxi`, `business_dispatch`) is calculated dynamically on demand against driver endorsements, vehicle compliance (energy type, accessibility, exclusivity approvals), shift status, and current task occupancy.
5. **Axis 5: Reservation Pre-Assignment & Operational Holds**:
   - Reservation locks: `ReservationHoldStatus` (`none`, `requested`, `released`, `redispatch_queue`, `exception_hold`) and `ops.order_status_t` (`preassigned`) track driver reservation locks and pre-assignments per PRD 9.3.2.
   - Compliance & incident holds: Handled via `DriverTaskRecord.complianceGates` and regulatory status flags without corrupting the presence state machine.

### 2.3 Decision for GAP-CONF-05

**Specification Amendment**: Amend PRD Section 11.4 to document the multi-axis decoupled model. No new enum or production code is introduced.

---

## 3. Conformance and Audit Checklist for Future Verification

Future auditors can verify that the system satisfies both models with the following checklist:

| Check Item                       | Verified Location                                                                         | Conformance Rule                                                                                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Forwarded Order Enum             | `packages/contracts/src/index.ts:5797` (`FORWARDED_ORDER_STATUSES`)                       | Exactly 8 states: `received`, `broadcasted`, `accept_pending`, `confirmed_by_platform`, `completed_synced`, `lost_race`, `cancelled_by_platform`, `sync_failed` |
| Forwarded Service Reconciliation | `apps/api/src/modules/forwarder/forwarder.service.ts:756, 822`                            | Authoritative snapshot preserves external `nativeStatus`; reconciliation jobs resolve sync failures                                                             |
| Regulatory Driver Status         | `infra/migrations/V0002__enum_types.sql:123` (`reg.driver_status_t`)                      | Exactly 4 values: `active`, `inactive`, `suspended`, `terminated`                                                                                               |
| Driver Shift & Presence          | `packages/contracts/src/platform-presence.ts:3`, `apps/api/src/modules/shift-attendance/` | `PlatformPresenceStatus` is `"online" \| "offline"`; `ShiftRecord.status` is `"active" \| "completed"`                                                          |
| Driver Task Lifecycle            | `packages/contracts/src/index.ts:2863` (`DRIVER_TASK_STATUSES`)                           | Exactly 9 states: `pending_acceptance`, `accepted`, `enroute_pickup`, `arrived_pickup`, `on_trip`, `proof_pending`, `completed`, `rejected`, `cancelled`        |
| Supply Qualification             | `regulatory-registry.service.ts:1963`, `vehicle-eligibility.service.ts:540`               | `getDriverAvailability(driverId, serviceBucket)` computes on-demand eligibility across service buckets                                                          |
| Reservation Holds                | `packages/contracts/src/index.ts:2885`, `owned-mobility.service.ts:2448`                  | `ReservationHoldStatus` and `ops.order_status_t.preassigned` represent reservation locks                                                                        |
