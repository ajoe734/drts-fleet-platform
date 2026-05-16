# SYS-UI-001 BFF And Frontend Handoff Packet

- Sidecar Task: `SYS-UI-001-SIDECAR-BFF-HANDOFF`
- Parent Task: `SYS-UI-001`
- Helper Kind: `bff_handoff_packet`
- Sidecar Owner / Reviewer: `Codex2` / `Codex`
- Parent Owner / Reviewer: `Codex` / `Claude`
- Date: `2026-05-09`
- Class: support / sidecar only; no canonical-truth mutation

## Purpose

This packet turns the `SYS-UI-001` topology decision into a build-ready handoff
for the next owners of:

- `SYS-UI-002` partner booking mode
- `SYS-UI-003` passenger shell / receipt baseline
- `SYS-UI-004` passenger booking / status / negative flows
- `SYS-UI-005` assisted-entry / concierge surface

It does not reopen the topology decision. It records:

- what frontend/BFF assets already exist and can be reused
- which operator journeys already have a control-plane implementation
- which passenger / assisted-entry queries are still missing
- where the current API client and transport seams are tenant-only or ops-only

## Shared-Truth Baseline

- `SYS-UI-001` fixed the landing zones: partner mode in
  `apps/tenant-console-web`, passenger status/receipt/history in
  `apps/passenger-web`, and call point / concierge in
  `apps/assisted-entry-web`.
  `docs/01-decisions/SD-DP-20260509-005-full-system-ui-surface-topology.md:14-25`
- The same decision keeps `/api/tenant/*` as the authority for tenant/partner
  booking flows, keeps passenger as a channel layer over existing backend truth,
  and keeps `ops-console-web/callcenter` as the internal control-plane workspace.
  `docs/01-decisions/SD-DP-20260509-005-full-system-ui-surface-topology.md:37-54`
- PRD requirements still define passenger direct booking / ETA / status /
  cancel / history / receipt / complaint, plus call-point site login / site
  selection / proxy booking / ETA / dispatch result / escalation.
  `phase1_prd_detailed_v1.md:452-488`
  `phase1_prd_detailed_v1.md:548-567`
- The current product spec already separates ownership:
  `apps/passenger-web` owns passenger journeys, while
  `apps/assisted-entry-web` owns call point / concierge and
  `Ops Console` keeps callcenter / complaint / callback control-plane work.
  `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md:1577-1586`

## Repo Baseline

### 1. What already exists

The repo already has concrete frontend/BFF material for the two adjacent planes:

- `apps/tenant-console-web` already ships booking list and detail surfaces over
  `/api/tenant/bookings`, including shared list-query filtering and booking
  detail finance context.
  `apps/tenant-console-web/app/bookings/page.tsx:23-31`
  `apps/tenant-console-web/app/bookings/page.tsx:41-138`
  `apps/tenant-console-web/app/bookings/[bookingId]/page.tsx:73-95`
  `apps/tenant-console-web/app/bookings/[bookingId]/page.tsx:160-237`
- `apps/tenant-console-web` already exposes mutation shims for booking update
  and cancel, so downstream slices do not need to invent client-local state.
  `apps/tenant-console-web/app/api/bookings/[bookingId]/update/route.ts:1-20`
  `apps/tenant-console-web/app/api/bookings/[bookingId]/cancel/route.ts:1-21`
- `apps/ops-console-web/app/callcenter` already provides the richest assisted
  booking control-plane surface: session intake, phone booking linkage,
  callback queue, recording attachment, complaint transfer, and linked dispatch
  trace inspection.
  `apps/ops-console-web/app/callcenter/page.tsx:159-257`
  `apps/ops-console-web/app/callcenter/page.tsx:201-233`
- `packages/api-client` already has concrete methods for tenant booking, order
  detail / dispatch trace, callcenter, callbacks, complaints, billing profile,
  invoices, tenant passengers, and address book.
  `packages/api-client/src/index.ts:489-558`
  `packages/api-client/src/index.ts:772-983`
  `packages/api-client/src/index.ts:1230-1245`

### 2. What does not exist yet

- There is no `apps/passenger-web` tree in the repo yet.
- There is no `apps/assisted-entry-web` tree in the repo yet.
- There is no passenger-specific frontend transport helper analogous to
  `getTenantClient()` or `getOpsClient()`.
- There is no passenger-focused or call-point-focused proxy route analogous to
  `apps/ops-console-web/app/control-plane-proxy/[...path]/route.ts`.

Interpretation:

- `SYS-UI-003` and `SYS-UI-005` are not mainly UI-polish tasks; they begin with
  transport and query-shape choices because the new landing zones do not have a
  runtime seam yet.

## Current Transport And Authority Seams

### Tenant / partner seam is usable now

- `getTenantClient()` hard-wires a tenant-scoped client with demo tenant and
  actor IDs and already points to canonical tenant routes.
  `apps/tenant-console-web/lib/api-client.ts:1-17`
- Tenant booking list/detail pages already assume backend-owned booking truth
  and status vocabulary rather than local drafts.
  `apps/tenant-console-web/app/bookings/page.tsx:35-45`
  `apps/tenant-console-web/app/bookings/page.tsx:134-138`
  `apps/tenant-console-web/app/bookings/[bookingId]/page.tsx:99-145`
- The current `/bookings/new` route is only a placeholder; it explicitly says
  the policy-aware intake still belongs to downstream work.
  `apps/tenant-console-web/app/bookings/new/page.tsx:11-27`

Carry-forward meaning:

- `SYS-UI-002` can reuse tenant transport and booking query patterns.
- The remaining partner work is mainly route-group isolation, auth/bootstrap,
  eligibility framing, and product-safe booking creation.

### Ops / callcenter seam is usable now

- `getOpsClient()` stamps `ops_user` headers when running direct-to-API and can
  also run through `/control-plane-proxy`.
  `apps/ops-console-web/lib/api-client.ts:20-47`
- The proxy mints control-plane auth for `ops_user`, forwards all methods, and
  preserves request headers needed for upstream auth.
  `apps/ops-console-web/app/control-plane-proxy/[...path]/route.ts:111-178`

Carry-forward meaning:

- `SYS-UI-005` should treat callcenter as the upstream control-plane authority
  for assisted-entry escalation and evidence handling.
- `apps/assisted-entry-web` should not duplicate complaint/callback/recording
  operations that already belong to the internal ops workspace.

### Passenger seam is not usable yet

- `packages/api-client` includes tenant booking methods, generic order reads,
  and a passenger cancel controller exists, but there is no passenger-scoped
  api-client wrapper for list/detail/status/history/receipt flows.
  `packages/api-client/src/index.ts:489-558`
  `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts:288-298`
- There is no passenger proxy/helper comparable to the tenant or ops helpers.

Carry-forward meaning:

- `SYS-UI-003` and `SYS-UI-004` need a first-class passenger transport decision
  before UI route work becomes efficient.

## Operator Journey Handoff

### 1. Partner booking mode

Canonical journey:

1. Platform admin configures partner entry.
2. Partner caller clears auth/bootstrap.
3. Optional eligibility check runs.
4. Booking is created.
5. Downstream audit / billing / reporting keep partner provenance.

Source:
`docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md:171-177`

Frontend/BFF handoff:

- Reuse tenant booking list/detail patterns from `apps/tenant-console-web`.
- Reuse tenant passengers, addresses, billing profile, and invoice list query
  methods from `@drts/api-client`.
- Do not reuse tenant-admin navigation wholesale; the topology decision requires
  a constrained route group with no tenant-admin leakage.
  `docs/01-decisions/SD-DP-20260509-005-full-system-ui-surface-topology.md:39-41`

### 2. Passenger booking to trip status

Canonical journey:

1. Passenger creates immediate or reserved booking.
2. Passenger sees ETA and dispatch status.
3. Passenger may cancel.
4. Passenger can review history and receipt.
5. Passenger can escalate to support / complaint.

Source:
`phase1_prd_detailed_v1.md:458-488`

Frontend/BFF handoff:

- There is no existing passenger app shell to fork.
- The closest data shape today is tenant booking detail because it already
  exposes status, time windows, passenger profile, and fare metadata.
  `apps/tenant-console-web/app/bookings/[bookingId]/page.tsx:105-237`
- Passenger cannot simply reuse tenant identity headers because the passenger
  lane is a separate external-consumer plane, not tenant admin.
  `docs/01-decisions/SD-DP-20260509-005-full-system-ui-surface-topology.md:42-49`

### 3. Assisted-entry / concierge flow

Canonical journey:

1. Site-bound operator signs in with site identity.
2. Operator selects fixed site.
3. Operator creates a booking on behalf of the rider.
4. Operator gets ETA and dispatch result.
5. Failure path escalates into customer service / control plane.

Source:
`phase1_prd_detailed_v1.md:554-567`

Adjacent implemented ops journey:

1. Callcenter agent opens a call session.
2. Agent creates or links an order.
3. Agent quotes ETA and attaches recording evidence.
4. Agent creates callback tasks or transfers to complaint / incident.

Source:
`docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md:163-169`
`phase1_prd_detailed_v1.md:577-614`

Frontend/BFF handoff:

- `apps/assisted-entry-web` should reuse the callcenter and order/read models as
  its escalation target, not replace them.
- The new app needs a narrower external/site-bound surface that stops before
  internal callback / complaint case management.

## BFF Query Gap Inventory

### A. Reusable now

| Target slice | Reusable query / command                                                                                                                                                    | Evidence                                                                                | Handoff note                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `SYS-UI-002` | `createTenantBooking`, `listTenantBookings`, `getTenantBooking`, `updateTenantBooking`, `cancelTenantBooking`                                                               | `packages/api-client/src/index.ts:535-565`                                              | Enough for partner booking CRUD once auth/bootstrap and eligibility are solved.                       |
| `SYS-UI-002` | `listPassengers`, `listAddresses`, `getBillingProfile`, `listInvoices`                                                                                                      | `packages/api-client/src/index.ts:973-979` `packages/api-client/src/index.ts:1230-1245` | Reuse existing tenant-side master-data and finance lookups instead of inventing partner-local copies. |
| `SYS-UI-005` | `listCallSessions`, `openCallSession`, `quoteCallEta`, `linkCallOrder`, `attachRecordingCallback`, `listCallbackTasks`, `transferCallToComplaint`, `transferCallToIncident` | `packages/api-client/src/index.ts:772-873`                                              | This is the strongest reusable assisted-entry upstream seam.                                          |
| `SYS-UI-005` | `getOrder`, `getOrderDispatchTrace`                                                                                                                                         | `packages/api-client/src/index.ts:489-498`                                              | Use for read-only dispatch/result visibility after assisted booking creation.                         |

### B. Concrete gaps to solve before passenger / assisted-entry feel complete

| Gap                                                                   | Why it matters                                                                                                                                                      | Current evidence                                                                                                             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Passenger transport helper / proxy does not exist                     | `apps/passenger-web` has no actor-scoped request path equivalent to tenant or ops clients.                                                                          | `apps/tenant-console-web/lib/api-client.ts:1-17` `apps/ops-console-web/lib/api-client.ts:20-47`                              |
| Passenger order read/status query is missing from api-client          | Passenger PRD requires ETA + dispatch status + history, but the client only exposes tenant booking reads and generic order reads.                                   | `phase1_prd_detailed_v1.md:460-467` `packages/api-client/src/index.ts:489-558`                                               |
| Passenger cancel wrapper is missing from api-client                   | The backend exposes `POST /passenger/orders/:orderId/cancel`, but no frontend helper wraps it.                                                                      | `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts:288-298`                                                   |
| Passenger receipt query/download path is not exposed                  | Contracts define `IssuePassengerReceiptCommand` and `PassengerReceiptRecord`, but there is no controller/api-client receipt route in repo.                          | `packages/contracts/src/index.ts:2872-2881` `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts:1-125` |
| Passenger history query is missing                                    | PRD requires history, but there is no passenger-scoped list endpoint/client method.                                                                                 | `phase1_prd_detailed_v1.md:464-467` `packages/api-client/src/index.ts:535-545`                                               |
| Complaint initiation from passenger surface has no direct UI/BFF seam | Ops complaint tooling exists, but passenger-side complaint entry is not packaged as an external-consumer flow.                                                      | `packages/api-client/src/index.ts:878-969`                                                                                   |
| Call-point site bootstrap query is missing                            | PRD requires site-bound login and fixed-site selection; no site lookup/bootstrap helper exists in current client inventory.                                         | `phase1_prd_detailed_v1.md:556-567`                                                                                          |
| Tenant invoice detail exists server-side but lacks api-client wrapper | Booking detail can only infer linked invoices by scanning `listInvoices()`, which is acceptable for tenant admin but not ideal for passenger receipt/history views. | `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts:96-120` `packages/api-client/src/index.ts:977-982` |

### C. Receipt ownership guardrail

Do not assume every new passenger-facing completed trip can show a platform-owned
download button:

- tenant-enterprise trips keep receipt ownership with the tenant / partner
  channel
- partner-airport trips may belong to card-benefit / service-platform / partner
  channels
- phone-origin orders explicitly note that no passenger receipt center may exist

Source:
`apps/api/src/modules/billing-settlement/settlement-matrix.ts:3-65`
`docs/01-decisions/SD-DP-20260509-005-full-system-ui-surface-topology.md:44-49`

Carry-forward meaning:

- `apps/passenger-web` should support three receipt states:
  DRTS-issued, external-reference, and unsupported / backoffice-owned.

## Frontend Handoff Materials

### For `SYS-UI-002`

Start from:

- `apps/tenant-console-web/app/bookings/page.tsx`
- `apps/tenant-console-web/app/bookings/[bookingId]/page.tsx`
- `apps/tenant-console-web/app/bookings/new/page.tsx`

Use them as:

- booking list and detail reference
- proof that status/filter vocabulary is already canonical
- proof that new-booking flow still needs real intake semantics

### For `SYS-UI-003` and `SYS-UI-004`

Minimum first-pass surface package should include:

- auth/bootstrap entry
- booking-status home
- order detail / ETA / dispatch-status view
- history / trip-history landing
- receipt state panel
- unauthenticated / unsupported / not-serviceable states

Recommended reuse:

- timeline and booking-summary framing from tenant booking detail
- status vocabulary from `OWNED_ORDER_STATUSES`
- order/dispatch-trace linkage from ops callcenter detail loading

Do not reuse:

- tenant admin shell
- ops control-plane proxy as-is
- tenant invoice list scanning as the final receipt model

### For `SYS-UI-005`

Minimum first-pass surface package should include:

- site-bound auth/bootstrap
- fixed-site selector
- proxy booking entry
- ETA / dispatch-result read surface
- explicit handoff to callcenter / complaints when assisted booking fails

Recommended reuse:

- callcenter order-linking and ETA command shape
- order + dispatch-trace read model
- complaint escalation boundary from ops control plane

Do not reuse:

- the full `ops-console-web` navigation and authority scope
- callback / recording / complaint case management as primary assisted-entry UI

## Suggested Execution Order

1. `SYS-UI-002`: finish partner booking mode using existing tenant transport and
   list/detail patterns.
2. `SYS-UI-003`: establish `apps/passenger-web` shell plus passenger transport
   decision.
3. `SYS-UI-004`: add passenger booking/status/history/negative flows only after
   the transport and receipt-state model are fixed.
4. `SYS-UI-005`: build assisted-entry shell around site bootstrap plus
   callcenter escalation seams.

## Verification

Support artifact only.

Verification performed:

- repo search of current landing zones and adjacent apps
- source review of canonical topology decision, PRD, product spec, api-client,
  tenant-console booking surfaces, ops-console callcenter surface, and billing /
  owned-mobility controllers

No runtime tests were run because this task only adds a handoff document.

## Reviewer Focus

Reviewer `Codex` should check:

1. The packet stays support-only and does not rewrite canonical truth.
2. Partner / passenger / assisted-entry boundaries match `SYS-UI-001`.
3. Passenger receipt handling preserves source-owned receipt constraints.
4. The documented BFF gaps are real gaps in the current repo, not speculative
   product changes.
