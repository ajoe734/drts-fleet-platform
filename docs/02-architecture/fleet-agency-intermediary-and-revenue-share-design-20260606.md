# Fleet Agency Intermediary And Revenue Share Design

Task ref: `FA-SA-001`
Status: proposed (routes to `discussion_planning`)
Date: 2026-06-06
Owner: Claude (drafted for chair review)
Scope: Introduce a supply-side **fleet agency (車行)** intermediary so external
car companies can recruit drivers into the platform fleet, carry partial
management responsibility, and earn a revenue share — without breaking the
existing demand-side tenant/partner model.

## 1. Why this document exists

A product review surfaced three questions about the current system. Two are
partially built; one is a genuine model-level gap that cannot be closed with a
code patch and therefore routes back into `discussion_planning` per the repo
operating rule (README: "if implementation discovers unresolved design
semantics, the supervisor routes back into discussion_planning").

| #   | Question                                                                                                                                                                    | Verdict                       | Where it lands                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------- |
| Q1  | Tenants (bank/insurer/enterprise) need a self-service back office: total owed to the fleet, dispatch outcomes, per-user attribution                                         | **Mostly built**              | §7.1 — fill presentation gap only |
| Q2  | Realtime taxi vs reservation business-dispatch are different behaviours with different plate/licence classes; vehicles must be restricted to the work they are licensed for | **Half built**                | §7.2 — add regulatory plate class |
| Q3  | Fleet agencies (車行) recruit drivers for us, so they must earn a share and carry management load to offload the platform                                                   | **Not built — this document** | §3–§6                             |

This document is primarily the Q3 design. Q1 and Q2 are recorded as related
follow-ups in §7 so the dependency is not lost.

## 2. Current baseline (confirmed in code)

The platform today is a **single-operator** model. Evidence:

- Order ownership has exactly two domains, `OrderDomain = "owned" | "forwarded"`
  (`apps/api/src/modules/foundation/foundation.constants.ts`). `owned` is
  fulfilled by the platform's own fleet; `forwarded` is **demand ingested from
  external aggregators** (Grab Taiwan webhook, generic inbound) and fulfilled by
  the same own fleet, then status-synced back and reconciled
  (`apps/api/src/modules/forwarder/forwarder.controller.ts`).
- Vehicles and drivers are **platform-global supply** with no owning
  intermediary. `VehicleRegistryRecord` and `DriverRegistryRecord`
  (`packages/contracts/src/index.ts`) carry no `agencyId`, `fleetId`, or
  `operatorId`.
- The word "operator" in the codebase means an **internal ops actor**
  (`dispatcher`, `ops_supervisor`, `dispatch_manager`, `platform_admin`), per
  `docs/02-architecture/phase1-operator-ownership-escalation-matrix-20260501.md`
  and the `operatorId` fields on override/exception commands. It is **not** a
  car company.
- Driver settlement is strictly two-party (platform ↔ driver):
  `DriverFeePlanRecord { serviceFeeBps, reimbursementMode }` and
  `DriverStatementLineRecord { grossEarning, serviceFee, subsidy, netAmount }`.
  There is no third party in the payout split.

Conclusion: there is no supply-side intermediary entity anywhere in the domain.
Q3 asks us to add one.

## 3. Problem statement

The platform wants to scale driver supply by delegating recruitment and a
portion of day-to-day driver management to external car companies (車行). In
return the car company expects:

1. A **revenue share** on the trips its recruited drivers complete.
2. The ability to **carry management responsibility** for its own drivers
   (onboarding paperwork, work-state hygiene, first-line conduct handling) so
   the platform's central regulatory-registry team is not the sole owner.
3. A **back office** of its own to see its drivers, their trips, and its payout.

None of this exists today. Adding it changes the supply side of the domain from
"one fleet" to "one platform fleet composed of many agency-affiliated cohorts
plus a platform-direct cohort".

## 4. Core model decision

Introduce one new aggregate root, **`FleetAgency`**, on the **supply side**, and
make driver/vehicle affiliation to an agency optional.

Critical boundary rule (must not be blurred):

> **Tenant / Partner = demand side** (who brings the order and who pays).
> **Fleet Agency = supply side** (who provides and partly manages the driver).
> A single legal company could in principle be both, but they are modelled as
> two distinct records with two distinct portals and two distinct settlement
> directions. Demand-side money flows _in_; supply-side money flows _out_.

### 4.1 Affiliation, not ownership

Drivers and vehicles remain registered in `regulatory-registry` and remain part
of the **single platform fleet** for dispatch purposes. Affiliation only adds:

- attribution (which agency recruited / sponsors this driver),
- a management-delegation scope (what the agency may do to its own drivers),
- a settlement key (who gets the agency share).

Dispatch eligibility (`getEligibleCandidates`) is **unchanged** — the platform
still dispatches from the whole compatible pool. Agency affiliation must never
become a dispatch silo unless a later, explicit policy says so.

### 4.2 The platform-direct cohort is a "house agency"

To keep settlement uniform and migration trivial, every existing
platform-direct driver is treated as belonging to a reserved system agency
(e.g. `agency:house`) whose share is 0. No existing statement math changes for
these drivers.

## 5. Data model changes (proposed contracts)

All additive. New types in `packages/contracts/src/index.ts`; new tables via an
`infra/migrations` version.

```ts
// New supply-side aggregate
export interface FleetAgencyRecord {
  agencyId: string;
  legalName: string;
  displayName: string;
  status: "draft" | "active" | "suspended" | "terminated";
  contact: { name: string; phone: string; email: string };
  // settlement identity (bank account etc.) lives in a sibling finance record
  managedDriverCount: number;
  createdAt: string;
  updatedAt: string;
}

// Affiliation added to the driver master (nullable -> house agency)
// DriverRegistryRecord gains:
//   agencyId: string | null;            // null === platform-direct (house)
//   agencyAffiliationStatus: "pending" | "active" | "released";

// Three-party fee plan: extend, do not replace, DriverFeePlanRecord
export interface AgencyRevenueShareTermRecord {
  agencyId: string;
  // share of NET driver-attributable margin taken by the agency, in bps
  agencyShareBps: number;
  // what the share is computed on: platform service fee, or gross, or a fixed
  basis: "platform_service_fee" | "trip_gross" | "fixed_per_trip";
  effectiveFrom: string;
  effectiveTo: string | null;
}

// Statement line gains an agency split (additive, optional)
// DriverStatementLineRecord gains:
//   agencyId?: string;
//   agencyShare?: MoneyAmount;          // carved from platform serviceFee, NOT driver net
```

Key invariant for the split: **the agency share is carved out of the
platform's `serviceFee`, never out of the driver's `netAmount`.** Recruiting a
driver through an agency must not silently reduce that driver's take-home.
(If the business later wants a driver-funded share, that is a separate, explicit
decision with its own consent flow.)

## 6. New surfaces and roles

### 6.1 Fleet Agency Portal (new app or new role-scoped surface)

A supply-side back office, parallel in spirit to `tenant-console-web` but on the
other side of the ledger:

- My drivers (affiliated cohort) + their work-state / compliance status.
- My trips: completed dispatch outcomes for my drivers.
- My settlement: agency statements, share earned, payout status.
- Delegated actions: submit driver onboarding, flag work-state issues
  (subject to platform approval gates — agencies never self-approve governance
  bypasses, consistent with the existing hard rule for non-internal callers).

Open question (§8): standalone app vs a role inside `platform-admin-web`.

### 6.2 RBAC

New actor type `fleet_agency_user`, scoped strictly to its own `agencyId`. It
inherits the existing hard rule: partner/tenant/agency callers never
self-approve governance bypasses; management delegation is allow-listed and
platform-reviewable.

### 6.3 Platform Admin additions

`platform-admin-web` gains agency lifecycle management (create / activate /
suspend / terminate, set revenue-share terms, approve delegated driver actions)
— mirroring how it already manages partner entries.

## 7. Related follow-ups (Q1, Q2) — recorded so they are not lost

### 7.1 Q1 — tenant spend & outcome dashboard (mostly built)

The data and endpoints already exist: `GET tenant/billing/profile`,
`tenant/invoices`, `tenant/bookings` (with status), `tenant/reports/jobs`,
plus `cost-centers` for per-department attribution
(`apps/api/src/modules/billing-settlement`, `reporting-filing`;
`apps/tenant-console-web/app/{billing,invoices,bookings,reports,cost-centers}`).

Gap is presentation only: there is no single aggregated "this period: total
owed + dispatch completion rate + top users" view, and per-passenger spend must
be reconstructed from cost-centers plus report jobs. Proposed: a tenant
overview dashboard composing existing endpoints. No backend model change.

### 7.2 Q2 — regulatory plate class (half built)

Built: business classification `Phase1ServiceBucket = standard_taxi |
business_dispatch`; realtime-vs-reservation via channel→semantics map; and
dispatch already filters supply by capability —
`vehicle.supportedServiceBuckets.includes(serviceBucket)` and the same for the
driver in `getEligibleCandidates`
(`apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts`).

Gap: there is **no regulatory plate/licence-class dimension**. A vehicle only
has `plateNo` (a string), `supportedServiceBuckets` (a logical capability tag),
`insuranceStatus`, and `licensesValid` (boolean). Nothing binds "this is a
rental/hire plate" to "may only run business_dispatch". `supportedServiceBuckets`
is set by hand and not derived from or validated against a licence class.
Proposed: add `plateClass` to `VehicleRegistryRecord` and derive/validate
`supportedServiceBuckets` from it, so an operator cannot mis-tag a taxi-plate car
as eligible for business dispatch (or vice versa). This is independent of Q3 and
can ship first.

## 8. Open questions for discussion_planning

1. **Standalone Fleet Agency Portal app vs a role-scoped surface** inside
   platform-admin. (Recruitment-heavy agencies may want their own branded app.)
2. **Share basis**: % of platform service fee vs % of gross vs fixed-per-trip —
   or configurable per agency. §5 proposes configurable; pick a default.
3. **Management delegation depth**: read-only attribution only, vs real
   work-state / onboarding actions with platform approval. §6 proposes the
   latter, gated.
4. **Dispatch neutrality**: confirm affiliation never silos dispatch in Phase 1
   (§4.1). If agency-preferred dispatch is ever wanted, it is a separate policy.
5. **Vehicle vs driver affiliation**: does an agency bring drivers, vehicles, or
   both? (Affects whether `agencyId` also lands on `VehicleRegistryRecord`.)
6. **Legal-entity overlap**: how to handle a company that is both a demand
   tenant and a supply agency (two records, netting at finance layer?).

## 9. Migration & backward compatibility

- All schema additions are nullable/optional; existing two-party settlement is
  unchanged for `agencyId === null` (house) drivers.
- A single migration introduces `fleet_agency`, the affiliation columns, and the
  agency-share term/line columns. Existing rows backfill to the house agency
  with 0 share.
- No change to dispatch, owned-mobility order flow, forwarder, or tenant/partner
  demand paths.

## 10. Phasing proposal

1. **Phase A (independent, ship first):** Q2 plate class + Q1 tenant overview
   dashboard. Neither needs the agency model.
2. **Phase B:** `FleetAgency` aggregate + driver affiliation + platform-admin
   lifecycle management (attribution only, share = 0, read-only agency view).
3. **Phase C:** three-party settlement (agency share carved from service fee) +
   agency statements + payout.
4. **Phase D:** delegated management actions with platform approval gates +
   `fleet_agency_user` RBAC + decision on standalone portal.

## 11. Recommendation

Adopt §4's affiliation-not-ownership model with the demand/supply boundary in
§4 as a hard rule, keep dispatch neutral (§4.1), carve the agency share from the
platform service fee rather than driver net (§5), and sequence per §10 so Q1/Q2
value lands without waiting on the agency model. Route §8 open questions to
`discussion_planning` before Phase B implementation begins.
