# Multi-Taxi Fleets Execution Tasks

**Document version:** v1.2
**Date:** 2026-07-24
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
   the submitted design provenance and historical minimal decision
10. `10_full_17_screen_fleets_execution_tasks_20260724.md`, which supersedes
    narrowed scope and is the current Fleet dispatch register

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

Product Owner changed the UI scope on 2026-07-24 and approved all 17 submitted
operations screens. Sections below retain the original Fleet architecture and
legal baseline; `10` controls current screen ownership, merge order, and
acceptance. Any statement below that calls rating moderation, payment
exceptions, legal hold display, export orchestration, or dedicated queue pages
deferred is superseded by `08` v1.2 and `10`.

The submitted `driver app (15).zip` is preserved as an immutable source
snapshot. Its approved visual delta is promoted into the canonical canvas.
Fleets use `09` only for provenance and the historical decision, and use `10`
for current dispatch. Requirement `08` remains authoritative if any prototype
frame proposes behavior beyond a canonical contract or command.

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

The 2026-07-24 product decision approves the complete 17-screen canvas for
implementation:

| Surface | Approved screens | Current execution source |
| ------- | ---------------- | ------------------------ |
| Authorization | `MTX-AUTH-UI-01..06` | `platform-mtx-auth.jsx` |
| Queue Operations | `MTX-QUEUE-UI-01..03` | `ops-mtx-queue.jsx` |
| Rating Governance | `P5-RATE-UI-01..03` | `platform-mtx-commerce.jsx` |
| Commerce/Records | `P5-COM-UI-01..05` | `platform-mtx-commerce.jsx` |
| P-5 Passenger | existing P5 screens | existing canvas + legal state delta |
| S-3 | existing Driver/Ops screens | verification only |

The code canvas is sufficient to begin implementation. Figma, full PNG bundles,
and a separate Design QA package remain non-mandatory. Unsupported actions stay
disabled until canonical commands land.

## Wave 0: Approved Canvas Promotion

### `MTX-DESIGN-001` Full 17-Screen Handoff

**Owner:** Product Design with Platform Admin, Ops, and Passenger owners

**Depends on:** approved system spec and existing implemented surfaces

**Requirement:** `08_multi_taxi_operations_ui_design_requirements_20260723.md`

**Blocks:** production implementation of the 17 new Screen IDs

Design:

- promote the submitted authorization, queue, rating, and commerce canvases;
- preserve the four legal-minimum deltas and existing Passenger/S-3 hierarchy;
- label unsupported mutations `command-pending`;
- map each Screen ID to the production Fleet packet in `10`.

**Acceptance:** all 17 Screen IDs exist in the canonical code canvas, use
existing tokens/shells, and identify command/permission boundaries.

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
**Starts after:** mandatory preflight and current-head verification of Fleet A
dependencies; the UI delta also requires `MTX-DESIGN-001`

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
**Starts after:** mandatory preflight and current-head verification of Fleet A
dependencies; the UI delta also requires `MTX-DESIGN-001`

**Owned surfaces:** queue contracts, dispatch queue policy, Ops queue UI

Deliver:

- persisted queue mode;
- explicit profile queue policy;
- three dedicated queue operation screens, while keeping existing dispatch
  list/detail labels consistent;
- non-bypassable legal-denial state with no force check-in;
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

`P5-RATE-003` and `P5-RATE-UI-001` are now approved. Fleet D also delivers the
three rating-governance screens, invalidation authority, audit, and aggregate
rebuild evidence.

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
**Starts after:** mandatory preflight; reuse current-head P-5 authority and
report any reproducible Fleet D dependency as a blocker rather than rewriting it
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
`P5-FARE-ANOM-001`, `P5-FARE-ANOM-UI-001`, `P5-FARE-PUB-001`,
`P5-SEAT-001`, `P5-PAY-001`, `P5-PAY-OPS-UI-001`, `P5-RCT-001`,
`P5-RCT-SUPPORT-UI-001`, `P5-RET-001..003`, `P5-RET-OPS-UI-001`,
`P5-EXPORT-001`, `P5-HOLD-001`, `P5-RET-QA-001`
**Starts after:** Fleets B and E; UI deltas require `MTX-DESIGN-001`

**Owned surfaces:** geo snapshot, pricing, billing, reporting, evidence

Deliver:

- route/fare snapshot before confirmation;
- active fare authority and public fare page;
- fail-closed anomaly authority and dedicated Platform Admin queue/detail;
- seatbelt event;
- payment state/provider port and existing passenger status display;
- electronic ride certificate and support page;
- payment exception detail;
- complete operational record query/detail and 730-day retention;
- server controlled-export workflow and legal-hold display/filter.

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
Wave 0 Approved Full 17-Screen Design
  └─ MTX-DESIGN-001
       → Fleet B authorization 6-screen suite
       → Fleet C queue 3-screen suite
       → Fleet D rating-governance 3-screen suite
       → Fleet E passenger states
       → Fleet F commerce/records 5-screen suite

Current-head preflight
  → Fleets B + C + E
  → Fleet D shared shell after B
  → Fleet F shared shell after D
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

1. Wave 0 canonical 17-screen canvas promotion.
2. Fleets B, C, E, and G preflight/branch consolidation in parallel.
3. Fleet D feature work, with Platform Admin shared-file merge after Fleet B.
4. Fleet F feature work, with Platform Admin shared-file merge after Fleet D.
5. Fleet H only after B/C/D/E/F evidence and Fleet G report.

Do not dispatch production release work from this packet. Release is a separate
operator decision after Fleet H reports the final unresolved blockers.
