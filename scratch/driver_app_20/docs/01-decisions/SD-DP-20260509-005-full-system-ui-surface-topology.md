# SD-DP-20260509-005: Full-System Reopened UI Surface Topology

Status: execution topology record for `SYS-UI-001`
Date: 2026-05-09
Task: `SYS-UI-001`
Owner: `Codex`
Reviewer: `Claude`

## Decision

As of `2026-05-09`, the previously deferred full-system UI families are no longer allowed to stay
in a topology-unknown state for the complete-system claim.

The accepted repo-local landing zones for this wave are:

1. Partner booking mode -> `apps/tenant-console-web`
2. Passenger App / Web -> `apps/passenger-web`
3. Passenger receipt / trip-history UI -> sub-surface of `apps/passenger-web`
4. Call Point / Concierge Portal -> `apps/assisted-entry-web`
5. User-facing booking-status surface -> not a separate app; it folds into
   `apps/passenger-web` and `apps/assisted-entry-web` instead of becoming a standalone
   live-board product

`apps/tenant-portal-web` remains sunset and is not reopened as a target for any of the above.
ROC / AV live-board scope remains future-gated under `FBP-015` Family 3.

## Surface Map

| Surface family                | Formal landing zone                                            | Why this zone                                                                                                                                                                                              | Downstream tasks                         | State                                                    |
| ----------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------- |
| Partner booking mode          | `apps/tenant-console-web`                                      | `TEN-UI-001` already fixed the repo-local tenant target there, and the product spec requires partner mode to stay a constrained route group rather than a full tenant-admin shell                          | `SYS-UI-002`                             | repo-buildable now                                       |
| Passenger App / Web           | `apps/passenger-web`                                           | PRD §9.1.1 defines a first-party external-consumer surface with distinct auth, booking, status, receipt, and complaint flows; keeping it out of tenant/ops/admin shells preserves channel-layer separation | `SYS-UI-003`, `SYS-UI-004`               | repo-buildable now                                       |
| Passenger receipt UI          | `apps/passenger-web`                                           | receipt and trip-history UX belong beside the passenger booking-status journey, not in a separate app                                                                                                      | `SYS-UI-003`, `SYS-UI-004`               | repo-buildable now with source-owned receipt constraints |
| Call Point / Concierge Portal | `apps/assisted-entry-web`                                      | `call_point_operator` and `concierge_operator` are an assisted-entry plane, not the internal ops control plane; a dedicated app avoids leaking full ops-console capability to site-bound operators         | `SYS-UI-005`                             | repo-buildable now; production auth and CTI still gated  |
| Public booking-status surface | folded into `apps/passenger-web` and `apps/assisted-entry-web` | PRD truth only requires ETA / dispatch-status visibility for passenger and assisted-entry journeys; the only separate live-board family in canonical docs is ROC, which stays future-gated                 | `SYS-UI-003`, `SYS-UI-004`, `SYS-UI-005` | resolved as sub-surface, not a separate family           |

## Constraints Carried Forward

1. `/api/tenant/*` remains the only backend authority for tenant-admin and partner booking flows.
   Partner mode may share `apps/tenant-console-web`, but only as a constrained route group with a
   separate auth/bootstrap path and no tenant-admin navigation leakage.
2. The passenger surface is a channel layer over existing dispatch, billing, audit, and complaint
   truth. It may not fork settlement, dispatch, or audit state locally.
3. `SD-DP-20260422-001` receipt ownership rules still apply:
   - third-party / forwarded orders keep third-party receipt ownership
   - tenant / partner channels keep their customer-facing receipt ownership where the settlement
     matrix assigns it
   - the new passenger surface may render DRTS-issued receipts, external receipt references, or
     explicit unsupported states, but it must not invent a new email / SMS delivery channel
4. `apps/ops-console-web/app/callcenter` remains the control-plane agent workspace for phone
   orders, callback handling, recording review, and complaint transfer. `apps/assisted-entry-web`
   is the external/site-bound assisted-entry surface, not a replacement for the ops workspace.
5. `apps/tenant-portal-web` remains sunset. New partner, passenger, receipt, or assisted-entry
   product work must not be routed there.

## Rationale

- `TEN-UI-001` already resolved the tenant productization topology and explicitly allowed partner
  mode to live in `apps/tenant-console-web` only behind a separate route-group and navigation
  boundary.
- PRD §9.1.1 and §9.1.3 define Passenger and Call Point / Concierge as first-class surfaces, not
  optional notes. Keeping them unlanded would leave the complete-system claim structurally
  ambiguous.
- The role matrix splits `partner_portal_user`, `passenger`, `call_point_operator`, and
  `concierge_operator` into different realms / planes, so reusing the same control-plane or
  tenant-admin shell for all of them would blur the auth and navigation boundary.
- The Phase 1 operational blueprint explicitly says a reopened passenger surface must remain a
  channel layer and must not replace core settlement / audit / dispatch truth. A dedicated
  `apps/passenger-web` aligns with that rule better than hiding passenger flows inside tenant or
  ops products.
- The canonical docs do not define a separate non-ROC public live-board product. They define
  ETA/status visibility inside passenger and assisted-entry journeys, while ROC live-board stays
  future-gated under PRD §16.

## Supersession And Taskization

- This decision supersedes the "human topology decision required before execution" state for
  `FBP-015` Family 1 and Family 2.
- This decision refines `SD-DP-20260422-001` rather than discarding it:
  - the blanket "do not open first-party passenger UI backlog" rule is replaced for this wave
  - the source-owned receipt and no-invented-delivery-channel rules remain in force
- The reopened families are now fully taskized through `SYS-UI-002` to `SYS-UI-005`, and the
  cross-surface / verification closure continues through `SYS-UI-006` to `SYS-UI-008`.

## References

- `phase1_prd_detailed_v1.md` §9.1.1, §9.1.2, §9.1.3, §9.1.4
- `phase1_system_analysis_v1.md` §3.1, §12.4, §12.6
- `phase1_service_contracts_v1.md` §3.11
- `docs/01-decisions/SD-DP-20260422-001-phase1-entry-and-receipt-topology.md`
- `docs/01-decisions/SD-DP-20260508-004-tenant-console-productization-topology.md`
- `docs/02-architecture/phase1-operational-system-design-blueprint-20260429.md` §4.29
- `docs/02-architecture/phase1-role-scenario-and-negative-flow-matrix-20260430.md`
- `docs/02-architecture/roadmap/fbp-015-deferred-scope-packet.md`
- `docs/03-runbooks/full-system-ui-completion-execution-packet-20260509.md`
