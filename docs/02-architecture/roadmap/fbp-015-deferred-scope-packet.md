# FBP-015 Deferred Roadmap Packet

**Status:** partially promoted by `SYS-UI-001`; Family 3 remains roadmap-locked
**Classification:** mixed: execution-taskized missing-surface families + future_gated family
**Task:** FBP-015  
**Created:** 2026-04-17  
**Author:** Claude (governance-review lane)  
**Canonical source references:** PRD §9.1.1, §9.1.3, §16; scope-matrix.md; consensus-packet.md §3.3

---

## Purpose

This packet preserves the explicit deferred scope families that were originally outside the
current Phase 1 execution wave. Its role is to ensure that absent surfaces and future-gated
blueprint slices remain visible in the master plan and are not misread as complete or
out-of-scope.

As of `2026-05-09`, `SYS-UI-001` promoted Family 1 and Family 2 out of topology-unknown limbo:

- Family 1 (`Passenger App / Web` + receipt / public-status adjacency) now has a formal
  repo landing zone and downstream execution tasks.
- Family 2 (`Call Point / Concierge Portal`) now has a formal repo landing zone and downstream
  execution tasks.
- Family 3 (`AV / ODD / Tesla / ROC Live-Board Extensions`) remains fully future-gated and is
  still not part of the current execution wave.

This packet therefore remains the roadmap visibility anchor, but it is no longer a
pre-execution freeze record for Families 1 and 2.

## 2026-05-09 Reopen Disposition

| Family                                   | Reopen decision                       | Formal landing zone       | Downstream tasks           | Remaining gate                                                                         |
| ---------------------------------------- | ------------------------------------- | ------------------------- | -------------------------- | -------------------------------------------------------------------------------------- |
| Family 1 — Passenger App / Web           | promoted into the full-system UI wave | `apps/passenger-web`      | `SYS-UI-003`, `SYS-UI-004` | passenger auth/bootstrap and consumer-safe channel routes still need implementation    |
| Family 2 — Call Point / Concierge Portal | promoted into the full-system UI wave | `apps/assisted-entry-web` | `SYS-UI-005`               | live CTI/telephony activation and assisted-entry production auth remain explicit gates |
| Family 3 — AV / ODD / Tesla / ROC        | unchanged                             | no landing zone selected  | none in this wave          | remains future-gated                                                                   |

---

## Family 1 — Passenger App / Web

| Attribute                   | Value                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| PRD reference               | §9.1.1                                                                                                                                     |
| Scope-matrix classification | `missing_surface` -> `execution_taskized`                                                                                                  |
| Current repo truth          | Formal frontend landing zone selected: `apps/passenger-web`; no passenger auth/bootstrap or consumer route family exists yet in `apps/api` |
| Phase 1 role                | Reopened by `SYS-UI-001` as a full-system completion family                                                                                |
| Gate condition              | Topology decision is now fixed; implementation proceeds through `SYS-UI-003` and `SYS-UI-004`                                              |

### Description

The Passenger App / Web is a first-class blueprint surface in the PRD. It covers the
end-consumer-facing order creation, live-tracking, receipt download, and trip history flows.
`SYS-UI-001` reopens it as a dedicated channel-layer app instead of leaving it as a generic
future note. The selected repo-local landing zone is `apps/passenger-web`, not
`apps/tenant-console-web`, `apps/ops-console-web`, or an implicit extension of
`tenant-commute-hub`.

The user-facing status home does **not** become a separate live-board app. It folds into the
same passenger surface as the booking-status and trip-history routes. ROC live-board scope
remains exclusively in Family 3.

### What Is Not Built Yet

- Passenger-facing order creation flow
- Passenger identity and authentication surface
- Booking-status home with ETA / dispatch-state visibility
- Passenger receipt and trip-history UX with source-aware states
- Passenger notification preferences

### Execution Mapping

1. `apps/passenger-web` is the only accepted first-party passenger landing zone for this wave.
2. Passenger receipt UI lands inside `apps/passenger-web`; it does not create a separate
   receipt-center app.
3. `SD-DP-20260422-001` source-owned receipt rules remain in force:
   - external-platform orders keep external-platform receipt ownership
   - tenant / partner channels keep their customer-facing receipt ownership where the settlement
     matrix assigns it
   - the passenger surface may show DRTS-issued receipts, external receipt references, or
     explicit unsupported states, but it must not invent a new email / SMS delivery channel
4. `SYS-UI-003` owns the landing shell, auth/bootstrap entry, booking-status home, and
   receipt/trip-history baseline.
5. `SYS-UI-004` owns the booking, status, and negative-flow materialization on top of that shell.

---

## Family 2 — Call Point / Concierge Portal

| Attribute                   | Value                                                                                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRD reference               | §9.1.3                                                                                                                                                         |
| Scope-matrix classification | `missing_surface` -> `execution_taskized`                                                                                                                      |
| Current repo truth          | Formal frontend landing zone selected: `apps/assisted-entry-web`; `callcenter` backend and `ops-console-web/callcenter` remain the control-plane baseline only |
| Phase 1 role                | Reopened by `SYS-UI-001` as a full-system assisted-entry family                                                                                                |
| Gate condition              | Topology decision is now fixed; implementation proceeds through `SYS-UI-005`, while production auth and CTI activation stay explicit external gates            |

### Description

The Call Point / Concierge Portal is the operator-side counterpart to the Passenger App. It covers
concierge-assisted order creation on behalf of a passenger, call-routing to the correct queue,
and CTI integration. The existing `callcenter` backend module provides the domain primitives, but
the assisted-entry plane is not the same thing as the ops control plane. `SYS-UI-001` therefore
selects a dedicated app landing zone, `apps/assisted-entry-web`, so site-bound and concierge
operators do not inherit the full `ops-console-web` control-plane shell by default.

The Complaint Hotline Console, which is topologically adjacent, has been resolved separately:
it folds into the operator/callcenter completion family rather than requiring its own app
landing zone (see consensus-packet.md §3.3).

### What Is Not Built Yet

- Call-point and concierge login/bootstrap surface
- Site-bound order-entry UI (distinct from the ops dispatch console)
- Assisted booking workflow with passenger look-up and fixed-site context
- Booking-status / callback follow-up view for assisted-entry operators
- CTI screen-pop integration and production recording linkage

### Execution Mapping

1. `apps/assisted-entry-web` is the formal landing zone for both:
   - `Call Point Mode`
   - `Concierge Mode`
2. `apps/ops-console-web/app/callcenter` remains the internal control-plane surface for
   `call_center_agent`, callback handling, recording review, and complaint transfer.
3. `SYS-UI-005` owns the assisted-entry shell, order-entry flow, passenger lookup, callback
   visibility, and degraded / denied / recording-unavailable states.
4. Live CTI vendor integration and production assisted-entry credential issuance remain explicit
   rollout gates even after the UI landing zone is fixed.

---

## Family 3 — AV / ODD / Tesla / ROC Live-Board Extensions

| Attribute                   | Value                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PRD reference               | §16                                                                                                                                                                |
| Scope-matrix classification | `future_gated`                                                                                                                                                     |
| Current repo truth          | Concept only; no implementation landing zone; no AV-specific runtime module; ROC live-board not present                                                            |
| Phase 1 role                | Out of scope; preserved as explicit deferred scope                                                                                                                 |
| Gate condition              | AV regulatory and operational readiness gate; ROC live-board design decision; ODD geography and vehicle type decisions; Tesla Fleet API integration scope decision |

### Description

PRD §16 defines the autonomous-vehicle and ROC (Remote Operations Center) extension layer.
This covers:

- **AV / ODD runtime hooks** — order routing that respects Operational Design Domain constraints
  (geo-fences, weather, time-of-day gates) and hands off to a human driver when the AV boundary
  is exceeded.
- **Tesla Fleet API integration** — vehicle status sync, charge state, remote command bridge,
  and dispatch eligibility based on state-of-charge and geofence.
- **ROC Live-Board** — real-time operator dashboard for monitoring autonomous vehicle fleets,
  interventions, safety flags, and ODD boundary events.
- **AV-specific dispatch qualification** — matcher extensions that score and select AV candidates
  separately from human-driven fleet, with ODD-aware fallback.

None of these components have an implementation landing zone in the current monorepo. They are
preserved here so that the master plan reflects the full PRD vision and Phase 2 planning teams
can pick up the scope without rediscovery.

### What Is Not Built Yet

- `modules/av-runtime/` or equivalent backend module
- ODD geo-fence registry and enforcement middleware
- Tesla Fleet API adapter (vehicle status, command bridge, dispatch eligibility)
- ROC live-board frontend (separate from ops-console-web standard dashboard)
- AV-specific dispatch qualification rules in the owned-mobility matcher
- AV incident / remote-intervention workflow
- State-of-charge and range-aware trip feasibility checks
- AV → human-driver fallback escalation path

### Promotion Conditions

This family may be promoted to an execution backlog family when:

1. AV regulatory approval for the target ODD geography is secured.
2. Tesla Fleet API access credentials and data-sharing agreement are in place.
3. ROC live-board UX has been designed and a target repo / landing zone is chosen.
4. The Phase 1 owned-mobility dispatch and driver lifecycle are stable enough to serve as the
   human-driver fallback backbone.

---

## Guardrails

The following constraints apply to all three families in this packet:

1. **Do not mark any family in this packet as complete just because the landing zone is chosen.**
   Families 1 and 2 are now taskized, not finished; Family 3 is still fully deferred.
2. **Do not remove this packet from the master plan.** Its existence is what keeps deferred scope
   visible through execution waves.
3. **Do not treat a backend module stub as a surface implementation.** The existence of
   `modules/callcenter/` does not satisfy Family 2; the existence of `modules/forwarder/` does
   not satisfy any AV scope in Family 3.
4. **Do not re-open topology ambiguity for Families 1 and 2.** `apps/passenger-web` and
   `apps/assisted-entry-web` are now the accepted landing zones for this wave unless a later
   decision explicitly supersedes them.
5. **Do not let ROADMAP.md collapse these families into generic "future work" prose.** The
   ROADMAP.md deferred section must name these families explicitly so they survive subsequent
   roadmap edits.

---

## Cross-Reference

| Document                                                                                     | Relevant section                                               |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `ROADMAP.md`                                                                                 | § Deferred Scope (Phase 2+) — added by FBP-015                 |
| `docs/01-decisions/SD-DP-20260509-005-full-system-ui-surface-topology.md`                    | full-system reopen landing-zone decision                       |
| `docs/02-architecture/consensus/phase2-full-blueprint-planning-20260415/scope-matrix.md`     | Rows for Passenger App, Call Point/Concierge, AV/ODD/Tesla/ROC |
| `docs/02-architecture/consensus/phase2-full-blueprint-planning-20260415/consensus-packet.md` | §3.3 Missing-Surface Disposition, §5 FBP-015                   |
| `docs/03-runbooks/full-system-ui-completion-execution-packet-20260509.md`                    | `SYS-UI-001` through `SYS-UI-008`                              |
| `phase1_prd_detailed_v1.md`                                                                  | §9.1.1, §9.1.3, §16                                            |
