# Multi-Taxi Fleets Execution Tasks

**Document version:** v1.1
**Date:** 2026-07-23  
**Execution baseline:** `dev@2711c366f2e103ae9556d5afaf4558dfd9b0bb4c`
**Purpose:** Convert the approved Phase-1 system and UI specifications into
collision-aware tasks that Fleets can execute.  
**Boundary:** This document authorizes task preparation and implementation PRs
only. It does not authorize publish, promotion, staging, or production
deployment.

---

# 1. Authoritative Inputs

Fleets must use these sources in this order:

1. `source_specs/01_system_development_team_spec_20260720.md`
2. `source_specs/02_ui_visual_design_team_brief_20260720.md`
3. `source_specs/03_cross_team_handoff_matrix_20260720.md`
4. `04_standard_taxi_vs_multi_taxi_dispatch_compliance_review_20260721.md`
5. `05_external_review_reconciliation_20260722.md`
6. `06_multi_taxi_runtime_execution_register_20260723.md`
7. `08_multi_taxi_operations_ui_design_requirements_20260723.md`
8. This execution packet
9. `09_uploaded_system_design_archive_execution_tasks_20260723.md`, only for
   the submitted design archive, current-head delta, and narrowed task packets

The system architecture is frozen for execution:

```text
runtime profiles:
  ordinary_taxi
  multi_taxi_direct
  business_dispatch

multi_taxi_direct:
  acquisitionMode = platform_reserved
  timingMode = on_demand | scheduled
  queueMode = virtual_matching

forbidden for multi_taxi_direct:
  street_hail
  physical_rank
  taxi_stand
```

Fleets must not reopen these decisions in implementation PRs.

The submitted `driver app (15).zip` is preserved as a non-canonical visual
overlay. Fleets must use `09` for its per-file disposition and current dispatch
register. Requirement `08` remains authoritative if any archived frame proposes
additional routes, commands, consoles, or navigation.

---

# 2. Mandatory Preflight

The execution baseline may already contain partial or complete implementations.
Every Fleet must perform this preflight before editing:

1. Map its Task IDs to current contracts, migrations, services, APIs, UI, and
   tests on `dev`.
2. Classify each acceptance item as `missing`, `partial`, `implemented`, or
   `verified`.
3. Reuse implemented behavior. Do not rewrite it solely to claim ownership.
4. If all acceptance items already pass, submit an evidence-only closeout
   instead of a replacement implementation.
5. Do not change canonical source specs. Any ambiguity is returned to the
   Supervisor as a decision request.

Required preflight output:

```text
support/sidecars/<TASK-ID>/CURRENT-HEAD-PREFLIGHT.md
```

The preflight must include the inspected commit, exact file references, test
commands, and remaining delta.

---

# 3. UI Design Readiness

The UI brief is approved, but not every operational surface is Design Ready for
Implementation.

| Surface         | Existing coverage                                    | Remaining minimum delta                           | Status              |
| --------------- | ---------------------------------------------------- | ------------------------------------------------- | ------------------- |
| P-5 Passenger   | `p5-ui.jsx`, `p5-screens.jsx`, live ride route       | Rating, payment, and receipt state verification   | reuse + small delta |
| P-5 Back Office | `platform-p5.jsx`, live authorization page           | Authorization usability and record query/download | reuse + small delta |
| Ops Dispatch    | Existing dispatch list/detail                        | Multi-taxi service/queue labels and denial copy   | small delta         |
| S-3             | Driver and Ops implementation/canvases already exist | Current-head verification only                    | no redesign         |

Existing canvases are visual source and must be reused. Missing operational
behavior must be added to the closest existing surface. The legal/practical
scope, four UI deltas, deferred features, and minimum Definition of Done are in
`08_multi_taxi_operations_ui_design_requirements_20260723.md`.

The archived UI brief does not make Figma, PNG count, rating moderation,
payment exception management, legal hold, or a separate Design QA process a
legal MVP gate. This execution packet follows the later practicality decision
captured in requirement v1.1.

The 2026-07-23 submitted design overlay is archived under
`docs/05-ui/drts-design-canvas/archive/20260723-driver-app-15/`. Its accepted
subsets, rejected concepts, current-head observations, and directly
dispatchable Fleet B/C/E/F/G/H packets are recorded in
`09_uploaded_system_design_archive_execution_tasks_20260723.md`.

## Wave 0: Minimum Design Delta

### `MTX-DESIGN-001` Four-Delta Compliance Handoff

**Owner:** Product Design with Platform Admin, Ops, and Passenger owners

**Depends on:** approved system spec and existing implemented surfaces

**Requirement:** `08_multi_taxi_operations_ui_design_requirements_20260723.md`

**Blocks:** only the UI portions of `MTX-AUTH-UI-001`, `MTX-QUEUE-003`,
`P5-PAX-WEB-001`, `P5-PAY-001`, `P5-RCT-001`, and `P5-RET-003`

Design:

- improve the existing authorization page without adding routes;
- add two labels and one denial message to existing dispatch surfaces;
- complete rating/payment/receipt states in the existing passenger ride flow;
- define one minimal operational-record query/download flow.

Explicitly deferred:

- rating moderation;
- payment exception and fare anomaly consoles;
- legal hold;
- export job orchestration;
- new design system or dedicated queue pages;
- mandatory Figma/PNG/Design-QA package.

**Acceptance:** each delta identifies its existing route/component, canonical
fields, available actions, final copy, and minimum empty/error state. The
handoff medium may be an incremental design frame, annotated canvas, or code
prototype.

---

# 4. Implementation Fleet Packets

## Fleet A: Runtime Authority

**Task IDs:** `MTX-CORE-001..005`, `MTX-CORE-QA-001`  
**Starts after:** mandatory preflight  
**Owned surfaces:** contracts, API intake, owned-mobility runtime, persistence

Deliver:

- canonical runtime context on every relevant order;
- server-authoritative profile resolution;
- dedicated passenger and call-center multi-taxi intake;
- profile-scoped service-product activation;
- legal acquisition/timing validation.

Acceptance:

```text
on-demand platform_reserved pass
scheduled platform_reserved pass
public spoofed profile denied
street_hail denied
physical_rank denied
no any-based subtype comparison
```

Evidence:

- unit tests for resolver and policy;
- API integration tests for both intake routes;
- current-head E2E for on-demand and scheduled orders;
- persisted order readback.

## Fleet B: Operating Authorization

**Task IDs:** `MTX-AUTH-001..003`, `MTX-AUTH-UI-001`,
`MTX-AUTH-QA-001`  
**Starts after:** Fleet A; remaining UI delta also requires `MTX-DESIGN-001`

**Owned surfaces:** contracts, migration, authorization service/API,
Platform Admin authorization route

Deliver:

- operator authorization and vehicle-membership authority;
- effective-window, status, service-area, and active-fare checks;
- admin lifecycle API and UI;
- hard eligibility gate with no Ops bypass.

Acceptance:

```text
approved + effective + authorized vehicle passes
draft/suspended/expired/revoked denied
missing vehicle membership denied
wrong service area denied
inactive fare version denied
all writes audited
```

## Fleet C: Queue Semantics

**Task IDs:** `MTX-QUEUE-001..003`, `MTX-QUEUE-QA-001`  
**Starts after:** Fleet A; remaining UI delta also requires `MTX-DESIGN-001`

**Owned surfaces:** queue contracts, dispatch queue policy, Ops queue UI

Deliver:

- persisted queue mode;
- explicit profile queue policy;
- two Ops labels and inline legal-denial copy on existing dispatch surfaces;
- negative E2E for physical rank and taxi stand.

Acceptance:

```text
multi_taxi_direct + virtual_matching passes
multi_taxi_direct + physical_rank denied
multi_taxi_direct + taxi_stand denied
ordinary_taxi policy remains independently configurable
```

## Fleet D: P-5 Data Authority and Assignment

**Task IDs:** `P5-RATE-001..002`, `P5-RATE-QA-001`,
`P5-GATE-001..002`, `P5-SNAP-001`, `P5-ASSIGN-001`,
`P5-REDISPATCH-001`, `P5-ASSIGN-QA-001`,
`P5-REDISPATCH-QA-001`  
**Starts after:** Fleets B and C

**Owned surfaces:** rating, eligibility, assignment transaction, outbox

Deliver:

- canonical rating submission and passenger-visible aggregate;
- P-5 hard eligibility reasons;
- atomic assignment, disclosure snapshot, token, and outbox;
- version-safe redispatch.

`P5-RATE-003` rating moderation is deferred and does not block this Fleet.

Acceptance:

```text
0 ratings renders new_driver
duplicate rating is idempotent
incomplete disclosure cannot assign
scarcity cannot bypass a legal gate
assignment rollback leaves no partial snapshot/token/outbox
stale redispatch event cannot replace a newer assignment
```

## Fleet E: Live Passenger Authority

**Task IDs:** `P5-PAX-001..003`, `P5-PAX-WEB-001`,
`P5-PAX-GATE-001`, `P5-PUSH-001`, `P5-CALL-001`  
**Starts after:** Fleet D  
**Owned surfaces:** passenger API/SSE, Passenger Web adapter, provider ports

Reuse the approved P5 canvases. Do not redesign the passenger hierarchy.

Deliver:

- opaque ride access token with digest-only persistence;
- token-scoped read, cancel, rating, contact, and receipt APIs;
- monotonic/versioned SSE;
- live Passenger Web adapter;
- production fixture prohibition;
- push and masked-call provider ports with explicit unavailable fallback.

Acceptance:

```text
raw token never persisted or logged
wrong/expired token denied
stale event ignored
production bundle cannot resolve fixture data
raw driver phone never reaches passenger
provider absence is explicit, not simulated success
```

External adapters remain `blocked_ext` until provider credentials and contract
tests are supplied.

## Fleet F: Fare, Payment, Receipt, and Retention

**Task IDs:** `P5-ROUTE-001`, `P5-FARE-001`,
`P5-FARE-ANOM-001`, `P5-FARE-PUB-001`, `P5-SEAT-001`,
`P5-PAY-001`, `P5-RCT-001`, `P5-RET-001..003`,
`P5-RET-QA-001`  
**Starts after:** Fleets B and E; UI deltas require `MTX-DESIGN-001`

**Owned surfaces:** geo snapshot, pricing, billing, reporting, evidence

Deliver:

- route/fare snapshot before confirmation;
- active fare authority and public fare page;
- fail-closed anomaly handling without a dedicated Ops console;
- seatbelt event;
- payment state/provider port and existing passenger status display;
- electronic ride certificate;
- complete operational record and 730-day retention/query/download.

Acceptance:

```text
fare version is immutable per confirmed ride
fare-change rule visible before confirmation
payment unavailable never appears paid
certificate is token-scoped
completed trip record coverage is 100%
retention floor is 730 days
authorized regulator query/download is available
```

PSP integration remains `blocked_ext` until credentials, sandbox cases, and
signed contract tests are available.

## Fleet G: S-3 Production Verification

**Task IDs:** `S3-VERIFY-001..005`  
**Starts after:** mandatory preflight; may run in parallel

**Owned surfaces:** QA, Mobile QA, Security, Observability

Do not rebuild the S-3 domain or screens. Verify the landed implementation:

- current-head API/Driver/Ops E2E;
- Android and iOS offline replay;
- attachment scanning;
- alert-to-Ops p95 at or below five seconds;
- forbidden vocabulary and screenshot evidence.

Physical-device and production-observability evidence cannot be replaced by a
local mock.

## Fleet H: Cross-Surface Release QA

**Task IDs:** `E2E-MTX-001..008`, `E2E-P5-001..005`,
`E2E-S3-001..005`  
**Starts after:** Fleets A through G  
**Owned surfaces:** hermetic E2E, evidence aggregation, release report

Deliver one evidence matrix containing:

- scenario;
- test command/run URL;
- order/authorization/snapshot identifiers;
- API and DB readback;
- UI screenshot where applicable;
- expected and actual reason/status;
- commit SHA.

This Fleet may recommend release readiness but may not publish or deploy.

---

# 5. Collision and Dependency Rules

Only one Fleet may own each high-collision surface at a time:

| Surface                                | Exclusive owner while active                        |
| -------------------------------------- | --------------------------------------------------- |
| runtime order contracts and migrations | Fleet A, then Fleet B, then Fleet D                 |
| owned-mobility assignment service      | Fleet A, then Fleet C, then Fleet D                 |
| Platform Admin translations/navigation | Fleet B, then Fleet D, then Fleet F                 |
| Passenger ride contracts/API           | Fleet D, then Fleet E, then Fleet F                 |
| E2E shared harness                     | Fleet H; earlier Fleets add isolated scenarios only |

Dependency order:

```text
Wave 0 Minimum Design
  └─ MTX-DESIGN-001
       → Fleet B authorization delta
       → Fleet C queue labels
       → Fleet E passenger states
       → Fleet F record query/download

Fleet A
  → Fleets B + C
  → Fleet D
  → Fleet E
  → Fleet F
  → Fleet H

Fleet G may run in parallel because S-3 is verification-only.
```

---

# 6. Per-Task PR Contract

Every Fleet PR must include:

```text
Task-ID: <single primary Task ID>
Depends-On: <Task IDs or none>
Baseline-SHA: <dev SHA used for preflight>
Design-Source: <canvas/handoff reference or n/a>
```

Required evidence:

1. preflight report;
2. implementation diff limited to owned surfaces;
3. unit/integration/E2E commands and results;
4. migration replay where schema changes;
5. API/DB readback for persisted authority;
6. screenshots only for changed UI surfaces;
7. residual external blockers;
8. rollback or disable strategy.

No task is `done` when it has only a contract, migration, UI, mock, screenshot,
or document. `done` requires code, tests, and current-head evidence for the
whole acceptance boundary.

---

# 7. Supervisor Dispatch Order

Dispatch in this order:

1. Wave 0 minimum design delta.
2. Fleet A preflight and delta.
3. Fleets B and C after Fleet A contracts freeze.
4. Fleet D after authorization and queue policy.
5. Fleet E after atomic assignment.
6. Fleet F after live passenger authority and the minimum record/passenger
   handoff.
7. Fleet G verification in parallel where devices/environments are available.
8. Fleet H only after all non-external tasks have evidence.

Do not dispatch production release work from this packet. Release is a separate
operator decision after Fleet H reports the final unresolved blockers.
