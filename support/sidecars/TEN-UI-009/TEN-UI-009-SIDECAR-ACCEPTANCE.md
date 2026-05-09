# TEN-UI-009 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `TEN-UI-009` - Tenant Console Verification Packet
**Parent Owner:** `Codex` (per `ai-status.json` machine truth)
**Parent Reviewer:** `Claude2`
**Sidecar Owner:** `Codex2`
**Sidecar Reviewer:** `Codex`
**Generated:** `2026-05-09` (UTC)
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` - support-only; does not modify canonical truth, runtime behavior, or the parent verification packet itself.

This packet is the reviewer-facing acceptance companion for the in-progress tenant-wave verification
slice. It preserves the stable machine-truth anchors, dependency closure, selected-wave route
inventory, accepted deviations, unresolved backend gaps, and identity/RBAC review points so the
parent verification packet can be reviewed against the selected tenant-console scope instead of the
full prototype backlog.

---

## 1. Scope Boundary

In scope:

- capture the current `TEN-UI-009` machine-truth envelope and its formal dependencies
- restate the selected-wave review target as route-by-route parity across home, bookings,
  integrations, governance, and RBAC surfaces
- pin the transitive topology outcome from `TEN-UI-001` because the target app decision changes how
  every route-level parity claim should be interpreted
- record record-only drift that the parent packet must explain, especially the selected
  `apps/tenant-console-web` target versus dependency artifact/acceptance fields that still mention
  `apps/tenant-portal-web`
- translate upstream endpoint, command, query-model, and backend-gap decisions into a reviewer
  checklist for the parent verification packet

Out of scope:

- editing L1/L2 product truth, `ai-status.json`, or the parent task record
- changing runtime code, route behavior, or `@drts/api-client`
- re-deciding topology, reopening dependency tasks, or promoting deferred tenant surfaces into this
  selected wave
- declaring the current identity/bootstrap path fully cut over if the parent packet does not
  explicitly evidence that conclusion

---

## 2. Machine Truth Anchors

### Sidecar - `ai-status.json -> TEN-UI-009-SIDECAR-ACCEPTANCE`

- owner=`Codex2`
- reviewer=`Codex`
- depends_on=`XS-UI-001`, `XS-UI-002`, `XS-UI-003`, `XS-UI-004`, `TEN-UI-002`, `TEN-UI-003`,
  `TEN-UI-004`, `TEN-UI-005`, `TEN-UI-006`, `TEN-UI-007`, `TEN-UI-008`
- task_class=`sidecar`
- helper_parent=`TEN-UI-009`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifacts=`support/sidecars/TEN-UI-009/TEN-UI-009-SIDECAR-ACCEPTANCE.md`
- live lifecycle fields intentionally deferred to `ai-status.json`:
  - `status`
  - `next`
  - `last_update`

### Parent - `ai-status.json -> TEN-UI-009`

- owner=`Codex`
- reviewer=`Claude2`
- status=`in_progress`
- depends_on mirrors the sidecar dependency set
- acceptance:
  - `pnpm --filter @drts/tenant-portal-web typecheck`
  - `verification packet filed`
- artifacts=`support/sidecars/TEN-UI-009`

Workflow ownership note:

- the execution packet lists `TEN-UI-009` as `Owner: Codex / Reviewer: Claude2`
- current machine truth still lists the parent task as `owner=Codex`, `reviewer=Claude2`
- this packet treats `ai-status.json` as canonical for workflow ownership

### Formal dependencies already satisfied

All eleven formal `depends_on` tasks are `done` in `ai-status.json` with recorded closeout
evidence:

- `XS-UI-001` commit `ac44883ab24395efae49061152d8949c2b8c51c7`
- `XS-UI-002` commit `0df70c384d41563d6a6f74c953f1df66c38678b0`
- `XS-UI-003` commit `7b76d9fe0e99ef02d307f89404a3b01c3141ed87`
- `XS-UI-004` commit `c48024309e8f94bc235a002ff83cebeb8716f6b9`
- `TEN-UI-002` commit `845f996126b156f2386d8b24644c3c1ebd4094bc`
- `TEN-UI-003` commit `6166e9108feb69a4c2a6d96152e8a2339c35b705`
- `TEN-UI-004` commit `d4e36a1c10a21c746dd73d456ebc9228e927422c`
- `TEN-UI-005` commit `c4249ce0b66ccd65330633eacd6698f96ddd7498`
- `TEN-UI-006` commit `7ed1ab1ff073897d98169f7962a57f018aecb8ae`
- `TEN-UI-007` commit `94c8f395205834eb9828e213bd5985d6202ad71c`
- `TEN-UI-008` commit `9b5fb12aa2c1c9dd0d0576449977494e44deb71c`

Transitive topology anchor:

- `TEN-UI-001` is also `done` in machine truth with recorded closeout note that the formal
  in-repo tenant target is `apps/tenant-console-web` and `apps/tenant-portal-web` is
  sunset-only
- `TEN-UI-009` does not list `TEN-UI-001` directly in `depends_on`, but the parent verification
  packet still needs to carry that selected topology outcome because the later tenant-wave slices
  were supposed to consume it

### Authoritative supporting documents

- `docs/03-runbooks/tenant-console-and-cross-system-design-execution-packet-20260508.md`
- `docs/05-ui/drts-management-ui-review-execution-tasks-20260508.md`
- `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
- `support/sidecars/XS-UI-001/route-to-endpoint-map.md`
- `support/sidecars/XS-UI-002/backend-gap-inventory.md`
- `support/sidecars/XS-UI-003/command-action-matrix.md`
- `support/sidecars/XS-UI-004/filter-normalization-packet.md`
- `support/sidecars/TEN-UI-002/TEN-UI-002-SIDECAR-ACCEPTANCE.md`
- `support/sidecars/TEN-UI-006/TEN-UI-006-SIDECAR-ACCEPTANCE.md`

---

## 3. Dependency Map

| Dependency   | Status | What `TEN-UI-009` must inherit                                                                                                                                                 |
| ------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `XS-UI-001`  | `done` | Route-to-endpoint truth for tenant surfaces, especially booking detail/list, audit, users, settings, API-key, and webhook authority boundaries.                                |
| `XS-UI-002`  | `done` | Backend-gap inventory, including unresolved delivery/retry/replay boundaries and other tenant surfaces that still require honest gap framing.                                  |
| `XS-UI-003`  | `done` | Command-action truth for mutate buttons; parent verification must reject unsupported user, booking, API-key, or webhook actions.                                               |
| `XS-UI-004`  | `done` | Shared query/filter vocabulary, especially the booking list contract (`q`, `status`, `dateField`, `dateFrom`, `dateTo`, `page`, `pageSize`).                                   |
| `TEN-UI-002` | `done` | Selected `apps/tenant-console-web` shell and the stable IA slots for `/`, `/bookings`, `/bookings/new`, `/api-keys`, `/webhooks`, `/audit`, `/users`, and `/settings`.         |
| `TEN-UI-003` | `done` | Home dashboard evidence, identity summary, booking attention summary, billing/notification reminders, and integration posture framing.                                         |
| `TEN-UI-004` | `done` | `/bookings` and `/bookings/[bookingId]` parity expectations: shared query model, timeline/detail richness, fare/invoice context, and allowed actions only.                     |
| `TEN-UI-005` | `done` | New-booking workflow scope and the rule that the UI must not invent fake draft, approval, or submit semantics outside backend authority.                                       |
| `TEN-UI-006` | `done` | API-key and webhook productization expectations plus the supported-vs-gap boundary for delivery visibility, secret rotation, test events, and retry/replay.                    |
| `TEN-UI-007` | `done` | Tenant audit, users, and settings framing plus the formal role-family presentation and tenant-scoped governance boundaries.                                                    |
| `TEN-UI-008` | `done` | Tenant identity / RBAC cutover claims, role-gated navigation/action expectations, and the reviewer obligation to distinguish authority-driven reads from demo-local leftovers. |

Assertion:

- The parent task is the final evidence gate for this selected tenant wave, not a new implementation
  slice.
- No dependency reopen is implied by this packet; the remaining job is accurate synthesis and
  verification framing.

Selected-wave note:

- The UI review doc's full prototype backlog includes passengers, addresses, cost centers, rules,
  invoices, and reports.
- Those surfaces are not part of the current formal `TEN-UI-009` dependency set and should be
  recorded as deferred or out-of-wave, not silently omitted and not claimed as complete parity.

---

## 4. Selected-Wave Route Inventory

Current working-tree evidence already exposes the selected-shell route set under
`apps/tenant-console-web/app/**`, but several dependency task records still cite legacy
`apps/tenant-portal-web` artifact or acceptance fields. The parent verification packet should make
that split explicit.

| Route                   | Primary source slices                  | Current selected-shell signal                                                                                                                                                                                                                         | Review consequence                                                                                                                                                                                                |
| ----------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                     | `TEN-UI-003`, `TEN-UI-008`             | `apps/tenant-console-web/app/page.tsx` reads identity, feature flags, bookings, invoices, notifications, and integration governance through the tenant client.                                                                                        | Parent packet should state whether home parity is being claimed from the selected shell, from legacy task artifacts, or from both, and should keep identity/RBAC claims tied to real authority reads.             |
| `/bookings`             | `TEN-UI-004`, `XS-UI-004`              | `apps/tenant-console-web/app/bookings/page.tsx` plus `lib/booking-list.ts` already use `q`, `status`, `dateField`, `dateFrom`, `dateTo`, `page`, and `pageSize` over `/api/tenant/bookings`.                                                          | Parent packet should cite the shared query model and should not invent alternate filter keys or client-only status semantics.                                                                                     |
| `/bookings/[bookingId]` | `TEN-UI-004`, `XS-UI-001`, `XS-UI-003` | `apps/tenant-console-web/app/bookings/[bookingId]/page.tsx`, `components/booking-command-panel.tsx`, and route handlers under `app/api/bookings/[bookingId]/*` expose detail, timeline, fare/invoice context, and supported update/cancel flows only. | Parent packet should show endpoint and command mapping for detail reads and mutate actions, and should keep dispatch-only data out of the tenant parity claim.                                                    |
| `/bookings/new`         | `TEN-UI-005`                           | `apps/tenant-console-web/app/bookings/new/page.tsx` is still an explicit placeholder that says policy-aware intake belongs to `TEN-UI-005`.                                                                                                           | Parent packet must classify this honestly as an accepted deviation, unfinished migration, or legacy-artifact carryover; it cannot claim selected-shell full parity without explaining the gap.                    |
| `/api-keys`             | `TEN-UI-006`, `XS-UI-003`              | `apps/tenant-console-web/app/api-keys/page.tsx` currently reserves the IA slot and repeats the lifecycle guardrails, but it is not the full productized management surface.                                                                           | Parent packet should distinguish stable IA placement from feature-depth evidence and should explain whether the authoritative productization evidence still comes from legacy `tenant-portal-web` task artifacts. |
| `/webhooks`             | `TEN-UI-006`, `XS-UI-002`, `XS-UI-003` | `apps/tenant-console-web/app/webhooks/page.tsx` currently reserves the route and explicitly forbids fabricated retry/replay semantics.                                                                                                                | Parent packet should keep backend-gap language explicit and must not over-claim rotate-secret, send-test, retry, replay, or tenant-wide delivery coverage without cited support.                                  |
| `/audit`                | `TEN-UI-007`                           | `apps/tenant-console-web/app/audit/page.tsx` reads `/api/tenant/audit` as a real tenant-scoped evidence feed.                                                                                                                                         | Parent packet should preserve the read-only audit boundary and avoid implying platform-governance authority.                                                                                                      |
| `/users`                | `TEN-UI-007`, `TEN-UI-008`             | `apps/tenant-console-web/app/users/page.tsx` reads tenant users plus backend role catalog and maps them into formal role families without inventing a local role table.                                                                               | Parent packet should distinguish product-spec role-family framing from the authoritative backend role catalog and should keep unsupported invite/role-change actions out unless a cited command exists.           |
| `/settings`             | `TEN-UI-007`                           | `apps/tenant-console-web/app/settings/page.tsx` reads notifications, SLA, governance, and feature flags as tenant-scoped summaries.                                                                                                                   | Parent packet should record tenant-scoped preference parity while keeping feature-flag mutation, webhook credential lifecycle, and platform legal governance outside tenant scope.                                |

Identity/bootstrap cross-cut:

- `apps/tenant-console-web/lib/api-client.ts` still bootstraps the selected shell with fixed
  `DEMO_TENANT_ID` / `DEMO_ACTOR_ID`
- `packages/api-client/src/index.ts` still creates the tenant client with tenant-scoped headers
  (`x-actor-type=tenant_admin`, `x-realm=tenant`, `x-tenant-id`)
- the parent packet should classify that combination explicitly instead of calling the selected shell
  fully dynamic tenant identity without qualification

---

## 5. Accepted Deviations And Remaining Gaps

### A. Selected-wave versus full-prototype drift

- The selected wave covers home, bookings, integrations, audit, users, settings, and tenant
  identity/RBAC notes.
- Prototype surfaces such as passengers, addresses, cost centers, approval rules, invoices, and
  reports are still outside the current formal dependency set.
- The parent verification packet should call these surfaces deferred or out-of-wave rather than
  implying full prototype parity.

### B. Target-app record drift

- `TEN-UI-002` established `apps/tenant-console-web` as the selected in-repo tenant-admin target.
- Several closed tenant slices still record `apps/tenant-portal-web` in artifact or acceptance
  fields, and some reviewer evidence also uses `pnpm --filter @drts/tenant-portal-web typecheck`.
- The parent packet should treat this as record-only drift and explain which evidence comes from the
  selected shell versus legacy task closeout metadata.

### C. New-booking and integrations migration gap

- The selected shell already has route slots for `/bookings/new`, `/api-keys`, and `/webhooks`.
- In the current working tree, those routes still read as placeholder or IA-reservation surfaces in
  `apps/tenant-console-web`, while legacy task evidence for `TEN-UI-005` and `TEN-UI-006` points
  to productized work under `apps/tenant-portal-web`.
- The parent verification packet should treat this as an explicit accepted deviation or migration
  gap, not as silent parity.

### D. Backend/client gap boundary still active

- `TEN-UI-006` sidecar evidence already documented missing or unsupported tenant integration
  helpers:
  - tenant-wide delivery feed helper
  - rotate webhook secret helper
  - send test webhook helper
  - retry/replay without backend support
- The parent packet should carry those gaps forward and reject any UI claim that implies those
  controls are already supported.

### E. Identity/RBAC qualification still matters

- The selected shell now reads backend identity context and backend role catalog on its home/users
  surfaces.
- The same shell still boots through a fixed tenant/actor ID helper in `apps/tenant-console-web`.
- The parent packet therefore needs to distinguish authority-driven read and header posture from
  fully dynamic tenant-context bootstrap; otherwise the `TEN-UI-008` verification note will
  overstate what is actually evidenced.

---

## 6. Acceptance Checklist

Legend: `[READY]` = already satisfied before parent review. `[TO VERIFY]` = reviewer checklist for
the parent `TEN-UI-009` handoff.

### A. Dependency and scope readiness `[READY]`

- [x] All formal `depends_on` tasks for `TEN-UI-009` are `done` in machine truth.
- [x] The transitive topology decision from `TEN-UI-001` is already closed: selected in-repo
      target is `apps/tenant-console-web`, while `apps/tenant-portal-web` is sunset-only.
- [x] This sidecar artifact is support-only and does not edit canonical truth or runtime code.

### B. Parent verification packet gates `[TO VERIFY]`

- [ ] The parent verification packet is filed under `support/sidecars/TEN-UI-009/` and remains
      additive docs/evidence only.
- [ ] It records the chosen topology outcome from `TEN-UI-001` and does not slide back into a
      portal-first interpretation without explanation.
- [ ] It provides a route-by-route parity table for the selected-wave surfaces:
      `/`, `/bookings`, `/bookings/[bookingId]`, `/bookings/new`, `/api-keys`, `/webhooks`,
      `/audit`, `/users`, `/settings`.
- [ ] It clearly separates selected-wave coverage from deferred prototype surfaces
      (passengers, addresses, cost centers, rules, invoices, reports).
- [ ] For each mutate surface, it cites `XS-UI-003` command truth and rejects unsupported actions.
- [ ] It carries `XS-UI-002` backend-gap conclusions forward, especially webhook retry/replay,
      rotate-secret, send-test, tenant-wide deliveries, and any other unresolved tenant gaps.
- [ ] It carries `XS-UI-004` shared query vocabulary forward for the booking list and does not
      invent alternate filter semantics.
- [ ] It explains tenant-console versus tenant-portal artifact/acceptance drift as record-only and
      makes clear which evidence comes from selected-shell working-tree routes versus legacy task
      closeout metadata.
- [ ] It records identity/RBAC verification notes that distinguish authority-driven reads and
      tenant headers from any remaining fixed demo bootstrap.
- [ ] It includes the parent acceptance evidence chain for typecheck and packet filing without
      mutating machine truth.

### C. Helpful reviewer spot-checks `[TO VERIFY]`

- [ ] If the parent packet cites booking mutate flows, it names the current route handlers and
      tenant client methods used for update and cancel.
- [ ] If the parent packet claims API-key or webhook parity, it states whether that evidence lives
      in selected-shell routes, legacy portal routes, or a mixed migration state.
- [ ] If the parent packet claims full `TEN-UI-008` cutover, it explicitly justifies the fixed
      bootstrap helper or narrows the claim.

---

## 7. Reviewer Focus

For `Codex` reviewing this sidecar:

- confirm the sidecar anchor section keeps only stable assignment/scope fields and defers live
  workflow state to `ai-status.json`
- confirm the dependency map does not overstate full prototype parity; this packet is for the
  selected tenant wave only
- confirm the route inventory accurately separates selected-shell working-tree evidence from legacy
  `tenant-portal-web` artifact/acceptance drift
- confirm the packet explicitly surfaces the new-booking/integration migration gap, webhook
  backend-gap boundary, and fixed bootstrap qualification instead of burying them
- confirm the packet stays support-only and does not pre-approve the parent verification packet

---

## 8. Handoff Summary

This sidecar packet narrows the final evidence gate for `TEN-UI-009` into a reviewer-friendly
acceptance map: all formal dependencies are already closed, the selected-shell route inventory is
visible, the major drift points are explicit, and the remaining work for the parent task is honest
verification framing rather than further canonical implementation. The packet is ready to hand to
the assigned reviewer as support material only.
