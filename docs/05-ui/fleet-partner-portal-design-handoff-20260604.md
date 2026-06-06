# Fleet Partner Portal — Design Handoff

**Date:** 2026-06-05  
**Target surface:** new Fleet Partner Portal app  
**Recipient team:** 視覺設計團隊 / UX  
**Status:** handoff input only. **No UI code. No visual decisions.**

---

## 0. Why this document exists

This app is a **brand-new surface with no design canvas**. By project rule (`feedback_no_llm_ui_design`, `feedback_must_check_design_canvas`), this document is limited to:

- business flow authority
- screen-level functional requirements
- contract mapping to currently defined `/api/fleet-partner/*` endpoints
- explicit backend / contract gaps that must not be papered over by UI invention

This document does **not** define layout, spacing, colors, typography, component composition, motion, or route chrome.

---

## 1. Canonical sources

Primary sources used for this handoff:

| Source                                                                    | Authority used here                                      |
| ------------------------------------------------------------------------- | -------------------------------------------------------- |
| `docs/02-architecture/phase1_final_sa_for_dev_team_20260604.md` §4.6      | Fleet Partner business flow                              |
| `docs/02-architecture/phase1_final_sa_for_dev_team_20260604.md` §5.4      | Required Fleet Partner capability gaps                   |
| `docs/02-architecture/phase1_final_sa_for_dev_team_20260604.md` §7.5      | 9 P0 Fleet Partner Portal pages                          |
| `docs/02-architecture/phase1_final_sd_for_dev_team_20260604.md` §6.1–§6.3 | Fleet partner models, portal APIs, statement calculation |
| `docs/02-architecture/phase1_final_sd_for_dev_team_20260604.md` §9        | `WF-FLEET-001` / `E2E-014` workflow gate                 |
| `docs/02-architecture/phase1_final_sd_for_dev_team_20260604.md` §11       | Phase-1 acceptance expectations                          |

When this handoff and the canonical SA/SD disagree, SA/SD wins.

---

## 2. Product intent

Fleet Partner Portal exists for the actor described in SA as:

> 車行/車隊：招募司機、管理車輛、分潤、品質責任、對帳。

The portal therefore has to support one coherent business loop:

```text
fleet partner recruits driver
→ platform reviews driver and vehicle
→ driver affiliated with fleet partner
→ driver completes trips
→ system computes driver earning
→ system computes fleet partner revenue share / management fee / bonus / penalty
→ fleet partner statement
→ platform payout
→ quality metrics and responsibility tracking
```

This flow is the behavioral center of the app. The 9 P0 pages below are different cuts of the same loop, not unrelated utilities.

---

## 3. App-level requirements

These are product requirements for the design team. They are **not** visual prescriptions.

### 3.1 Scope

- Read-heavy partner operating surface for a single fleet partner realm.
- Primary jobs: monitor drivers / vehicles / trips / statements / quality responsibility.
- No requirement in current SD for portal-side write mutations. This handoff assumes **read-first** behavior unless later contracts add controlled actions.

### 3.2 Data truth

- Portal data must be scoped to the logged-in fleet partner.
- Financial totals must come from the same settlement path as SD §6.3 statement calculation.
- Driver / vehicle / trip / complaint attribution must use fleet affiliation as the ownership seam.

### 3.3 Design constraints

- Do not invent UI from other apps' canvases.
- Do not infer missing backend contracts as if they already exist.
- Where a page has no explicit portal endpoint today, the visual team may define information architecture and states, but must keep those areas marked as contract-dependent.

---

## 4. P0 page inventory

SA §7.5 defines these 9 P0 pages:

1. Dashboard
2. Drivers
3. Vehicles
4. Trips
5. Revenue Share / Statements
6. Documents
7. Training
8. Incidents / Complaints
9. Quality Metrics

---

## 5. Screen requirements

Each page below defines required user questions, minimum data blocks, and current contract status.

### 5.1 Dashboard

**Primary questions**

- How is this fleet performing today / this week / this month?
- Which drivers, vehicles, trips, statement totals, and quality issues need attention now?
- Is payout / statement generation on track?

**Required content blocks**

- high-level KPI summary for active drivers, active vehicles, completed trips, current-period gross, current-period fleet share, open incidents / complaints, quality-risk count
- recent statement snapshot: current open period, last generated statement, payout status
- operational watchlist: drivers with expiring affiliation, vehicles with compliance risk, unresolved responsibility items
- trend summary that links to Trips, Statements, and Quality Metrics

**Contract mapping**

- primary: `GET /api/fleet-partner/dashboard`
- supporting summary allowed from: `GET /api/fleet-partner/quality-metrics`

**Notes**

- Dashboard should behave as the cross-page summary of Flow F, not a marketing home.

### 5.2 Drivers

**Primary questions**

- Which drivers currently belong to this fleet partner?
- What is each driver's affiliation type, operating status, and earning contribution?
- Which drivers have quality or compliance issues affecting the partner?

**Required content blocks**

- affiliated driver list
- driver identity summary and affiliation metadata
- affiliation type: `recruited_by` / `managed_by` / `vehicle_owned_by` / `contracted_under`
- effective period: `effectiveFrom`, `effectiveUntil`
- roll-up indicators for trip volume, earnings contribution, revenue-share contribution, quality flags
- driver detail view requirements:
  driver profile summary, affiliated vehicles, recent trips, active statement period contribution, open incident / complaint links

**Contract mapping**

- primary: `GET /api/fleet-partner/drivers`

**Notes**

- SD defines `DriverFleetAffiliationRecord`; this page should treat that as the ownership spine.

### 5.3 Vehicles

**Primary questions**

- Which vehicles are operated under this fleet partner?
- Are they eligible for the service products they are currently serving?
- Which vehicles are causing quality, complaint, or compliance risk?

**Required content blocks**

- partner vehicle registry
- per-vehicle operating state and assigned / recent driver
- service eligibility summary aligned with service-product logic
- utilization and trip contribution
- compliance / document status summary
- quality / complaint risk markers

**Contract mapping**

- primary: `GET /api/fleet-partner/vehicles`

**Contract gap**

- SA §5.4 explicitly requires **vehicle affiliation**, but SD §6.1 only defines `DriverFleetAffiliationRecord`; no vehicle-affiliation model is specified yet.
- Design may proceed with a vehicle-management page, but backend must still define the exact ownership record and field shape before implementation.

### 5.4 Trips

**Primary questions**

- Which trips were attributed to this fleet partner?
- How do trips break down by driver, vehicle, service product, tenant program, and source platform?
- Which trips affected revenue share, bonus, penalty, or responsibility tracking?

**Required content blocks**

- trip list scoped to partner-attributed trips
- filters for date range, driver, vehicle, service product, source platform, statement period, responsibility / quality state
- trip-level attribution summary:
  driver, vehicle, service product, source platform, tenant / program, gross amount, earning amount, fleet-share outcome
- detail requirements:
  proof / completion state, statement inclusion state, linked incident / complaint / penalty if applicable

**Contract mapping**

- primary: `GET /api/fleet-partner/trips`

### 5.5 Revenue Share / Statements

**Primary questions**

- How was this partner's share calculated?
- Which rules were applied to which trips?
- What has been generated, paid out, held, or disputed?

**Required content blocks**

- statement list by period
- statement detail with summary totals and line-item drilldown
- rule-attribution transparency:
  which revenue-share rule or formula produced the amount
- status tracking:
  draft / generated / payout in progress / paid / hold / adjustment required
- groupings useful to business review:
  by driver, by vehicle, by service product, by tenant program, by source platform

**Contract mapping**

- primary: `GET /api/fleet-partner/statements`

**Notes**

- Must reflect SD §6.3 settlement sequence:
  completed trip → driver earning calculated → affiliation resolved → rule matched → fleet partner line item generated → statement generated monthly → payout status tracked.

### 5.6 Documents

**Primary questions**

- Which fleet / driver / vehicle documents are required, expiring, missing, or rejected?
- Which missing documents currently affect vehicle operability, affiliation validity, or payout readiness?

**Required content blocks**

- document checklist by scope:
  fleet-level, driver-level, vehicle-level
- expiry / pending-review / rejected / approved status
- linkages to affected driver / vehicle / payout readiness
- evidence / audit visibility requirements for later backend design

**Current contract status**

- no dedicated `/api/fleet-partner/documents` endpoint is defined in SD §6.2

**Contract gap**

- This page is P0 in SA, but the portal API set does not yet include document retrieval.
- The visual team should design for required states and dependencies, but implementation needs a backend follow-up contract.

### 5.7 Training

**Primary questions**

- Which partner, dispatcher, fleet manager, or driver training items are mandatory?
- Who has completed, expired, or failed required training?
- Which training gaps block quality compliance or payout readiness?

**Required content blocks**

- training modules / policy items
- completion status by person / role / expiry date
- blocked / warning indicators tied to operational readiness
- linkages to quality and responsibility tracking

**Current contract status**

- no dedicated `/api/fleet-partner/training` endpoint is defined in SD §6.2

**Contract gap**

- This page exists in SA §7.5 but has no explicit portal contract yet.

### 5.8 Incidents / Complaints

**Primary questions**

- Which incidents or complaints are associated with this fleet partner's drivers / vehicles / trips?
- What responsibility, penalty, clawback, or service-recovery impact did each case create?
- Which cases remain open and require partner follow-up?

**Required content blocks**

- combined case registry or clearly separated incident / complaint views
- attribution seam:
  driver, vehicle, trip, fleet partner, tenant, service product, source platform
- responsibility outcome
- financial impact summary:
  penalty / clawback / adjustment / dispute status
- lifecycle markers:
  open, investigating, partner follow-up required, resolved, closed

**Current contract status**

- no dedicated `/api/fleet-partner/incidents` or `/api/fleet-partner/complaints` endpoint is defined in SD §6.2

**Contract gap**

- SD §7.3 requires incident / complaint attribution to expose financial responsibility, but that contract currently exists on the ops/admin side, not yet on portal-specific endpoints.

### 5.9 Quality Metrics

**Primary questions**

- Is this fleet partner meeting platform quality expectations?
- Which metrics are hurting payout, partner standing, or operational trust?
- Are issues concentrated by driver, vehicle, service product, or source platform?

**Required content blocks**

- KPI scorecards and trends
- quality dimensions expected from SA / Flow F:
  fulfillment reliability, cancellation / no-show patterns, complaint rate, incident rate, proof / documentation completeness, partner-responsibility cases
- drilldown by driver / vehicle / service product / source platform / period
- explicit tie-back to responsibility tracking and operational remediation

**Contract mapping**

- primary: `GET /api/fleet-partner/quality-metrics`

---

## 6. Domain and data objects that the design must respect

Current canonical models from SD §6.1:

- `FleetPartnerRecord`
- `DriverFleetAffiliationRecord`
- `FleetPartnerRevenueShareRuleRecord`

Important implementation implications for design:

- Driver ownership is explicit in current SD.
- Revenue-share rule explainability is required because formulas vary:
  `percent_of_gross`, `fixed_per_trip`, `monthly_fixed`, `tiered_bonus`.
- Partner business context varies by `partnershipType`:
  `driver_recruitment`, `fleet_management`, `vehicle_owner_group`, `business_dispatch_fleet`.
- Screen copy, grouping, and empty states should leave room for different partner business types.

Important gaps to keep visible:

- No canonical vehicle-affiliation record is defined yet.
- No portal-side contract is defined yet for Documents, Training, or Incidents / Complaints.

---

## 7. Portal API matrix

Current SD-defined Fleet Partner Portal endpoints:

| Endpoint                                 | Pages that depend on it    | Purpose in this handoff                                             |
| ---------------------------------------- | -------------------------- | ------------------------------------------------------------------- |
| `GET /api/fleet-partner/dashboard`       | Dashboard                  | top-level partner operations and finance summary                    |
| `GET /api/fleet-partner/drivers`         | Drivers                    | affiliated driver registry and driver performance / quality rollups |
| `GET /api/fleet-partner/vehicles`        | Vehicles                   | partner vehicle registry, eligibility, utilization, compliance view |
| `GET /api/fleet-partner/trips`           | Trips                      | attributed trip ledger and drilldown                                |
| `GET /api/fleet-partner/statements`      | Revenue Share / Statements | period statements, payout status, line-item review                  |
| `GET /api/fleet-partner/quality-metrics` | Dashboard, Quality Metrics | quality KPI and responsibility-tracking view                        |

Pages currently **without** explicit portal endpoint in SD:

- Documents
- Training
- Incidents / Complaints

These are not optional pages; they are SA-defined P0 pages with unresolved contract follow-up.

---

## 8. Screen-state expectations for the design team

Every page design should leave room for these state families:

- loading
- empty but healthy
- filtered empty
- partial data / degraded dependency
- contract-not-ready placeholder for pages whose endpoint is not yet defined
- permission-scoped read-only detail

For financial and quality pages, design should also support:

- current period vs historical period switching
- summary-to-detail drilldown
- export-ready / audit-ready indicators

---

## 9. Open questions and required follow-ups

These are not visual questions; they are implementation / contract gaps surfaced by the canonical docs.

1. **Vehicle affiliation gap:** SA requires vehicle affiliation, but SD defines only driver affiliation. Backend must define the ownership model that powers the Vehicles page.
2. **Missing portal contracts:** Documents, Training, and Incidents / Complaints are P0 pages but have no portal endpoints in SD §6.2.
3. **Statement detail shape:** SD defines statement calculation flow, but not the exact partner-facing statement detail payload shape needed for line-item explainability.
4. **Responsibility vocabulary:** SA / SD require responsibility tracking, penalty, and clawback visibility, but the exact enum / status taxonomy for partner-facing presentation is not yet specified here.
5. **Portal write authority:** Current docs define read endpoints only. If product later expects acknowledge / dispute / upload / remediation actions, those require a separate contract pass and must not be improvised in design or frontend.

---

## 10. Handoff summary

This portal should be designed as the fleet partner's operating and settlement surface for Flow F:

- recruit / affiliate drivers
- manage vehicles
- review attributed trips
- understand revenue-share calculations and statements
- track quality and responsibility outcomes

The visual design team may now proceed on page structure and experience flows for the 9 P0 pages, but must keep the documented contract gaps visible rather than silently resolving them in UI.
