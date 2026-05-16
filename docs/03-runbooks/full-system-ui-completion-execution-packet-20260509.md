# Full-System UI Completion Execution Packet

Date: 2026-05-09

Primary anchors:

- `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
- `docs/01-product/driver-app-multi-platform-product-spec-20260507.md`
- `docs/01-decisions/SD-DP-20260509-005-full-system-ui-surface-topology.md`
- `docs/02-architecture/roadmap/fbp-015-deferred-scope-packet.md`
- `docs/03-runbooks/platform-admin-ops-console-design-execution-packet-20260508.md`
- `docs/03-runbooks/tenant-console-and-cross-system-design-execution-packet-20260508.md`
- `docs/03-runbooks/master-system-closeout-checklist.md`

## Purpose

Materialize the remaining "not actually complete" UI scope into supervisor-ready
execution tasks.

This packet exists because the current repo truth was good enough to say:

- Platform Admin is materially rebuilt
- Ops Console is materially rebuilt
- Tenant Console selected wave is materially rebuilt
- Driver App materialization waves are largely closed

But that is still not the same as saying the complete system UI is finished.

The remaining gap is no longer "main screens". It is the full-system bar:

- deferred user-facing surfaces that still have no repo-local landing zone
- registration / login / invite / revoke / recovery / negative-flow coverage
- partner-mode completion
- forwarded / multi-platform authority completion across tenant / ops / admin /
  driver surfaces
- one final full-system verification packet that proves the completion claim

## User-Directed Scope Override

Earlier packets intentionally kept several surfaces explicit-but-deferred:

- Passenger App / Passenger Web
- passenger receipt UI
- Call Point / Concierge Portal
- partner-mode follow-through inside the repo-local tenant target

This packet reopens those families as explicit execution backlog because the
current request is no longer "what is in the existing completion bar?" but
"what must be done or at least fully taskized for the complete system UI?"

## Scope In

- repo-local landing-zone decisions for all remaining UI surfaces
- partner booking mode completion inside the current repo topology
- passenger-facing booking / status / receipt surface taskization
- concierge / call-point surface taskization
- cross-surface auth / registration / invite / revoke / failure-path completion
- multi-platform forwarded authority completion across:
  - `apps/platform-admin-web`
  - `apps/ops-console-web`
  - `apps/tenant-console-web`
  - `apps/driver-app`
- final full-system verification evidence

## Scope Out

- hardware / fleet / external credential work that cannot be solved in repo UI
  alone
- AV / ODD runtime implementation beyond explicit landing-zone and blocker
  recording
- live operations evidence that requires external production credentials

## Why A New Wave Is Required

Existing execution packets were intentionally scoped:

- `platform-admin-ops-console-design-execution-packet-20260508.md`
  finished the two management consoles
- `tenant-console-and-cross-system-design-execution-packet-20260508.md`
  only covered the selected tenant slices
- `driver-app-productization-execution-packet-20260504.md`
  materially rebuilt the driver app, but the driver product spec still says the
  complete multi-platform bar is "not fully" satisfied

The repo therefore needs a separate completion wave rather than pretending the
already-closed packets imply total-system closure.

## Landing-Zone Decision Output (`SYS-UI-001`)

`SYS-UI-001` resolves the topology ambiguity for the reopened families as
follows:

| Surface family                   | Formal repo landing zone                                       | Resolution class                               | Downstream tasks                         | Notes                                                                                                     |
| -------------------------------- | -------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Partner booking mode             | `apps/tenant-console-web`                                      | repo-buildable now                             | `SYS-UI-002`                             | must stay in a constrained route group / nav boundary; `apps/tenant-portal-web` remains sunset            |
| Passenger App / Web              | `apps/passenger-web`                                           | repo-buildable now                             | `SYS-UI-003`, `SYS-UI-004`               | dedicated external-consumer channel surface                                                               |
| Passenger receipt / trip history | `apps/passenger-web`                                           | repo-buildable now                             | `SYS-UI-003`, `SYS-UI-004`               | receipt ownership still follows source; passenger UI must support external-reference / unsupported states |
| Call Point / Concierge Portal    | `apps/assisted-entry-web`                                      | repo-buildable now with explicit rollout gates | `SYS-UI-005`                             | assisted-entry plane is distinct from the internal ops control plane                                      |
| Public booking-status surface    | folded into `apps/passenger-web` and `apps/assisted-entry-web` | resolved as sub-surface                        | `SYS-UI-003`, `SYS-UI-004`, `SYS-UI-005` | no separate non-ROC live-board app is opened by this wave                                                 |

The only remaining live-board family is `FBP-015` Family 3 (`AV / ODD / Tesla /
ROC`), which remains future-gated and out of this wave.

## Current Explicit Completeness Gaps

### 1. Reopened Surfaces Are Now Taskized But Still Unbuilt

`SYS-UI-001` removes the landing-zone ambiguity for:

- Passenger App / Passenger Web
- passenger receipt UI
- Call Point / Concierge Portal

But the topology decision is only the first gate. These families now have
formal repo landing zones and downstream tasks; they still need actual surface
materialization before a complete-system claim can be made.

### 2. Partner Mode Is Not Yet A First-Class Repo-Local Product Surface

`P1PX-FE-001` closed the partner-only booking shell in the external
`tenant-commute-hub` repo, but the repo-local tenant productization wave still
records partner mode as a constrained follow-up rather than a fully materialized
surface in this repo.

### 3. Cross-Surface Positive / Negative / Auth Flows Are Not Closed As One Bar

We have many completed slices, but not one final wave that explicitly closes:

- registration / bootstrap
- login / session recovery
- invite / suspend / role change
- revoke / rotate / disable
- denial / ineligible / cancelled / degraded / reauth-required paths

### 4. Multi-Platform UI Is Still Not Fully Closed

`driver-app-multi-platform-product-spec-20260507.md` still explicitly says:

- "No, not fully."
- driver app external-platform states are not all first-class
- management UI and tenant-facing surfaces do not yet fully explain owned vs
  forwarded authority

That means the current "done" waves are materially strong but not yet the final
system-wide authority-complete UI bar.

## Task Breakdown

### SYS-UI-001 — Full-System Surface Reopen And Landing-Zone Decision

Owner: `Codex`
Reviewer: `Claude`

Depends on:

- `MSC-P1-001`
- `TEN-UI-009`

Write scope:

- `docs/02-architecture/roadmap/fbp-015-deferred-scope-packet.md`
- `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
- `docs/03-runbooks/full-system-ui-completion-execution-packet-20260509.md`
- additive decision/runbook records if required

Work:

- Convert the previously deferred surfaces into an explicit repo-execution map.
- Decide the landing zone for:
  - partner booking mode in the current repo
  - Passenger App / Passenger Web
  - passenger receipt UI
  - Call Point / Concierge Portal
  - public/live-board style user-facing status surface if still needed
- Record which surfaces are:
  - repo-buildable now
  - topology-blocked
  - externally gated but still tracked

Acceptance:

- no remaining "deferred but not taskized" UI family for complete-system scope

### SYS-UI-002 — Repo-Local Partner Booking Mode Productization

Owner: `Claude2`
Reviewer: `Codex2`

Depends on:

- `SYS-UI-001`
- `P1PX-FE-001`
- `TEN-UI-008`

Write scope:

- `apps/tenant-console-web`
- shared tenant auth/bootstrap helpers if required
- route/group-level partner-mode wiring only

Work:

- Materialize partner booking mode as a first-class repo-local surface rather
  than leaving it only as historical external-repo truth.
- Cover:
  - partner login / bootstrap
  - branded partner shell
  - eligibility pass / fail presentation
  - booking create flow
  - success / denial / degraded states
  - partner-safe nav boundary with no tenant-admin leakage

Acceptance:

- chosen target app typecheck passes
- partner positive and negative flows are explicitly represented

### SYS-UI-003 — Passenger Surface Topology, Shell, And Receipt Baseline

Owner: `Codex2`
Reviewer: `Claude`

Depends on:

- `SYS-UI-001`

Write scope:

- `apps/passenger-web`
- additive passenger-facing shell/components/docs only

Work:

- Create the passenger-surface baseline instead of leaving the family deferred.
- At minimum, define and materialize:
  - landing route and shell
  - auth / bootstrap entry
  - booking-status home
  - receipt / trip-history landing-zone
  - explicit empty / unauthenticated / unsupported states

Acceptance:

- passenger target exists with a real route and shell
- receipt surface is no longer only a prose-deferred idea

### SYS-UI-004 — Passenger Booking, Status, And Negative-Flow Materialization

Owner: `Claude`
Reviewer: `Codex2`

Depends on:

- `SYS-UI-003`
- `XS-UI-001`
- `XS-UI-003`

Write scope:

- passenger target routes/components
- shared request-state helpers only if needed

Work:

- Build the passenger-facing journey set needed for a real completion claim:
  - active booking / trip status
  - cancellation path where authority allows
  - completion / receipt visibility
  - denial / ineligible / cancelled / no-supply / degraded states
  - authority-safe read-only states when mutation is not allowed

Acceptance:

- passenger positive and negative core flows are represented route-by-route

### SYS-UI-005 — Call Point / Concierge Portal Materialization

Owner: `Codex`
Reviewer: `Claude2`

Depends on:

- `SYS-UI-001`
- `OPS-UI-008`

Write scope:

- `apps/assisted-entry-web`
- shared assisted-entry auth/bootstrap helpers if required

Work:

- Materialize the concierge/call-point counterpart instead of leaving it as
  deferred operator prose.
- Cover:
  - concierge order entry shell
  - rider/contact lookup
  - call/session context
  - booking submission / callback
  - ineligible / denied / degraded / recording-unavailable states

Acceptance:

- concierge landing zone exists and is no longer only a deferred decision note

### SYS-UI-006 — Cross-Surface Auth, Registration, Invite, Revoke, And Failure Matrix

Owner: `Claude2`
Reviewer: `Codex`

Depends on:

- `SYS-UI-001`
- `SYS-UI-002`
- `SYS-UI-003`
- `SYS-UI-005`
- `TEN-UI-008`
- `P1PX-BE-002`
- `P1PX-DRV-001`

Write scope:

- additive docs/evidence first
- then targeted app fixes in affected surfaces only where matrix work finds a
  missing or inconsistent UI path

Work:

- Close the remaining "完整系統正負流程 / 註冊 / 其他" gap as one explicit matrix.
- Cover, at minimum:
  - tenant login / bootstrap / session expiry
  - driver onboarding / rebind / revoke / degraded recovery
  - partner ingress auth failure paths
  - invite / suspend / role change / revoke
  - rotate / revoke / disable / retry where supported
  - RBAC-denied states
  - unauthenticated / expired / degraded / not-eligible / cancelled flows
- For any missing UI path, either implement it or log it as a concrete blocker
  with owner surface and route.

Acceptance:

- matrix filed
- every listed flow is either implemented, explicitly blocked, or explicitly
  delegated to a named external dependency

### SYS-UI-007 — Multi-Platform Forwarded Authority Completion

Owner: `Codex2`
Reviewer: `Claude`

Depends on:

- `SYS-UI-001`
- `DRV-MAT-010`
- `DRV-MP-005`
- `DRV-MP-006`
- `DRV-MP-007`
- `OPS-UI-006`
- `OPS-UI-007`
- `ADM-UI-006`
- `TEN-UI-006`

Write scope:

- `apps/driver-app`
- `apps/ops-console-web`
- `apps/platform-admin-web`
- tenant target app only where authority explanation is missing
- additive docs/evidence if needed

Work:

- Close the remaining UI gap for owned vs forwarded authority across all
  operator and actor surfaces.
- At minimum, address:
  - forwarded driver states:
    - `accept_pending`
    - `confirmed_by_platform`
    - `lost_race`
    - `cancelled_by_platform`
    - `sync_failed`
  - explicit platform auth / reauth / degraded cues
  - platform admin credential / rollout / adapter readiness framing
  - ops forwarded queue and reconciliation affordances where current screens are
    still partial
  - tenant-facing explanation of external-platform authority when applicable

Acceptance:

- driver / ops / admin / tenant surfaces present a coherent forwarded-authority
  model with route-level evidence

### SYS-UI-008 — Full-System UI Verification Packet

Owner: `Codex`
Reviewer: `Claude2`

Depends on:

- `TEN-UI-009`
- `SYS-UI-002`
- `SYS-UI-003`
- `SYS-UI-004`
- `SYS-UI-005`
- `SYS-UI-006`
- `SYS-UI-007`

Write scope:

- `support/sidecars/SYS-UI-008/`
- additive runbook truth only if the verification packet discovers material
  execution drift

Work:

- Produce the route-by-route verification packet for the complete-system UI
  claim.
- Include:
  - landing-zone map for every in-scope surface
  - positive / negative / auth / registration flow checklist
  - tenant / ops / admin / driver / passenger / partner route inventory
  - accepted deviations
  - external blockers still preventing a true "complete" claim

Acceptance:

- verification packet filed
- completion claim can be stated precisely as:
  - complete
  - complete except named external blockers
  - or still incomplete with route-level reasons

## Dispatch Rule

1. dispatch `SYS-UI-001` first; do not pretend full-system completion exists
   while landing zones remain ambiguous
2. after `SYS-UI-001`, `SYS-UI-002`, `SYS-UI-003`, and `SYS-UI-005` may run in
   parallel if write scopes are kept separate
3. keep `SYS-UI-006` as the cross-surface hardening gate that turns partial
   slices into a whole-system flow matrix
4. keep `SYS-UI-007` under focused review because it cuts across driver / ops /
   admin / tenant authority presentation
5. treat `SYS-UI-008` as the final evidence gate for any future "完整系統 UI
   已完成" claim
