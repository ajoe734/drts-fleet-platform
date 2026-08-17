# Stage 1 Dev Functional Completion Execution Tasks

Status: authorized for supervisor-managed execution

Version: `2026-08-08.v1`

GAP authority: `docs/02-architecture/stage1-dev-functional-completeness-gap-20260808.md`

Machine registration: `tools/task-dispatch/dispatch-stage1-functional-completion-20260808.py`

## 1. Operating rule

Run the registration script from the canonical checkout. It writes task state
only through `tools/development-orchestrator/bin/ai-status.sh`; the supervisor then dispatches dependency-
ready work to isolated auto-worker branches. Do not create ad-hoc agents for this
wave.

Workers must read the GAP and their listed design/source documents before editing.
UI workers may implement the supplied HTML/JSX canvas; they may not redesign it,
infer a UI from a screenshot or replace it with generic components. If an exact
screen is absent, use the listed accepted screen-requirements document and stop
for design clarification when neither source exists.

## 2. Delivery rules

1. Work from current `origin/dev`; never commit directly on a stale shared `dev`.
2. One task owns one bounded branch and one closeout commit/PR.
3. API healthy plus UI fixture fallback is a failure, not graceful degradation.
4. An enabled action without a handler is a defect. Wire it or disable/remove it.
5. Every mutation test must assert the API response and a subsequent readback.
6. Do not re-enable Partner Booking or Concierge.
7. Do not add Stage 1.5 governance scope unless the task exposes a concrete
   tenant-isolation, session or secret-handling defect.
8. Preserve current API contracts when they already support the required flow;
   add only the smallest missing contract.
9. Required checks include focused unit/component tests, app typecheck/build and
   the task's browser/API lifecycle evidence.
10. A worker may not mark a task done until its reviewed commit is reachable from
    `dev` and any task requiring Dev evidence has recorded the deployed SHA.

## 3. Dependency waves

| Wave | Purpose                                | Tasks                                                                                     |
| ---- | -------------------------------------- | ----------------------------------------------------------------------------------------- |
| A    | independent P0/P1 implementation roots | `S1F-REF-001`, `S1F-ENT-001`, `S1F-FLT-001`, `S1F-BANK-001`, `S1F-ADM-002`, `S1F-DRV-001` |
| B    | surface lifecycle completion           | `S1F-REF-002`, `S1F-ENT-002`, `S1F-FLT-002`, `S1F-FLT-003`, `S1F-BANK-002`                |
| C    | cross-surface control-plane work       | `S1F-ADM-001`, `S1F-CHAN-001`                                                             |
| D    | independent operational acceptance     | `S1F-UIX-001`                                                                             |
| E    | exact-SHA release and truth closeout   | `S1F-REL-001`, `S1F-DOC-001`                                                              |

The supervisor may parallelize tasks within a wave only when their dependencies
are done. Owner names in the registry are initial routing hints; health-based
reassignment is allowed as long as owner and reviewer remain different.

## 4. Task registry

### S1F-REF-001 — Wire the formal Referral booking form

- Priority: P0
- Initial owner/reviewer: Claude2 / Codex2
- Dependencies: none
- Owned area: `apps/referral-embed-web/components/`, booking BFF client/tests
- Required design: `Passenger Embed.html`, `passenger-embed-screens.jsx`,
  `pe-data.jsx`, `pe-fallback.jsx`
- Work:
  - replace fixture-only booking state with actual controlled inputs;
  - load only the partner-scoped saved places/vehicle options exposed by the
    existing server boundary;
  - submit the user's values to the existing create-booking BFF;
  - show validation, pending, success and stable error states without changing
    the accepted canvas.
- Acceptance:
  - `/embed/yuhe-residence` produces a non-fixture booking ID;
  - request payload equals the values entered by the browser test;
  - refresh/readback returns the same booking;
  - component tests, app typecheck/build and focused browser test pass.

### S1F-REF-002 — Complete Referral active/history/cancel/rating/receipt

- Priority: P0
- Initial owner/reviewer: Claude2 / Codex2
- Dependencies: `S1F-REF-001`
- Owned area: Referral Embed components, live-data loader and BFF lifecycle tests
- Work:
  - consume route-provided `liveData` rather than `embedTrip` for operational
    screens;
  - implement active trip resume, history, cancellation, rating and receipt;
  - preserve partner entry and handoff session boundaries;
  - add honest expired, forbidden, empty and API-failure states.
- Acceptance:
  - create-refresh-cancel and completed-trip-rating-receipt journeys have
    browser-to-API readback;
  - no operational screen derives its booking state from fixtures when the API
    is healthy;
  - existing referral handoff and allowlist tests stay green.

### S1F-ENT-001 — Replace Enterprise static controls with a real form

- Priority: P0
- Initial owner/reviewer: Codex2 / Claude2
- Dependencies: none
- Owned area: `apps/enterprise-dispatch-web/app/bookings/new/`, form components
  and reference-data client
- Required design: `Enterprise Dispatch.html`, `ent-kit.jsx`, `ent-screens-1.jsx`,
  `ent-embed-flow.jsx`, `ent-states.jsx`
- Work:
  - make the accepted visual controls semantic input/select/button elements;
  - load scoped passengers, addresses, cost centres and available service data;
  - bind quota/policy preview to the draft values;
  - retain only explicitly labelled local-test fixtures outside deployed Dev.
- Acceptance:
  - keyboard and pointer users can edit every required field;
  - validation and preview react to actual draft values;
  - no production submit path imports `getEnterpriseBookingCommandFixture()`;
  - app typecheck/build and form tests pass.

### S1F-ENT-002 — Complete Enterprise booking lifecycle

- Priority: P0
- Initial owner/reviewer: Codex2 / Claude2
- Dependencies: `S1F-ENT-001`
- Owned area: Enterprise booking submit/list/detail/edit/cancel and browser tests
- Required design: `ent-screens-1.jsx`, `ent-screens-2.jsx`, `ent-states.jsx`
- Work:
  - submit the actual draft through the existing tenant booking command API;
  - read it back in history/detail;
  - implement supported update/cancel actions;
  - render policy/quota rejection, no-supply and degraded states.
- Acceptance:
  - browser create-read-update-cancel passes with one traceable booking ID;
  - persisted fields equal browser input before and after update;
  - fixture command use remains limited to tests explicitly named fixture.

### S1F-FLT-001 — Correct Fleet Dev identity, period and data truth

- Priority: P0
- Initial owner/reviewer: Gemini / Codex
- Dependencies: none
- Owned area: Fleet Portal server client/loaders, Dev deployment configuration
  and minimal current-period seed/fee-plan setup
- Work:
  - inject the valid Dev fleet partner identity and remove deployed fallback to
    `flp_002`;
  - derive period from current Dev time/query instead of fixed `2026-06`;
  - ensure the current period has the minimum published fee-plan data needed for
    trips/quality;
  - replace API-error fixture substitution with explicit degraded/empty states.
- Acceptance:
  - dashboard no longer states that design sample data is active;
  - drivers, vehicles, readiness, trips, quality and statements query the same
    valid fleet and current period;
  - missing scope fails visibly and never chooses a demo fleet;
  - deployment configuration and focused loader tests pass.

### S1F-FLT-002 — Build Fleet supply onboarding UI

- Priority: P0
- Initial owner/reviewer: Claude2 / Codex2
- Dependencies: `S1F-FLT-001`
- Owned area: new Fleet Portal supply routes/components and existing supply BFF
- Required design: `Fleet Partner Portal.html`, `fleet-supply.jsx`,
  `fleet-partner-portal-supply-onboarding-screen-requirements-20260619.md`
- Work:
  - implement supply dashboard, create driver, create vehicle, submission detail
    and submission list;
  - implement upload-intent/confirm/delete for required documents;
  - implement submit, withdraw and revision/resubmit using existing APIs;
  - show readiness and review feedback.
- Acceptance:
  - a fleet user can create/upload/submit and read back one submission;
  - pre-approval data does not appear in canonical supply;
  - withdraw and revision/resubmit state transitions are covered;
  - UI matches the supplied design assets and app checks pass.

### S1F-FLT-003 — Wire Fleet operational actions

- Priority: P1
- Initial owner/reviewer: Gemini / Codex
- Dependencies: `S1F-FLT-001`
- Owned area: Fleet statements, documents, cases and action components
- Required design: `Fleet Partner Portal.html`, `fleet-screens.jsx`
- Work:
  - wire supported statement download, confirm and dispute actions;
  - wire existing document/case actions required by Stage 1;
  - remove or disable remind/upload/respond/training actions with no endpoint;
  - ensure action components accept handlers and surface request errors.
- Acceptance:
  - every enabled action causes a request, download or documented navigation;
  - disabled actions state why they are unavailable;
  - statement state changes survive refresh and remain fleet-scoped.

### S1F-ADM-001 — Build Platform supply review UI

- Priority: P0
- Initial owner/reviewer: Codex2 / Claude2
- Dependencies: `S1F-FLT-002`
- Owned area: `apps/platform-admin-web/app/supply-review/` and admin supply-review client
- Required design: `platform-supply-review.jsx`,
  `platform-admin-supply-review-screen-requirements-20260619.md`
- Work:
  - build review queue and detail using existing list/detail APIs;
  - implement start review, request revision, approve and reject;
  - show submitted data/document comparison and actor/reason/result;
  - read back readiness and canonical registry after approval.
- Acceptance:
  - one Fleet submission completes revision and approval through browser UI;
  - approval alone provisions canonical registry;
  - wrong role and wrong tenant/partner attempts are denied by the server;
  - Platform Admin typecheck/build and focused tests pass.

### S1F-ADM-002 — Remove false operational fallbacks and inert actions

- Priority: P1
- Initial owner/reviewer: Claude / Codex2
- Dependencies: none
- Owned area: Platform Admin partner, reimbursement and fleet operational pages
- Required design: `Platform Admin.html`, relevant `platform-*.jsx` canvases
- Work:
  - replace route-local fixture fallback with loading/empty/forbidden/degraded
    states;
  - map backend-advertised Stage 1 actions to real handlers;
  - disable/remove actions that only alert that the endpoint is not wired;
  - preserve explicitly labelled Storybook/unit fixtures only.
- Acceptance:
  - simulated API failure never renders plausible operational rows;
  - no enabled Platform Admin action displays a not-wired alert;
  - existing route and permission tests remain green.

### S1F-BANK-001 — Replace Bank static data with scoped Dev reads

- Priority: P1
- Initial owner/reviewer: Gemini2 / Claude
- Dependencies: none
- Owned area: Bank Console server API client, loaders and data modules
- Required design: `Bank Console.html`, `bank-screens-1.jsx`,
  `bank-screens-2.jsx`, `bank-screens-3.jsx`
- Work:
  - load dashboard, booking/detail, programme usage, contract/detail, statement,
    user and audit data from existing scoped APIs;
  - derive current period instead of fixed June 2026;
  - remove deployed `preview`/Demo Bank fixture substitution;
  - implement loading, empty, forbidden and degraded states.
- Acceptance:
  - displayed IDs/totals reconcile with direct API readback;
  - switching bank/role cannot cross scope;
  - healthy API paths contain no fixture-only rows;
  - app typecheck/build and loader tests pass.

### S1F-BANK-002 — Complete Bank downloads and minimum role actions

- Priority: P1
- Initial owner/reviewer: Gemini2 / Claude
- Dependencies: `S1F-BANK-001`
- Owned area: Bank statement/detail/download and role-capability tests
- Work:
  - implement the existing statement artifact/download route;
  - support only the minimum read/export actions defined by the accepted canvas;
  - disable unsupported mutation controls and retain masked PII.
- Acceptance:
  - a current-period statement downloads a non-fixture artifact;
  - unauthorised roles cannot export;
  - Partner Booking remains paused and no link re-enables it.

### S1F-CHAN-001 — Bind Channel Portal to the formal Yuhe identity

- Priority: P1
- Initial owner/reviewer: Gemini / Codex
- Dependencies: `S1F-REF-002`
- Owned area: Channel Portal bootstrap identity, Dev deploy variables and scoped tests
- Work:
  - resolve the formal Yuhe partner/tenant/program IDs from canonical Dev data;
  - inject all four identity variables during Channel Portal deployment;
  - reject absent formal configuration in deployed Dev instead of using the demo
    constants;
  - reconcile Referral booking usage/statement through the same entry.
- Acceptance:
  - response evidence reports `yuhe-residence`;
  - a booking created by `S1F-REF-002` appears in the formal partner usage/read
    model and no demo partner data appears;
  - partner boundary negative tests pass.

### S1F-DRV-001 — Replay the current-SHA Android journey

- Priority: P1
- Initial owner/reviewer: Gemini2 / Codex
- Dependencies: none
- Owned area: Driver test harness/evidence only; fix code only for a reproduced
  Stage 1 journey defect
- Required design: `Driver App.html`, `driver-screens-{1,2,3}.jsx`, `driver-sos.jsx`
- Work:
  - run Android emulator against current Dev candidate;
  - exercise login/bind, task list, accept, start, complete, reconnect/readback
    and SOS;
  - preserve offline proof while reconnecting;
  - record exact app/API SHA and evidence IDs.
- Acceptance:
  - all journey states pass on one current candidate SHA;
  - SOS and completed trip are readable from existing operator/API surfaces;
  - no iOS/store-distribution requirement is introduced.

### S1F-UIX-001 — Release-blocking cross-surface operational browser suite

- Priority: P0
- Initial owner/reviewer: Claude2 / Codex
- Dependencies: `S1F-REF-002`, `S1F-ENT-002`, `S1F-FLT-003`,
  `S1F-ADM-001`, `S1F-ADM-002`, `S1F-BANK-002`, `S1F-CHAN-001`
- Owned area: `tests/e2e/`, deployed UI acceptance scripts and evidence output
- Work:
  - create a deterministic browser suite for all mutation/readback journeys in
    GAP section 7;
  - assert backend IDs/state after every user operation;
  - census enabled buttons/forms on active routes and fail on inert controls;
  - assert Partner Booking and Concierge remain 404;
  - keep existing route/viewport smoke as a separate availability layer.
- Acceptance:
  - formal Referral, Enterprise, Fleet/Admin, Tenant/Ops and Bank/Channel journeys
    all pass against one candidate SHA;
  - fixture leakage and enabled inert controls fail the suite;
  - evidence records URL, actor scope, request/result ID and readback state.

### S1F-REL-001 — Integrate and deploy one verified candidate SHA

- Priority: P0 release gate
- Initial owner/reviewer: Gemini / Claude
- Dependencies: `S1F-UIX-001`, `S1F-DRV-001`
- Owned area: reviewed integrations, Dev deployment and release evidence
- Work:
  - integrate only reviewed task commits in dependency order;
  - run repo CI, 22 API E2E, 39-route suite and functional browser suite;
  - deploy exactly that SHA once through the normal Dev workflow;
  - rerun operation journeys against deployed URLs;
  - verify paused and retired surfaces remain 404.
- Acceptance:
  - source SHA, image tags, migration, Cloud Run revisions and evidence share one
    traceable candidate ID;
  - all completion gates G1-G8 pass;
  - no release is claimed from branch-only or local-only evidence.

### S1F-DOC-001 — Publish final Stage 1 functional truth

- Priority: P1
- Initial owner/reviewer: Codex2 / Claude
- Dependencies: `S1F-REL-001`
- Owned area: GAP status, URL index, UAT evidence and stale completion claims
- Work:
  - update this GAP with per-item closeout commit/run/evidence;
  - reconcile app URL inventory and remove Concierge/paused Partner Booking from
    active lists;
  - replace stale fixture/preview and false-completion statements in current
    Stage 1 documentation;
  - publish a compact operator matrix of URL, role, supported operations and
    known external gate.
- Acceptance:
  - every GAP row is closed or explicitly external/deferred with evidence;
  - active URL documentation matches deployed inventory;
  - final statement uses the completion wording defined by the GAP.

## 5. File-collision guidance

- Referral workers own only Referral files until their chain closes.
- Enterprise workers own only Enterprise files until their chain closes.
- Fleet config/actions and Fleet supply UI may run after `S1F-FLT-001`, but the
  supervisor should serialize them if both need the same shared loader/component.
- Platform supply review is isolated from Platform fallback cleanup except shared
  navigation/translations; rebase before review if both touch those files.
- Bank and Channel tasks are app-isolated.
- Only `S1F-REL-001` may coordinate the final integration/deploy boundary.

## 6. Supervisor registration and verification

```bash
AI_NAME=Codex python3 tools/task-dispatch/dispatch-stage1-functional-completion-20260808.py --dry-run
AI_NAME=Codex python3 tools/task-dispatch/dispatch-stage1-functional-completion-20260808.py
bash tools/development-orchestrator/bin/ai-status.sh list --phase stage1-functional-completion-20260808
```

If a partial registration must be resumed, inspect each existing task and then
use `--allow-existing`; the script verifies the dependency graph, priority,
artifacts, acceptance and a valid independent owner/reviewer pair. It accepts a
health-based owner reassignment already made by the supervisor.

The board must remain in `supervisor_managed_execution`. Registration does not
give workers permission to skip dependency, reviewer, commit, push, CI or Dev
evidence gates.

## 7. Execution Wave Closeout Record

All 16 tasks across Waves A through E have reached verified completion on `origin/dev`:

- **Wave A (Roots)**: `S1F-REF-001` (PR #1335), `S1F-ENT-001` (PR #1343), `S1F-FLT-001` (PR #1329), `S1F-BANK-001` (PR #1351), `S1F-ADM-002` (PR #1348), `S1F-DRV-001` (PR #1331)
- **Wave B (Lifecycle)**: `S1F-REF-002` (PR #1377), `S1F-ENT-002` (PR #1356), `S1F-FLT-002` (PR #1341), `S1F-FLT-003` (PR #1350), `S1F-BANK-002` (PR #1355)
- **Wave C (Cross-Surface)**: `S1F-ADM-001` (PR #1383), `S1F-CHAN-001` (PR #1362)
- **Wave D (Operational Acceptance)**: `S1F-UIX-001` (PR #1386)
- **Wave E (Release & Documentation)**: `S1F-REL-001` (PR #1451 / merge SHA `4012b10c0`), `S1F-DOC-001` (Final truth and operator matrix published)

All completion gates G1 through G8 are satisfied. Canonical functional truth is maintained in `docs/02-architecture/stage1-dev-functional-completeness-gap-20260808.md` and active URLs are indexed in `docs/02-architecture/app-entry-url-index-20260616.md`.
