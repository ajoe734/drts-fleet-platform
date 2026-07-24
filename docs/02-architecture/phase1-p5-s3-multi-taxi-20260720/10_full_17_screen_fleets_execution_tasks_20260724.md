# Full 17-Screen Fleets Execution Tasks

**Document version:** v1.1
**Date:** 2026-07-24
**Status:** Repository implementation verified; external evidence pending
**Execution baseline:** `origin/dev@cf26c0c43`
**Release candidate:** `codex/mtx-release-gaps-20260724`
**Requirement:** `08_multi_taxi_operations_ui_design_requirements_20260723.md`
v1.2
**Design source:** `docs/05-ui/drts-design-canvas/`
**Decision:** Product Owner approved all previously deferred 17 screens for
development.

This packet supersedes the minimal-scope dispatch decisions in `09` while
preserving its ZIP provenance and branch audit. It does not claim that all 17
screens are legally mandatory. It converts the expanded product decision into
implementation work.

---

# 1. Screen Register

| Group         | Screen ID         | Screen                       | Fleet | Primary task                              |
| ------------- | ----------------- | ---------------------------- | ----- | ----------------------------------------- |
| Authorization | `MTX-AUTH-UI-01`  | Authorization Registry       | B     | `MTX-AUTH-UI-001`                         |
| Authorization | `MTX-AUTH-UI-02`  | Authorization Detail         | B     | `MTX-AUTH-UI-001`                         |
| Authorization | `MTX-AUTH-UI-03`  | Draft Editor                 | B     | `MTX-AUTH-UI-001`                         |
| Authorization | `MTX-AUTH-UI-04`  | Lifecycle Confirmation       | B     | `MTX-AUTH-UI-001`                         |
| Authorization | `MTX-AUTH-UI-05`  | Authorized Vehicles          | B     | `MTX-AUTH-UI-001`                         |
| Authorization | `MTX-AUTH-UI-06`  | Conflict／Permission State   | B     | `MTX-AUTH-UI-001`                         |
| Queue         | `MTX-QUEUE-UI-01` | Queue Overview               | C     | `MTX-QUEUE-003`                           |
| Queue         | `MTX-QUEUE-UI-02` | Queue Entry Detail           | C     | `MTX-QUEUE-003`                           |
| Queue         | `MTX-QUEUE-UI-03` | Non-Bypassable Legal Denial  | C     | `MTX-QUEUE-003`                           |
| Rating        | `P5-RATE-UI-01`   | Rating Review Queue          | D     | `P5-RATE-003`／`P5-RATE-UI-001`           |
| Rating        | `P5-RATE-UI-02`   | Rating Review Detail         | D     | `P5-RATE-003`／`P5-RATE-UI-001`           |
| Rating        | `P5-RATE-UI-03`   | Driver Rating Authority      | D     | `P5-RATE-UI-001`                          |
| Commerce      | `P5-COM-UI-01`    | Fare Anomaly Queue／Detail   | F     | `P5-FARE-ANOM-001`／`P5-FARE-ANOM-UI-001` |
| Commerce      | `P5-COM-UI-02`    | Payment Exception Detail     | F     | `P5-PAY-001`／`P5-PAY-OPS-UI-001`         |
| Commerce      | `P5-COM-UI-03`    | Certificate Support          | F     | `P5-RCT-001`／`P5-RCT-SUPPORT-UI-001`     |
| Commerce      | `P5-COM-UI-04`    | Operational Record Query     | F     | `P5-RET-003`／`P5-RET-OPS-UI-001`         |
| Commerce      | `P5-COM-UI-05`    | Controlled Export／Retention | F     | `P5-EXPORT-001`／`P5-HOLD-001`            |

The screen count is exactly 17. Passenger ride and S-3 work remain in the
program but are not counted as new screens because their canonical canvases
already exist.

---

# 2. Mandatory Current-Head Preflight

Every Fleet must create:

```text
support/sidecars/<PRIMARY-TASK-ID>/CURRENT-HEAD-PREFLIGHT.md
```

The preflight must classify every acceptance item:

```text
missing
partial
implemented
verified
blocked_command
blocked_ext
```

Rules:

1. Reuse existing routes, contracts, APIs, components, and tests.
2. Do not replace landed code only to claim a task.
3. A code canvas is visual authority, not production implementation.
4. A disabled prototype action does not prove a backend command exists.
5. If a task is already complete on current `dev`, submit evidence-only
   closeout.
6. External PSP, push, call, or device evidence remains `blocked_ext`; do not
   fake provider success.

---

# 3. Existing Branch Claims

| Task                | Existing work                                                       | Dispatch decision                                                                                  |
| ------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `MTX-AUTH-UI-001`   | `origin/gemini/mtx-auth-ui-001` has unmerged implementation commits | Fleet B resumes and rebases this branch; no duplicate implementation branch                        |
| `MTX-QUEUE-003`     | codex/gemini branches overlap                                       | Fleet C uses `origin/gemini/mtx-queue-003` as the review candidate and stops duplicate branch work |
| `P5-RET-UI-001`     | #1130 squash-merged                                                 | Fleet F starts expanded record/export work from latest `dev`, not stale branches                   |
| `S3-VERIFY-001`     | codex/gemini evidence branches exist                                | Fleet G consolidates evidence; no second S-3 product implementation                                |
| Rating governance   | no matching open PR found at approval time                          | Fleet D starts after preflight                                                                     |
| Passenger UI delta  | no matching open PR found at approval time                          | Fleet E starts after preflight                                                                     |
| Full commerce suite | only minimum records baseline landed                                | Fleet F starts feature modules after preflight                                                     |

Open PR #1126 is an older `MTX-QUEUE-001` backend candidate and does not satisfy
the three queue UI screens.

---

# 4. Fleet B: Authorization Suite

**Primary Task:** `MTX-AUTH-UI-001`
**Screens:** `MTX-AUTH-UI-01..06`
**Status:** `resume_existing_branch`
**Depends on:** `MTX-AUTH-001..003`

**Owned production surfaces:**

```text
apps/platform-admin-web/app/multi-taxi-authorizations/
authorization-specific components
authorization-specific tests
authorization translation keys
```

**Deliver:**

1. registry search/filter/sort and effective-window warnings;
2. canonical detail with lifecycle, fare, service areas, vehicle summary, and
   audit timestamps;
3. create/edit draft with field and summary validation;
4. activate/suspend confirmation using server-owned preview values only;
5. authorized vehicle current/history list and add flow;
6. loading, empty, stale/conflict, unavailable, session/capability change, and
   permission states;
7. responsive 1440/1280/1024 layouts and keyboard operation.

**Command boundary:**

- enable create/update/activate/suspend/add vehicle only when capability and API
  support exist;
- `revoke`, `restore`, `delete`, vehicle suspend/remove remain disabled until
  an approved command task lands;
- no client-side lifecycle authority.

**Acceptance evidence:**

- six Screen IDs mapped to production routes/surfaces;
- status/capability matrix tests;
- conflict and 403 tests;
- unsupported action absence/disabled tests;
- screenshots for registry, detail, draft error, vehicles, confirmation, and
  conflict/permission state.

---

# 5. Fleet C: Queue Operations

**Primary Task:** `MTX-QUEUE-003`
**Screens:** `MTX-QUEUE-UI-01..03`
**Status:** `consolidate_existing_branches`
**Depends on:** `MTX-QUEUE-001..002`

**Owned production surfaces:**

```text
apps/ops-console-web/app/dispatch/queue/
existing dispatch integrations
queue-specific translations and tests
```

**Deliver:**

1. queue overview with mode/profile/area/site/driver/vehicle/authorization/
   eligibility/check-in/update columns and filters;
2. queue detail explaining server eligibility and authorization context;
3. dedicated denial state for `physical_rank` and `taxi_stand`;
4. existing `/dispatch` list/detail labels remain consistent with the new
   queue pages;
5. safe next action only when supplied by canonical `availableActions`.

**Hard boundary:**

```text
multi_taxi_direct + virtual_matching = eligible when other gates pass
multi_taxi_direct + physical_rank = denied
multi_taxi_direct + taxi_stand = denied
```

No override, force check-in, raw reason-code primary copy, or locally fabricated
eligibility.

**Acceptance evidence:**

- three Screen IDs mapped;
- list/detail consistency tests;
- ordinary taxi isolation;
- physical rank and taxi stand negative E2E;
- DOM scan for forbidden bypass controls;
- overview/detail/denial screenshots.

---

# 6. Fleet D: Rating Governance

**Tasks:** `P5-RATE-003`, `P5-RATE-UI-001`
**Screens:** `P5-RATE-UI-01..03`
**Status:** `ready_after_fleet_b_shared_shell`
**Depends on:** `P5-RATE-001..002`; Platform Admin shell merge order after B

**Owned production surfaces:**

```text
rating moderation contracts/service/repository
apps/platform-admin-web/app/p5-ratings/
rating-specific translations and tests
```

**Deliver:**

1. review queue filters for status/score/tag/driver/trip/date;
2. trip-linked rating detail and moderation history;
3. invalidate command with required reason, confirmation, idempotency, audit,
   aggregate rebuild, and resulting authority state;
4. driver rating authority for rated/new_driver/unavailable without fake
   values;
5. sensitive passenger subject references masked or omitted;
6. read/mutate permission, stale aggregate, empty, loading, and error states.

**Command boundary:**

- direct score/count/average editing is forbidden;
- restore remains disabled until a restore command is separately approved;
- invalidation is not complete with UI only.

**Acceptance evidence:**

- moderation API/repository tests;
- aggregate rebuild and idempotency tests;
- capability/403 tests;
- three production screenshots;
- Passenger rating remains functional and independent.

---

# 7. Fleet E: Passenger Legal Flow

**Primary Task:** `P5-PAX-WEB-001`
**Status:** `ready_from_dev`
**Depends on:** `P5-PAX-001..003`, `P5-PAY-001`, `P5-RCT-001`

This Fleet does not own a new member of the 17-screen count. It preserves the
legal passenger path while the admin suite expands.

**Deliver:**

1. pre-trip vehicle/driver/rating/route/fare disclosure;
2. rating submission and idempotent rated state;
3. all six payment status mappings;
4. certificate pending/available/error/retry-read states with legal fields;
5. production fixture prohibition and mobile-first screenshots.

Do not add moderation, payment exception, or certificate support controls to the
Passenger route. Those are separate Platform Admin surfaces.

---

# 8. Fleet F: Commerce and Records Suite

**Tasks:**

```text
P5-FARE-ANOM-001
P5-FARE-ANOM-UI-001
P5-PAY-001
P5-PAY-OPS-UI-001
P5-RCT-001
P5-RCT-SUPPORT-UI-001
P5-RET-001..003
P5-RET-OPS-UI-001
P5-EXPORT-001
P5-HOLD-001
```

**Screens:** `P5-COM-UI-01..05`
**Status:** `ready_after_fleet_d_shared_shell`
**Depends on:** Fleet D shared-shell merge; each feature follows its backend
authority

**Owned production surfaces:**

```text
pricing anomaly read/recovery authority
payment state/recovery descriptors
electronic certificate support reads
operational records query/detail
server controlled-export jobs
retention/legal-hold read state
apps/platform-admin-web commerce routes
```

## `P5-COM-UI-01` Fare Anomaly

- queue/detail for the five canonical anomaly reasons;
- route/fare/version/timestamp/retryability display;
- fail closed;
- recovery control only from server `availableActions`;
- no manual fare-number bypass.

## `P5-COM-UI-02` Payment Exception

- order/trip, amount/currency, status, safe provider reference, attempts,
  update time, recovery descriptor, and audit timeline;
- failed/manual recovery never appears paid;
- no raw card/token;
- no invented `mark paid` action.

## `P5-COM-UI-03` Certificate Support

- search and open existing certificate;
- available/generating/unavailable/failed/access-denied/superseded states;
- all legal certificate fields;
- completed-trip writer, authenticated HTML/PDF artifacts, and audited,
  idempotent regeneration are available through canonical commands.

## `P5-COM-UI-04` Operational Records

- order/trip, vehicle/plate, reservation/pickup/dropoff ranges, fare policy,
  charging mode, retention and legal-hold filters;
- route/distance/duration, payable/actual/toll, retain-until, status, detail;
- missing values render as unavailable, never zero;
- 730-day floor and permission tests.

## `P5-COM-UI-05` Controlled Export／Retention

- server-side scope preview and record count;
- required export purpose, sensitivity/audit notice, actor;
- pending/running/completed/failed and controlled download;
- legal hold display/filter separate from retention;
- hold create/release use the existing evidence-governance authority with
  confirmation, permission, conflict, and unavailable handling.

**Acceptance evidence:**

- five Screen IDs mapped;
- backend authority and negative tests per feature;
- server export persistence/idempotency/audit tests;
- permission matrix for read/export/recovery;
- legal-field completeness tests;
- five production screenshots plus critical export states.

---

# 9. Fleet G: S-3 Verification

**Primary Task:** `S3-VERIFY-UI-001`
**Status:** `repository_verified_external_evidence_pending`
**Depends on:** current `dev`

Consolidate existing Driver/Ops evidence branches. Do not rebuild S-3 screens.
Only a reproducible current-head difference may produce a repair PR.

Required evidence:

- API/Driver/Ops E2E;
- Android/iOS offline replay;
- attachment scan;
- alert-to-Ops SLO;
- forbidden-vocabulary and screenshot evidence.

---

# 10. Fleet H: Full-Suite Acceptance

**Primary Task:** `E2E-MTX-UI-FULL-001`
**Status:** `repository_gate_verified`
**Depends on:** B, C, D, E, F complete; G report available

**Owned surface:** shared E2E harness and final evidence matrix.

Validate:

```text
authorization 6 screens
+ queue 3 screens
+ rating governance 3 screens
+ commerce 5 screens
= 17 approved screens
```

Cross-surface positive flow:

```text
approved authorization
→ authorized vehicle
→ virtual matching queue
→ Passenger disclosure
→ fare/payment/receipt
→ rating submission/moderation
→ operational record
→ controlled export
```

Negative flow:

```text
inactive authorization
physical rank/taxi stand
missing disclosure
rating mutation without capability
fare provider unavailable
payment failed/manual recovery
certificate unavailable
record/export permission denied
legal hold distinct from retention
```

Fleet H may recommend release readiness. It cannot publish or deploy.

---

# 11. Collision Rules and Merge Order

Feature implementation may begin in parallel, but high-collision files merge in
this order:

```text
Platform Admin shell/navigation/translations:
Fleet B → Fleet D → Fleet F

Ops dispatch/navigation:
Fleet C only

Passenger ride:
Fleet E only

S-3 evidence:
Fleet G only

Shared E2E:
Fleet H only after feature merges
```

No Fleet may reformat a shared translation/navigation file as part of a feature
PR. Rebase before editing a surface whose earlier owner has merged.

Dependency graph:

```text
Canonical 17-screen canvas
  ├─ Fleet B ─→ Fleet D ─→ Fleet F ─┐
  ├─ Fleet C ────────────────────────┤
  ├─ Fleet E ────────────────────────┼→ Fleet H
  └─ Fleet G evidence ───────────────┘
```

---

# 12. Per-Task PR Contract

Every Fleet PR must include:

```text
Task-ID: <single primary Task ID>
Screen-IDs: <exact Screen IDs>
Depends-On: <Task IDs/commits or none>
Baseline-SHA: <current dev used by preflight>
Requirement: 08_multi_taxi_operations_ui_design_requirements_20260723.md@v1.2
Design-Source: docs/05-ui/drts-design-canvas/<file>
Command-Status: live | command-pending | blocked_ext
Fixture-Production-Use: no
```

Required evidence:

1. current-head preflight;
2. diff limited to owned surfaces;
3. unit/integration/E2E commands and results;
4. API/DB readback for persisted authority;
5. permission and negative tests;
6. screenshots for each changed Screen ID;
7. remaining command/external blockers;
8. rollback or disable strategy.

No task is `done` with only a canvas, route shell, fixture, screenshot, contract,
migration, or disabled button.

---

# 13. Supervisor Dispatch Register

| Order | Fleet | Task                            | Dispatch action                                             |
| ----- | ----- | ------------------------------- | ----------------------------------------------------------- |
| 1     | B     | `MTX-AUTH-UI-001`               | resume/rebase existing Gemini branch; implement six screens |
| 1     | C     | `MTX-QUEUE-003`                 | consolidate queue branches; implement three screens         |
| 1     | E     | `P5-PAX-WEB-001`                | start from latest `dev`; preserve passenger legal flow      |
| 1     | G     | `S3-VERIFY-UI-001`              | consolidate evidence only                                   |
| 2     | D     | `P5-RATE-003`／`P5-RATE-UI-001` | start feature work; merge shared shell after B              |
| 3     | F     | commerce task set               | start feature modules; merge shared shell after D           |
| 4     | H     | `E2E-MTX-UI-FULL-001`           | start after feature merges and G report                     |

The execution packet is ready for Fleet claims once its PR is merged or the
Supervisor explicitly authorizes work against the PR head. Production release
remains a separate decision.

---

# 14. Repository Closeout Delta

This section records the implementation wave completed after the original
17-screen dispatch. It supersedes earlier `blocked_command` and
repository-gap statements, but does not convert external-provider or
physical-device evidence into a pass.

| Task                       | Fleet | Repository result                                                                                                                                        | Verification boundary                                                             |
| -------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `P5-FARE-PRODUCER-001`     | F     | Multi-taxi assignment records canonical fare anomalies and resolves prior anomalies after a valid assignment                                             | Live fare-provider execution remains `blocked_ext`                                |
| `P5-CERT-WRITER-001`       | F     | Completed trips create idempotent receipts; authenticated HTML/PDF artifacts and audited regeneration are implemented in `V0062`                         | Production delivery/load evidence remains environment work                        |
| `P5-PAY-RECOVERY-001`      | F     | `billing:write` commands, durable idempotency, audit receipts, provider port, and UI execution are implemented in `V0063`; `mark paid` remains forbidden | Default provider is fail-closed; live PSP adapter execution remains `blocked_ext` |
| `P5-HOLD-ACTIONS-001`      | F     | Records UI now creates and releases canonical evidence-governance holds with case, reason, actor, confirmation, and refresh                              | No new retention or four-eyes rule was invented                                   |
| `S3-PROVIDER-ADAPTERS-001` | G     | S3-compatible presigned PUT, provider-side SHA-256 inspection, HTTPS scanner contract, timeout, auth, and fail-closed configuration are implemented      | Credentials and real provider execution remain `blocked_ext`                      |
| `S3-VERIFY-004`            | G     | Persisted alert latency count, p50, p95, maximum, and within-five-second rate are exposed to Ops                                                         | Production traces are still required before an SLO claim                          |
| `E2E-MTX-UI-FULL-001`      | H     | Exact 17-screen census, command boundaries, migration order through `V0063`, API/UI regression, and controlled browser flows pass                        | One persisted, no-interception, cross-surface journey remains `partial`           |

## Remaining Fleets Execution Tasks

| Priority | Fleet | Task                              | Required completion evidence                                                                                                                    |
| -------- | ----- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | G     | `S3-PHYSICAL-DEVICE-EVIDENCE-001` | Android and iOS offline SOS replay on physical devices, including reconnect, attachment, and duplicate suppression                              |
| P0       | G     | `S3-LIVE-PROVIDER-EVIDENCE-001`   | Real S3-compatible upload/readback, actual scanner response, and production alert-render traces with measured p95                               |
| P0       | F     | `P5-LIVE-COMMERCE-EVIDENCE-001`   | Approved fare-provider and PSP adapters, credentials supplied outside Git, retry/readback, and provider audit references                        |
| P1       | E/H   | `P5-PAX-PERSISTED-BROWSER-001`    | Passenger disclosure, payment, certificate, and rating browser flow using the same persisted order/trip identity without `page.route()` success |
| P1       | H     | `E2E-MTX-PERSISTED-JOURNEY-001`   | One identity across authorization, vehicle, queue, Passenger, fare/payment/certificate, rating, record, hold, and export with restart/readback  |

Fleets must not replace these external or persisted-evidence tasks with mock
screenshots. The repository candidate can proceed through CI and staging, but
an unconditional production approval still requires the P0 evidence above.
