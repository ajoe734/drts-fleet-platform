# FBP-015 Deferred Roadmap Packet

**Status:** roadmap-locked  
**Classification:** future_gated / missing_surface_future_gated  
**Task:** FBP-015  
**Created:** 2026-04-17  
**Author:** Claude (governance-review lane)  
**Canonical source references:** PRD §9.1.1, §9.1.3, §16; scope-matrix.md; consensus-packet.md §3.3

---

## Purpose

This packet preserves the explicit deferred scope families that are not targeted by the current
Phase 1 execution wave. Its role is to ensure that absent surfaces and future-gated blueprint
slices remain visible in the master plan and are not misread as complete or out-of-scope.

**This packet is not an execution backlog.** None of the families below should be instantiated
as execution tasks until a human topology and landing-zone decision is made for each.

---

## Family 1 — Passenger App / Web

| Attribute                   | Value                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| PRD reference               | §9.1.1                                                                                     |
| Scope-matrix classification | `missing_surface_future_gated`                                                             |
| Current repo truth          | No dedicated app landing zone under `apps/`; no BFF endpoint family in `apps/api`          |
| Phase 1 role                | Out of scope; preserved as visible roadmap family                                          |
| Gate condition              | Human decides target repo (new monorepo app vs. dedicated repo) and assigns execution wave |

### Description

The Passenger App / Web is a first-class blueprint surface in the PRD. It covers the
end-consumer-facing order creation, live-tracking, receipt download, and trip history flows.
Its absence from the current monorepo is intentional for Phase 1 scope control. It must remain
visible in the master plan so that Phase 2 planning does not need to re-derive it from scratch.

### What Is Not Built Yet

- Passenger-facing order creation flow
- Live vehicle tracking for passengers
- Passenger receipt and refund UX
- Passenger identity and authentication surface
- Passenger notification preferences

### Promotion Conditions

This family may be promoted to an execution backlog family when:

1. A human topology decision selects the target repo or app landing zone.
2. The Phase 1 backend authority (`drts-fleet-platform`) is confirmed stable enough to serve
   a passenger-facing BFF without further contract churn.
3. The execution wave receives a priority assignment relative to other Phase 2 families.

---

## Family 2 — Call Point / Concierge Portal

| Attribute                   | Value                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PRD reference               | §9.1.3                                                                                                                                                             |
| Scope-matrix classification | `missing_surface_future_gated`                                                                                                                                     |
| Current repo truth          | No dedicated app landing zone under `apps/`; call-center module (`apps/api/src/modules/callcenter/`) exists as backend, but no Concierge-specific frontend surface |
| Phase 1 role                | Out of scope; preserved as visible roadmap family                                                                                                                  |
| Gate condition              | Human decides whether this surface is a thin operator UI over the existing call-center/ops module or a separate repo; landing decision required before execution   |

### Description

The Call Point / Concierge Portal is the operator-side counterpart to the Passenger App. It covers
concierge-assisted order creation on behalf of a passenger, call-routing to the correct queue,
and CTI integration. The existing `callcenter` backend module provides some domain primitives, but
no dedicated frontend surface for concierge workflows exists.

The Complaint Hotline Console, which is topologically adjacent, has been resolved separately:
it folds into the operator/callcenter completion family rather than requiring its own app
landing zone (see consensus-packet.md §3.3).

### What Is Not Built Yet

- Concierge-facing order-entry UI (distinct from the ops dispatch console)
- CTI screen-pop integration for inbound calls
- Assisted booking workflow with passenger look-up
- Call quality and recording linkage in the concierge surface

### Promotion Conditions

This family may be promoted to an execution backlog family when:

1. A human topology decision distinguishes Concierge Portal from the existing Ops Console route
   coverage (either extend ops-console-web or create a new app).
2. CTI / telephony infrastructure requirements are scoped for the target deployment environment.
3. The execution wave receives a priority assignment relative to other Phase 2 families.

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

1. **Do not mark any family in this packet as complete.** None of the surfaces or modules
   described above have been implemented.
2. **Do not remove this packet from the master plan.** Its existence is what keeps deferred scope
   visible through execution waves.
3. **Do not treat a backend module stub as a surface implementation.** The existence of
   `modules/callcenter/` does not satisfy Family 2; the existence of `modules/forwarder/` does
   not satisfy any AV scope in Family 3.
4. **Do not unblock promotion without a human topology decision.** All three families have
   explicit gate conditions above; execution must not self-promote against these gates.
5. **Do not let ROADMAP.md collapse these families into generic "future work" prose.** The
   ROADMAP.md deferred section must name these families explicitly so they survive subsequent
   roadmap edits.

---

## Cross-Reference

| Document                                                                                     | Relevant section                                               |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `ROADMAP.md`                                                                                 | § Deferred Scope (Phase 2+) — added by FBP-015                 |
| `docs/02-architecture/consensus/phase2-full-blueprint-planning-20260415/scope-matrix.md`     | Rows for Passenger App, Call Point/Concierge, AV/ODD/Tesla/ROC |
| `docs/02-architecture/consensus/phase2-full-blueprint-planning-20260415/consensus-packet.md` | §3.3 Missing-Surface Disposition, §5 FBP-015                   |
| `phase1_prd_detailed_v1.md`                                                                  | §9.1.1, §9.1.3, §16                                            |
