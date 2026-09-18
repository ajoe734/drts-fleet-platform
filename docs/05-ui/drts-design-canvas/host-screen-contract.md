# Fleet Partner Portal — 車主 Host 自車受限唯讀入口 Screen Contract

**Task:** `SR-HOST-FE-001-CANVAS` (canonical canvas) · unblocks `SR-HOST-FE-001` (implementation)
**Source finding:** Gap `N03` · **Capability:** `C012`
**Canvas artifacts:** `fleet-host.jsx` (`FLP_HostVehicles`, `FLP_HostVehicleDetail`, `FLP_HostAccessStates`) +
`Fleet Partner Portal.html` (wires the script + a new `06 · 車主 Host` section, 12 artboards) + this doc
**Does not modify:** `fleet-screens.jsx`, `fleet-cases.jsx`, `fleet-data.jsx` (all out of this task's write scope)

## 0. Blocked-then-unblocked history

`SR-HOST-FE-001` (owner Codex2) previously recorded a design-blocker note at
`docs/04-uat/system-remediation-20260906/SR-HOST-FE-001.md`: the canvas had no
Host entry or owned-vehicle screens at all, so no parent implementation could
proceed without inventing its own design (explicitly disallowed by the UI
Design Contract). This task supplies that missing canonical design so the
parent task has a pixel/behavior reference instead.

Both dependencies (`SR-CONTRACT-001`, `SR-FLEET-CASE-001-CANVAS`) are `done`
and merged to `dev` at dispatch time; this canvas is built on top of the
already-landed `fleet-cases.jsx` (serialized via the shared `fleet-cases-canvas`
resource so the two canvas tasks never edit `Fleet Partner Portal.html`
concurrently).

## 1. Host is a different actor from `FLP_ACTOR`

Every existing screen in this file (`FLP_Dashboard`, `FLP_Drivers`, …,
`FLP_Cases`) is scoped to `FLP_ACTOR` (`flp_admin`, fleet-wide, full nav,
mutation-capable). Host is `individual_owner` (realm `partner`, scopes
`owned:read` / `reports:read` / `maintenance:read`, resource-constrained to
`vehicle.owner_partner_id === identity.partnerId`), **strictly read-only**, and
must not see fleet-admin nav items (`drivers`, `vehicles` fleet-wide, `supply`,
`revenue`, `training`, etc.) — "no unrestricted fleet links" per the task
brief. `fleet-host.jsx` therefore defines its own `HostShell` (restricted
`HOST_NAV` = one entry, `自有車輛`) rather than reusing `FlpShell`/`FLP_NAV`.
Final route wiring/app-shell composition remains owned by `SR-WIRE-001`, per
`SR-HOST-FE-001.md`'s "Shared layout/navigation remains owned by SR-WIRE-001."

## 2. Requirement traceability

Source: `SR-HOST-FE-001.md` "Required design coverage before implementation"
(anchor `d782bc2a2348a814171f7ecf092e6c8ab72f61c1`) and
`feature-contracts.md` §4.

| Requirement | Artboard(s) | Evidence |
|---|---|---|
| Host entry, restricted nav, no admin/mutation controls | all `host-*` | `HostShell`/`HOST_NAV` (one nav item), no `ActionButton` anywhere in `fleet-host.jsx` — grep confirms zero mutation affordances. |
| Owned-vehicle list: columns, filters, pagination, loading/no-vehicle/no-results | `host-vehicles`, `-loading`, `-empty`, `-no-results` | `FLP_HostVehicles` `state` prop; `Table` columns match `HostVehicleSummary` 1:1; `HostPageFooter` (new local pagination composition, §4); `PageHeader` `tabs` as the (static, see §4) status filter. |
| Per-vehicle read-only earnings/maintenance/trips/cases, date filters, pagination retaining `vehicleId` | `host-vehicle-earnings*`, `-maintenance`, `-trips`, `-cases` | `FLP_HostVehicleDetail` `tab` prop; breadcrumb `['自有車輛', v.plateNo]` keeps the selected vehicle in context across tabs; `HostTripsPanel`'s `期別` button is the date-filter affordance (static, §4); `HostPageFooter` on trips. |
| No unrestricted fleet links | all | No link/button anywhere routes outside the Host's own vehicle scope; `operatingFleetName` is plain text, not a link (contrast `fleet-cases.jsx`'s `<a>` to `relatedOrder` — Host never gets that kind of cross-entity jump). |
| Uniform 404 `HOST_VEHICLE_NOT_FOUND` (never 403, anti-enumeration), forbidden, retryable failure | `host-access-states` | Four `EmptyState` cards + one static-error-explanation card, mirroring `fleet-cases.jsx`'s `FLP_CaseAccessStates` convention (§4.6 error table below). |
| No stale vehicle data after selection changes | `host-vehicle-switching` | `FLP_HostVehicleDetail switching` renders `HostSkeletonRows` in place of the vehicle-summary/tab cards, with a `Banner` stating the previous vehicle's panels were cleared before the new one loads. |
| Earnings: distinguish zero / no-records / unknown settlement; `pending_policy` nulls never fabricated as zero | `host-vehicle-earnings`, `-zero`, `-no-record` | Three distinct `HostEarningsPanel` variants — see §3. |
| Privacy: masked VIN, district-only trip locations, redacted case conclusions, no passenger contact/address | `host-vehicles`, `host-vehicle-trips`, `host-vehicle-cases` | `vinMasked` rendered verbatim from fixture (already masked, e.g. `1HGCR2F83HA******`); `areaSummary` fixture values are district-pair strings only (no address/phone field exists on the fixture at all); `HostCasesPanel`'s `RESOLUTION` column shows only `resolutionSummary`, never a reporter identity. |
| Approved realm-token mapping (no invented palette) | n/a (applies to every artboard) | §5 below. |

## 3. Earnings: three distinct states, not two

The contract (`HostVehicleEarningsSummary`) has `settlementStatus: "calculated" |
"pending_policy"`, and separately `grossRevenue`/`tripsCount` can legitimately
be `0`. That is **three** meaningfully different situations a naive
implementation could collapse into one "no numbers" screen:

1. **`earningsVariant="pending_policy"`** (`FX_HOST_EARNINGS`) — real, non-zero
   activity (`grossRevenue: 84200`, `tripsCount: 182`) but `fleetCommission` /
   `netEarnings` are `null` because the fleet-commission split policy is not
   yet decided (`SR-HOST-BE-001` decision point). Rendered as `—
   (pending_policy)`, never `0` or a fabricated percentage, with a `warn`
   `Banner` explaining why.
2. **`earningsVariant="zero"`** (`FX_HOST_EARNINGS_ZERO`) — a real, calculated
   period where the vehicle simply had no completed trips (`grossRevenue: 0`,
   `tripsCount: 0`). This is **not** an empty/error state; an `info` `Banner`
   explicitly says so and cross-references variant 3 to prevent the two being
   confused.
3. **`earningsVariant="no_record"`** — no `HostVehicleEarningsSummary` document
   exists yet for the queried month at all (e.g. a newly onboarded vehicle
   before its first billing cycle). Rendered via the canonical `EmptyState
   reason="no_data"`, not a zero-filled table.

All three share the same `Field`/`Select` month picker (static display, per
§4) so switching among them is just a query-parameter change from the API's
point of view, not a different screen.

## 4. What this canvas deliberately does NOT wire up (static-canvas convention)

Per the repo-wide convention already documented in
`fleet-cases-screen-contract.md` §2 Group 5 (and matched by `FLP_Drivers`,
`FLP_Trips`, `FLP_Documents` in `fleet-screens.jsx`), `PageHeader` `tabs` and
filter/`期別` buttons in a static design-canvas gallery are **pre-rendered
variant selectors**, not live client-side filters:

- The owned-vehicle list's status tabs (全部/使用中/維修中/停用) and the
  trips tab's `期別` button are static affordances. The authoritative typed
  client (`packages/api-client/src/system-remediation.ts`) exposes only
  `{ page, pageSize }` on `listHostVehicles` / `listHostVehicleMaintenance` /
  `listHostVehicleTrips` / `listHostVehicleCases`, and `{ month }` on
  `getHostVehicleEarnings` — **no status or date-range query parameter
  exists on the typed client**. This canvas does not invent one; the visual
  filter affordance documents *that a filter entry point belongs here*, and
  the exact query contract is `SR-HOST-BE-001`'s decision, consistent with
  the "reuse authoritative API, don't invent fixtures/params" collaboration
  rule.
- Pagination (`HostPageFooter`) is a new **local composition** (plain `Btn`
  pair + a "N 筆 · 第 x / y 頁" caption) because no shared `Pagination`
  primitive exists anywhere in this design-canvas repo yet (every existing
  list screen renders an unpaginated `Table`). It consumes the same
  `ApiListData<T>.pageInfo` shape (`page`, `pageSize`, `totalItems`,
  `totalPages`) already defined in `packages/contracts/src/index.ts`, so a
  real implementation only has to bind those four fields — no new pagination
  contract is proposed here.
- "防止舊車輛資料殘留" (no stale vehicle data after selection changes) is
  shown as a `switching` boolean prop rather than real client-side state,
  since this is a static gallery; the artboard exists specifically to give
  the parent implementation task a concrete visual contract for "clear the
  previous vehicle's panels before the new vehicle's data arrives" — i.e. key
  every panel's data fetch off `vehicleId` and render a loading/empty state
  for the new id rather than leaving the old id's numbers on screen during
  the transition.

## 5. Visual authority compliance — realm/token mapping

This is the specific point `SR-HOST-FE-001.md` flagged as a blocker: "The
contract's IAM realm is `partner`, while `REALM_COLORS` enumerates
tenant/ops/platform/system/driver; design must identify the approved mapping
rather than adding a local palette." Two separate token systems exist in this
canvas and each is addressed:

1. **Console/page-chrome theme** (`buildMgmtTheme({ console, ... })`,
   `mgmt-tokens.jsx` `MGMT_ACCENTS`) — drives the overall accent color, sidebar
   brand, and the `IdentityChip` "realm chip" badge (`th.consoleId`). Host
   screens are rendered from the **same** `App()`/`th` as every other artboard
   in `Fleet Partner Portal.html` (`buildMgmtTheme({ console: 'fleet', ... })`
   — emerald `#047857`/`#6EE7B7`), because `fleet-host.jsx` is embedded in that
   same file per the task brief's framing ("Host entry within the active Fleet
   Partner Portal"). There is **no separate Host console theme to invent** —
   the artboards simply receive the portal's existing `th`.
   - `MGMT_ACCENTS` does contain a `partner` entry (amber `#B45309`), but its
     own comment marks it "Reserved for future apps/partner-booking-web
     (Q-TEN03 cutover)" — a different, unrelated product. Reusing it here
     would misattribute Host to that other app, so this canvas does not.
2. **Actor/cross-actor realm badges** (`REALM_COLORS` /
   `packages/ui-tokens/src/realms.ts`, rendered via `Pill`'s `tenant`/`ops`/
   `platform`/`system`/`driver` tones or `Timeline`'s `actorRealm`) — these
   identify *which realm an actor belongs to* in cross-actor audit contexts.
   Host's screens render **no cross-actor identity at all** — no Ops assignee,
   no fleet-partner reply author, no case-handler chip anywhere in
   `fleet-host.jsx` (privacy redaction — Host never sees who resolved a case,
   only its outcome) — so no `REALM_COLORS` mapping is needed by this canvas.
   If a future revision adds a cross-actor element (e.g. surfacing which
   entity performed a maintenance action), the established precedent already
   set by `fleet-cases.jsx` §5 applies: external business actors (fleet
   partners, and by the same reasoning individual vehicle owners) map to the
   `tenant` tone, since `REALM_COLORS` has no dedicated `partner`/`fleet`
   entry and its own doc-comment says these tones are "shared across the
   ops / admin / tenant / partner / fleet consoles."
- No new colors, gradients, or hex literals were introduced anywhere in
  `fleet-host.jsx`; every color reference goes through `th.*` from the shared
  theme object, identical to every other screen in this file.
- Every primitive used (`Shell`, `PageHeader`, `Card`, `Table`, `Pill`,
  `Banner`, `DL`, `Field`, `Select`, `Btn`, `MgmtIcon`, `EmptyState`) is an
  existing import from `mgmt-shell.jsx` / `mgmt-primitives.jsx` /
  `mgmt-auth.jsx` / `mgmt-tokens.jsx`. `HostShell`, `HostPageFooter`,
  `HostSkeletonRows`, `HostEarningsPanel`, `HostMaintenancePanel`,
  `HostTripsPanel`, `HostCasesPanel` are local compositions of those existing
  primitives (same "local composition, not new primitive" pattern as
  `fleet-screens.jsx`'s `SvcChip` and `fleet-cases.jsx`'s `CaseAttachmentRow`).

## 6. API-owned behavior (explicitly NOT decided by this UI)

- **Fleet-commission split policy** — whether/when `fleetCommission` /
  `netEarnings` become non-null is `SR-HOST-BE-001`'s decision. This canvas
  never fabricates a percentage or a zero.
- **Anti-enumeration 404 vs 403** — the backend, not the UI, decides that any
  `vehicleId` not owned by the caller returns `HOST_VEHICLE_NOT_FOUND` (404),
  never `HOST_FORBIDDEN` (403), to block ID-enumeration attacks. The UI only
  renders whatever the API returns via the shared `EmptyState` primitive.
- **Status/date filter semantics and exact query parameter names** — left to
  `SR-HOST-BE-001` per §4 above; this canvas only marks where the filter
  entry point belongs.
- **Pagination page size / total counts** — bound from `ApiListData.pageInfo`
  at implementation time; this canvas's `HostPageFooter` fixture values
  (`page=1, totalPages=1`) are illustrative only.
- **Attachment/case-reply capability** — does not exist for Host at all (zero
  write scope by contract), so no such affordance is rendered, in explicit
  contrast to `fleet-cases.jsx`'s rich reply/attachment UI for `flp_admin`.

## 7. Error-code coverage (Family 3, `SYSTEM_REMEDIATION_ERROR_CODES`)

| Error Code | HTTP | Artboard |
|---|---|---|
| `HOST_UNAUTHORIZED` | 401 | `host-access-states` |
| `HOST_FORBIDDEN` | 403 | `host-access-states` |
| `HOST_VEHICLE_NOT_FOUND` | 404 | `host-access-states` (+ anti-enumeration note) |
| `HOST_MUTATION_NOT_SUPPORTED` | 405 | `host-access-states` (documented as unreachable-by-design — no write affordance exists to trigger it) |

## 8. Open questions carried forward (not resolved by this canvas)

- Exact query parameter names/shape for vehicle-status and trip date-range
  filtering — owned by `SR-HOST-BE-001` (see §4).
- Whether the owned-vehicle list needs a dedicated search box beyond the
  shared `Topbar` `SearchBox` — not requested by `SR-HOST-FE-001.md`, so not
  added speculatively.
- Whether a vehicle can have more than one concurrent `contractPeriod` (e.g.
  mid-contract fleet transfer) — the contract's `HostVehicleContractPeriod` is
  singular (`| null`), so this canvas renders exactly one, matching the type.
