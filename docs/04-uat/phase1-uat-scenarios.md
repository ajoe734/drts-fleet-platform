# Phase 1 UAT Scenario Pack

**Status:** Baseline scenario inventory — final evidence and sign-off interpretation now lives in `support/sidecars/FBP-013C/FBP-013C-UAT-EVIDENCE-PACK.md` and `support/sidecars/FBP-013D/FBP-013D-FINAL-EVIDENCE-CLOSEOUT.md`
**Owner:** Claude (WE-005 baseline)
**Task:** WE-005 baseline; consumed by `FBP-013C` and `FBP-013D` for final closeout
**Created:** 2026-04-14  
**Depends on:** WE-001 (CI), WE-004 (Smoke harness evidence)

---

## Overview

This document is the Phase 1 UAT scenario pack for the DRTS Fleet Platform. It covers all
four front-end surfaces:

| Surface            | App                                  | Audiences                                        |
| ------------------ | ------------------------------------ | ------------------------------------------------ |
| **Tenant Portal**  | `tenant-commute-hub` (external repo) | Tenant admin, tenant booking manager             |
| **Platform Admin** | `@drts/platform-admin-web`           | PlatformCo admin, compliance, finance            |
| **Ops Console**    | `@drts/ops-console-web`              | Dispatcher, operations manager, customer service |
| **Driver App**     | `@drts/driver-app`                   | Driver                                           |

> **Note (FBP-007):** The legacy `@drts/tenant-portal-web` app has been retired as a production target. All UAT scenarios in §1 (Tenant Portal) are now validated against `tenant-commute-hub`. The `apps/tenant-portal-web` source and its staging YAML are frozen-reference artifacts; they must not be deployed.

This file stays as the canonical scenario inventory. It is not the live sign-off dashboard:
for current coverage math, deferred-item triage, and gate decisions, use the finalized
`FBP-013C` evidence pack and the `FBP-013D` synthesis packet.

### Workflow family map

This scenario inventory feeds the workflow-family release matrix at
`docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`.

| Workflow family | Scenario clusters in this file                                      | Companion automated path                                                           |
| --------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `WF-TEN-001`    | tenant bootstrap / tenant-boundary rows plus `E2E-004`              | `tests/e2e/E2E-004-tenant-attribution.sh`                                          |
| `WF-ORD-001`    | tenant booking flows plus `E2E-001` / `E2E-004`                     | `tests/smoke/02-booking-create.sh`, `tests/e2e/E2E-001-enterprise-dispatch.sh`     |
| `WF-DSP-001`    | dispatch queue / assign / reassign rows plus `E2E-001`              | `tests/smoke/03-dispatch-assign.sh`, `tests/e2e/E2E-001-enterprise-dispatch.sh`    |
| `WF-DRV-001`    | driver task, auth, and platform-presence rows plus `E2E-001`        | `tests/smoke/04-driver-task-accept.sh`, `tests/e2e/E2E-001-enterprise-dispatch.sh` |
| `WF-FWD-001`    | forwarded-order mirror row `E2E-002` and route-locked driver rows   | `tests/e2e/E2E-002-forwarded-order.sh`                                             |
| `WF-COM-001`    | phone-order / proof / recording / filing rows plus manual `E2E-003` | manual-only in baseline; negative/live expansion tracked separately                |
| `WF-FIN-001`    | invoice, report, and sensitive-download rows plus `E2E-001`         | `tests/smoke/05-billing-invoice.sh`, `tests/smoke/06-report-export.sh`             |

### Scope boundary

- Phase 1 only: `standard_taxi` and `business_dispatch` (subtypes: `enterprise_dispatch`,
  `credit_card_airport_transfer`).
- `forwarded` order lifecycle is covered at the driver-side visibility layer only; authoritative
  lifecycle remains at the external platform.
- `av_pilot` is reserved and not activated — no UAT required.

### Cross-cutting pass/fail criteria (apply to every scenario)

1. **No unhandled exceptions** in browser console or server logs during the flow.
2. **Audit trail written** for every action that modifies state (booking, assignment, billing,
   auth, config, RBAC).
3. **API responses** use the standard envelope (`{ data, meta }` on success; `{ error }` on
   failure).
4. **RBAC guard** — each scenario notes the minimum role required; lower-privileged users
   must receive `403 Forbidden`.
5. **Type safety** — `@drts/contracts` types used end-to-end; no `any` type escape hatches
   in production paths.

---

## 1. Tenant Portal UAT

### 1.1 Booking Wizard

#### TP-001 — Enterprise dispatch booking, happy path

**Pre-conditions**

- Authenticated as `tenant_booking_manager`
- Tenant contract allows `enterprise_dispatch`
- At least one passenger in address book

**Steps**

1. Navigate to Bookings → New Booking
2. Select service type **Enterprise Dispatch**
3. Fill in passenger, pickup address, dropoff address, reservation window
4. Submit

**Expected**

- Order created with `service_bucket="business_dispatch"`,
  `business_dispatch_subtype="enterprise_dispatch"`,
  `dispatch_semantics="reservation"`
- UI redirects to booking confirmation page showing the new booking ID
- Booking appears in booking list with status `pending` or `confirmed`
- Audit log entry recorded for booking creation

**Cross-ref:** SC-008

---

#### TP-002 — Booking wizard — address unresolvable

**Pre-conditions**

- Authenticated as `tenant_booking_manager`

**Steps**

1. Navigate to New Booking
2. Enter a pickup address that cannot be geocoded (e.g. nonsense string)
3. Submit

**Expected**

- System returns validation error: `ADDRESS_UNRESOLVABLE`
- No order is persisted
- Form stays open with inline error message near the address field

**Cross-ref:** SC-002

---

#### TP-003 — Airport transfer booking, happy path

**Pre-conditions**

- Tenant contract allows `credit_card_airport_transfer`
- Partner authenticated via API or tenant admin session

**Steps**

1. Navigate to New Booking → Airport Transfer
2. Fill passenger, benefit reference, airport direction = `dropoff`, terminal
3. Submit

**Expected**

- Order created with `business_dispatch_subtype="credit_card_airport_transfer"`
- Reservation scheduler creates hold request
- Proof requirements loaded from contract rules

**Cross-ref:** SC-009

---

#### TP-004 — Airport pickup missing flight number

**Steps**

1. New Booking → Airport Transfer → direction = `pickup`
2. Leave flight number blank
3. Submit

**Expected**

- Error returned: `FLIGHT_NO_REQUIRED`
- No order created

**Cross-ref:** SC-010

---

#### TP-005 — Modify booking before deadline

**Pre-conditions**

- An `enterprise_dispatch` booking exists with `modifiable_until` in the future

**Steps**

1. Open booking detail
2. Change pickup time to a valid future time
3. Submit update

**Expected**

- Booking updated; new pickup time saved
- Audit entry written for modification

---

#### TP-006 — Modify booking after modifiable_until (rejected)

**Pre-conditions**

- An `enterprise_dispatch` booking exists with `modifiable_until` already past

**Steps**

1. Open booking detail
2. Attempt to change pickup time

**Expected**

- Error returned: `ORDER_NOT_MODIFIABLE`
- Booking unchanged
- Attempted action audited

**Cross-ref:** SC-011

---

### 1.2 Booking List & Detail

#### TP-007 — Booking list, filter by status

**Steps**

1. Navigate to Booking List
2. Apply status filter: `confirmed`

**Expected**

- Only bookings with status `confirmed` shown
- Pagination and count update correctly

---

#### TP-008 — Cancel a booking

**Pre-conditions**

- A cancellable booking exists

**Steps**

1. Open booking detail
2. Click Cancel
3. Confirm cancellation

**Expected**

- Booking status changes to `cancelled`
- Audit entry written
- Booking no longer appears in `active` filter

---

### 1.3 Passengers & Address Book

#### TP-009 — Create passenger

**Steps**

1. Navigate to Passengers → Add
2. Fill name, mobile, optional email
3. Submit

**Expected**

- Passenger appears in list with correct data
- Available in booking wizard passenger picker

---

#### TP-010 — Update passenger name

**Steps**

1. Open passenger detail
2. Change name
3. Save

**Expected**

- Updated name reflected immediately

---

#### TP-011 — Delete passenger

**Steps**

1. Open passenger detail
2. Delete

**Expected**

- Passenger removed from list
- Cannot be selected in booking wizard

---

#### TP-012 — Create address entry

**Steps**

1. Navigate to Addresses → Add
2. Fill label, address string
3. Submit

**Expected**

- Address saved and accessible in booking wizard address picker

---

### 1.4 Reports

#### TP-013 — Trigger report export

**Pre-conditions**

- Authenticated as `tenant_admin` or role with report access

**Steps**

1. Navigate to Reports
2. Select date range and report type
3. Click Export / Generate

**Expected**

- Export job created; status shown as `pending` then `ready`
- Download link appears once job is complete
- Clicking download link initiates file download

---

#### TP-014 — Download existing report artifact

**Steps**

1. Navigate to Reports, find a completed report
2. Click Download

**Expected**

- File downloads successfully
- Download event audited (per SC-040)

---

### 1.5 API Keys & Webhooks

#### TP-015 — Issue API key (shown once)

**Steps**

1. Navigate to API Keys → Create New
2. Enter label, submit

**Expected**

- Full plaintext key displayed **once** on the confirmation screen
- Subsequent views of that key show only the masked suffix
- API key appears in list with masked display

**Cross-ref:** SC-038

---

#### TP-016 — Rotate API key

**Steps**

1. Navigate to API Keys, select an existing key
2. Click Rotate

**Expected**

- New key value displayed once
- Old key invalidated
- Audit entry written

---

#### TP-017 — Revoke API key

**Steps**

1. Select an API key
2. Click Revoke

**Expected**

- Key status changes to revoked
- Revoked key cannot authenticate

---

#### TP-018 — Create webhook endpoint

**Steps**

1. Navigate to Webhooks → Add Endpoint
2. Enter URL, select event types
3. Submit

**Expected**

- Endpoint saved and listed
- No secret shown at creation time (secret management via rotate)

---

#### TP-019 — Webhook secret rotation changes signing key

**Steps**

1. Open webhook endpoint
2. Click Rotate Secret

**Expected**

- New deliveries signed with new secret
- Prior delivery logs retain historical metadata link
- Audit entry written

**Cross-ref:** SC-039

---

#### TP-020 — View webhook delivery log

**Steps**

1. Open webhook endpoint
2. View delivery log

**Expected**

- List of past delivery attempts with HTTP status, timestamp, payload preview
- Failed attempts clearly marked

---

### 1.6 Billing & Invoicing

#### TP-021 — View billing profile

**Steps**

1. Navigate to Billing

**Expected**

- Current billing profile displayed: cycle, currency, payment method

---

#### TP-022 — View invoice list

**Steps**

1. Navigate to Billing → Invoices

**Expected**

- List of invoices with period, amount (gross/currency), status

---

#### TP-023 — Download invoice PDF

**Steps**

1. Click download on a completed invoice

**Expected**

- PDF downloads successfully
- `target="_blank"` with `rel="noopener noreferrer"` on download link
- Amount displayed as `amountMinor / 100` with currency prefix

**Cross-ref:** SC-030

---

### 1.7 Notifications & SLA

#### TP-024 — Update notification preferences

**Steps**

1. Navigate to Notifications
2. Toggle some preferences (e.g. enable booking confirmations, disable SLA alerts)
3. Save

**Expected**

- Updated preferences persisted
- Page reloads (or revalidates) showing new state

---

#### TP-025 — View and update SLA profile

**Steps**

1. Navigate to SLA
2. Change a threshold value (e.g. response time target)
3. Save

**Expected**

- Updated SLA profile saved
- Values match `TenantSlaProfile` contract fields

---

### 1.8 Tenant Admin, Roles & Audit Trail

#### TP-026 — Invite tenant user

**Steps**

1. Navigate to Users → Invite
2. Enter email, assign role
3. Submit

**Expected**

- User invitation created; user appears in list with `invited` status

---

#### TP-027 — Change user role

**Steps**

1. Open user detail
2. Change role
3. Save

**Expected**

- Role updated; audit trail entry written for role change

---

#### TP-028 — View audit trail

**Steps**

1. Navigate to Audit Trail
2. Apply date/actor filter

**Expected**

- Events displayed with actor, timestamp, action, scope
- Tenant admin can only see events within their tenant scope

**Cross-ref:** SC-037

---

#### TP-029 — RBAC — tenant admin cannot access pricing engine

**Steps**

1. Attempt to navigate to platform-level pricing endpoint directly (e.g. via crafted URL)

**Expected**

- `403 Forbidden` returned
- Optionally audited

**Cross-ref:** SC-035

---

#### TP-030 — Tenant bootstrap rejects wrong tenant scope

**Pre-conditions**

- The email is invited under a different tenant than the one supplied to bootstrap

**Steps**

1. Call tenant bootstrap session with a valid invited email
2. Supply a mismatched `tenantId`

**Expected**

- Backend returns `TENANT_SCOPE_MISMATCH`
- No tenant bearer session is issued
- Request does not silently fall back to another tenant

---

#### TP-031 — Suspended tenant user cannot bootstrap

**Pre-conditions**

- Tenant user status is `suspended`

**Steps**

1. Submit tenant bootstrap session for the suspended email

**Expected**

- Backend returns `TENANT_USER_SUSPENDED`
- No tenant bearer session is issued
- Existing tenant scope is preserved for audit review

---

#### TP-032 — Inactive partner entry cannot bootstrap

**Pre-conditions**

- Partner entry status is `inactive`

**Steps**

1. Submit partner bootstrap session with the entry slug and a previously valid API key

**Expected**

- Backend returns `PARTNER_ENTRY_INACTIVE`
- No partner bearer session is issued
- Audit trail records `partner_ingress_rejected` with reason `entry_inactive`

---

## 2. Platform Admin UAT

### 2.1 Tenant Management

#### PA-001 — Create tenant

**Role:** `platform_admin`

**Steps**

1. Navigate to Tenants → New
2. Fill `name`, `code` (unique), quotas, enabled modules
3. Submit

**Expected**

- Tenant created; appears in list
- `tenant.code` is unique (duplicate submission returns error)
- Audit entry written

---

#### PA-002 — Edit tenant quotas and modules

**Steps**

1. Open tenant detail
2. Change quota values and toggle modules
3. Save

**Expected**

- Changes persisted; audit entry written

---

#### PA-003 — Deactivate tenant

**Steps**

1. Open tenant
2. Click Deactivate

**Expected**

- Tenant marked inactive
- Platform admin still sees tenant in list (with inactive badge)
- Audit entry written

---

### 2.2 Users & Roles

#### PA-004 — Create platform user and assign role

**Steps**

1. Navigate to Users → Create
2. Fill name, email, role
3. Submit

**Expected**

- User created; role assigned; appears in list

---

#### PA-005 — Roles page — confirm RBAC tiers displayed

**Steps**

1. Navigate to Feature Flags or Roles

**Expected**

- Role definitions with their scopes readable

---

### 2.3 Pricing & Split

#### PA-006 — View pricing template list

**Steps**

1. Navigate to Pricing

**Expected**

- Pricing template list displayed with version numbers and active flags

---

#### PA-007 — Platform-level pricing write is audited

**Steps**

1. Update a pricing template
2. Publish new version

**Expected**

- New version created; `public_info_version` audit entry with actor, old version, new version

**Cross-ref:** SC-037

---

### 2.4 Health & Alerts

#### PA-008 — Health dashboard shows workflow alerts and adapter status

**Steps**

1. Navigate to Health

**Expected**

- Workflow alert indicators visible
- Forwarder adapter status visible

---

### 2.5 Audit, Flags, Notices & Maintenance Mode

#### PA-009 — Platform-level audit trail

**Steps**

1. Navigate to Audit
2. Filter by actor or event type

**Expected**

- High-sensitivity events appear: pricing publishes, role changes, tenant module toggles
- Old and new values visible to authorized auditor role

**Cross-ref:** SC-037

---

#### PA-010 — Feature flags — toggle a flag

**Steps**

1. Navigate to Feature Flags
2. Toggle a flag
3. Save

**Expected**

- Flag state updated; effective immediately or after configured rollout
- Audit entry written

---

### 2.6 Payments

#### PA-011 — View payment records

**Steps**

1. Navigate to Payments

**Expected**

- Payment records list with amounts, status, reference IDs

---

---

## 3. Ops Console UAT

### 3.1 Dispatch Console

#### OC-001 — Dispatch queue visible with correct columns

**Steps**

1. Navigate to Dispatch
2. Observe active queue

**Expected**

- Orders shown with: order ID, service bucket, status, ETA, pickup/dropoff summary
- `exception_hold` orders clearly distinguished

---

#### OC-002 — Assign driver to ready-for-dispatch order

**Pre-conditions**

- An owned `standard_taxi` order in `ready_for_dispatch`
- At least one eligible driver available

**Steps**

1. Select an unassigned order in the queue
2. View candidate list
3. Click Assign on a candidate

**Expected**

- Order status changes to `assigned`
- Driver receives task-assigned notification
- Dispatch trace log entry appended

**Cross-ref:** SC-005

---

#### OC-003 — Reassign assigned order

**Pre-conditions**

- An order is in `assigned` state

**Steps**

1. Select the order
2. Click Reassign
3. Choose a different driver

**Expected**

- New assignment created
- Old assignment preserved in history
- Dispatch trace log updated

**Cross-ref:** SC-007

---

#### OC-004 — Release assignment

**Steps**

1. Select an assigned order
2. Click Release

**Expected**

- Assignment released; order returns to dispatch queue
- Trace log updated

---

#### OC-005 — Handle exception_hold order

**Pre-conditions**

- An order has entered `exception_hold`

**Steps**

1. Navigate to Dispatch — exception queue
2. Select the held order
3. Choose: manually assign or escalate

**Expected**

- Order moves to appropriate next state
- SLA notification sent to tenant if configured

**Cross-ref:** SC-012

---

#### OC-006 — Dispatch fails — no eligible supply

**Pre-conditions**

- Order in `ready_for_dispatch`; no eligible vehicles in operating area

**Steps**

1. Observe the order in the queue after matcher runs

**Expected**

- `dispatch_job.status` becomes `failed`
- Order remains in queue for manual intervention
- No fake ETA returned

**Cross-ref:** SC-006

---

### 3.2 Incidents

#### OC-007 — Create incident

**Steps**

1. Navigate to Incidents → New
2. Fill incident type, description, linked order/driver
3. Submit

**Expected**

- Incident created with case ID
- Appears in incident list

---

#### OC-008 — Update incident status

**Steps**

1. Open incident
2. Change status (e.g. `under_investigation` → `resolved`)
3. Save

**Expected**

- Status updated; audit entry written

---

#### OC-009 — Incident ≠ complaint case

**Verification**

- Creating an incident does NOT auto-create a `complaint_case`
- Complaint must be separately created via Complaints module

**Cross-ref:** Hard Rule 4 (00_source_of_truth §0.3)

---

### 3.3 Complaints

#### OC-010 — Create complaint case

**Steps**

1. Navigate to Complaints → New
2. Select category (e.g. `fare_dispute`)
3. Link to order, fill description
4. Submit

**Expected**

- `complaint_case` created with unique case number (NOT an incident record)
- SLA timer starts according to complaint category
- Timeline entry appended

**Cross-ref:** SC-027

---

#### OC-011 — Reopen closed complaint

**Pre-conditions**

- Complaint case in `closed` state

**Steps**

1. Open case
2. Click Reopen, enter justification

**Expected**

- Case status becomes `reopened`
- Original case number retained
- Reopen action written to complaint timeline

**Cross-ref:** SC-028

---

#### OC-012 — SLA breach flag visible

**Pre-conditions**

- Complaint case with SLA past due

**Steps**

1. View complaint case detail

**Expected**

- `sla_breach` flag visible on the case
- Main case status NOT overwritten by SLA breach

**Cross-ref:** SC-029

---

### 3.4 Vehicles

#### OC-013 — Vehicle onboarding requires exclusivity review approval

**Steps**

1. Navigate to Vehicles → New or edit existing
2. Attempt to set `dispatchable_flag=true` while exclusivity review is pending

**Expected**

- Action rejected
- Vehicle remains not dispatchable

**Cross-ref:** SC-023

---

#### OC-014 — Insurance expiry makes vehicle ineligible

**Pre-conditions**

- Vehicle with insurance policy reaching expiry

**Steps**

1. Observe vehicle list after insurance expiry date

**Expected**

- Vehicle marked as not dispatchable
- Excluded from dispatch queries
- Alert visible to ops/compliance

**Cross-ref:** SC-024

---

#### OC-015 — Vehicle offboarding creates debranding task

**Steps**

1. Open vehicle
2. Initiate offboarding

**Expected**

- Vehicle becomes not dispatchable
- Debranding task created and open
- Case stays open until debranding is completed

**Cross-ref:** SC-026

---

### 3.5 Drivers

#### OC-016 — Driver with expired license cannot clock in

**Steps**

1. Check that driver record has expired occupational license
2. Observe clock-in attempt (in driver app or ops console impersonation)

**Expected**

- Backend returns `DRIVER_CERT_INVALID`
- `driver_work_state` does not become `available`

**Cross-ref:** SC-025

---

#### OC-017 — View driver earnings statement

**Steps**

1. Navigate to Drivers → select driver → Earnings

**Expected**

- Driver statement shows: gross, service_fee, subsidy, net per period
- Ops console cannot modify net amounts (read-only display)

**Cross-ref:** SC-031

---

### 3.6 Maintenance

#### OC-018 — Create maintenance record

**Steps**

1. Navigate to Maintenance → New
2. Link to vehicle, fill type, scheduled date
3. Submit

**Expected**

- Maintenance record created; vehicle status reflects maintenance state

---

#### OC-019 — Close maintenance record

**Steps**

1. Open maintenance record
2. Mark as complete

**Expected**

- Record closed; vehicle returns to operable status

---

### 3.7 Attendance & Shifts

#### OC-020 — View driver attendance

**Steps**

1. Navigate to Attendance
2. Filter by driver or date range

**Expected**

- Clock-in/out times shown with duration

---

### 3.8 Call Center

#### OC-021 — Create phone booking with call linkage

**Pre-conditions**

- Incoming CTI call active

**Steps**

1. Navigate to Call Center
2. Create a booking from the active call
3. Fill order details with `call_id`

**Expected**

- Order created with `order_source="phone"`, `call_id` stored, `agent_id` stored
- Dispatch trace entry appended
- Eligible for realtime dispatch

**Cross-ref:** SC-003

---

#### OC-022 — Recording pending state resolved by callback

**Pre-conditions**

- Phone booking created before recording callback arrived (`recording_id = null`)

**Steps**

1. Observe order; should show `compliance_flag="recording_pending"`
2. Simulate or wait for recording-ready callback

**Expected**

- Order updated with `recording_id`
- `recording_pending` flag cleared
- Audit trail entry appended

**Cross-ref:** SC-004

---

### 3.9 Reports (Ops)

#### OC-023 — Monthly regulatory filing package generated

**Steps**

1. Navigate to Reports → Regulatory Filing
2. Select period, trigger generation

**Expected**

- Package includes: vehicle roster, driver roster, contract roster, insurance roster, statistics
- Package manifest generated
- Artifact immutable once created

**Cross-ref:** SC-033

---

#### OC-024 — Dispatch recording index export includes call references

**Steps**

1. Generate dispatch + recording export for a period with phone-origin orders

**Expected**

- Each row: order number, `call_id`, `recording_id` (or explicit flag if missing)

**Cross-ref:** SC-034

---

#### OC-025 — Sensitive artifact download is permissioned and audited

**Steps**

1. Authorized user requests a call recording URL
2. Unauthorized user attempts the same

**Expected**

- Authorized: time-limited download URL issued; audit entry recorded
- Unauthorized: `403 Forbidden`; no URL issued

**Cross-ref:** SC-040

---

### 3.10 Contracts

#### OC-026 — View tenant contract rules

**Steps**

1. Navigate to Contracts
2. Open a tenant contract

**Expected**

- Contract rules displayed: modifiable window, signoff requirements, proof requirements,
  waiting time policy

---

---

## 4. Driver App UAT

### 4.1 Platform Task Inbox (Jobs)

#### DA-001 — Jobs list shows platform badge per task

**Steps**

1. Log in as driver; navigate to Jobs

**Expected**

- Each task shows source platform badge (DRTS own platform vs third-party platforms)
- `TaskTypeBadge` indicates: `platform_dispatch`, `enterprise_shuttle`, `airport_pickup`, or `auto_assigned`

**Cross-ref:** WC-001 acceptance, SC-015

---

#### DA-002 — Accept task before timeout

**Steps**

1. Receive a `task_assigned` notification
2. Accept within timeout window

**Expected**

- Assignment status becomes `accepted`
- Order status becomes `driver_accepted`
- Acceptance time stored

**Cross-ref:** SC-018

---

#### DA-003 — Reject task — reason required

**Steps**

1. Choose Reject on a pending task

**Expected**

- App requires selection of reject reason
- Reason stored with attempt outcome on backend

**Cross-ref:** SC-019

---

#### DA-004 — Cannot start trip before arrived_pickup

**Steps**

1. Accept task; depart toward pickup
2. Attempt to start trip **before** confirming `arrived_pickup`

**Expected**

- Backend returns `PICKUP_NOT_ARRIVED`
- Trip status remains not started

**Cross-ref:** SC-020

---

#### DA-005 — Forwarded task — routeLocked flag hides dispatch override

**Steps**

1. Accept a forwarded task (from third-party platform)
2. View task detail

**Expected**

- `routeLocked` badge displayed
- Edit/override actions for route are hidden
- Third-party waypoints displayed as authoritative

**Cross-ref:** WA-004, WC-005

---

#### DA-006 — Fixed-price task — fare modification rejected

**Pre-conditions**

- Task marked `fixed_price=true`

**Steps**

1. Attempt to complete task with modified fare amount

**Expected**

- Backend returns `FIXED_PRICE_IMMUTABLE`
- Only proof fields accepted

**Cross-ref:** SC-021

---

#### DA-007 — Completion requires min photo count

**Pre-conditions**

- Trip contract requires `min_photo_count=1`

**Steps**

1. Submit trip completion without attaching any photo

**Expected**

- Backend returns `MIN_PHOTO_COUNT_NOT_MET`
- Proof status remains pending

**Cross-ref:** SC-022

---

#### DA-008 — Enterprise dispatch completion requires signoff

**Pre-conditions**

- Enterprise dispatch trip with `contract_rule.signoff_required=true`

**Steps**

1. Submit completion without signoff

**Expected**

- Backend returns `PROOF_REQUIRED`
- Trip status remains `proof_pending`

**Cross-ref:** SC-013

---

#### DA-009 — Airport transfer completion requires expense proof

**Pre-conditions**

- Airport transfer trip with `contract_rule.expense_proof_required=true`

**Steps**

1. Submit completion without expense proof

**Expected**

- Backend returns `EXPENSE_PROOF_REQUIRED`
- Trip status remains `proof_pending`

**Cross-ref:** SC-014

---

### 4.2 Platform Presence Center

#### DA-010 — Per-platform online/offline toggle

**Steps**

1. Navigate to Platform Presence
2. Toggle a platform from offline → online

**Expected**

- `driver_work_state` transitions to appropriate `available_*` state via correct API call
- UI reflects new state immediately

**Cross-ref:** WC-002

---

#### DA-011 — Token expiry warning shown with countdown

**Pre-conditions**

- Driver has a platform account with token near expiry

**Steps**

1. Navigate to Platform Presence

**Expected**

- Expiry countdown shown with urgency indicator (Xd Yh format)
- Re-auth button visible when token critical

**Cross-ref:** WC-002

---

#### DA-012 — Re-auth flow triggers token refresh

**Steps**

1. Click re-auth on an expiring/expired platform token

**Expected**

- Re-auth flow opens (platform-specific OAuth or credential re-entry)
- On success, token expiry updated in backend
- Urgency indicator removed

**Cross-ref:** WC-002, WC-003

---

#### DA-013 — Platform eligibility status displayed

**Steps**

1. Navigate to Platform Presence

**Expected**

- Eligibility status shown per platform (e.g. eligible, suspended, pending verification)

---

### 4.3 Platform Account Binding

#### DA-014 — Bind new platform account

**Steps**

1. Navigate to Platform Presence → bind a new platform

**Expected**

- Bind flow launches (OAuth or token input)
- On success, platform appears in list with `active` status

**Cross-ref:** WC-003

---

#### DA-015 — Unbind platform account

**Steps**

1. Open a bound platform
2. Click Unbind / Remove

**Expected**

- Platform account removed from driver's list
- Driver can no longer accept forwarded tasks from that platform

---

### 4.4 Platform Earnings Dashboard

#### DA-016 — Earnings summary by platform

**Steps**

1. Navigate to Earnings
2. Switch between Today / This Week / This Month

**Expected**

- Earnings broken down per platform
- Each platform shows: gross, service_fee, subsidy, net

**Cross-ref:** WA-002, WC-004

---

#### DA-017 — Driver can only see own earnings

**Steps**

1. Authenticated as driver; request earnings data

**Expected**

- Only authenticated driver's own statements and data returned
- No cross-driver data accessible

**Cross-ref:** SC-036

---

#### DA-018 — Platform funding discount NOT deducted from driver net

**Pre-conditions**

- A completed trip where a platform-funded discount was applied

**Steps**

1. View the driver statement for the trip

**Expected**

- Discount not deducted from driver net earning
- Reimbursement item generated if required by plan

**Cross-ref:** SC-032

---

### 4.5 Trip Lifecycle

#### DA-019 — Trip screen shows correct lifecycle buttons

**Steps**

1. Accept a task; observe trip.tsx screen during each lifecycle phase

**Expected**

- Buttons visible only for valid state transitions:
  - `depart_pickup` available after acceptance
  - `arrived_pickup` available after departing
  - `start_trip` available only after `arrived_pickup`
  - `complete_trip` available during `on_trip`

---

### 4.6 Settings

#### DA-020 — Driver settings — update preferences

**Steps**

1. Navigate to Settings
2. Update a preference (e.g. notification sound, auto-accept)
3. Save

**Expected**

- Preference saved; persists after app restart

---

### 4.7 Shift & Attendance

#### DA-021 — Clock in

**Pre-conditions**

- Driver has valid, non-expired licenses

**Steps**

1. Navigate to Shift
2. Clock in

**Expected**

- `driver_work_state` transitions to `available_*` state
- Attendance record created

**Cross-ref:** SC-025 (inverse — success path)

---

#### DA-022 — Clock in blocked for expired license

**Pre-conditions**

- Driver has an expired occupational license

**Steps**

1. Attempt clock in

**Expected**

- Backend returns `DRIVER_CERT_INVALID`
- `driver_work_state` remains `logged_out` or `ready_offline`

**Cross-ref:** SC-025

---

### 4.8 Incident (Driver-side)

#### DA-023 — Driver reports incident during trip

**Steps**

1. During a trip, navigate to the incident report button
2. Submit incident report

**Expected**

- Incident created and linked to current trip/order
- Driver work state updated appropriately (may enter `incident_hold`)

---

#### DA-024 — Driver device registration denied by auth gate

**Pre-conditions**

- Driver is either `suspended` or has invalid / expired certifications

**Steps**

1. Attempt device registration or first-session bootstrap for the driver

**Expected**

- Backend returns `DRIVER_AUTH_SUSPENDED` or `DRIVER_CERT_INVALID`
- No access token or refresh token is issued
- Driver remains outside authenticated task views

---

#### DA-025 — Revoked or suspended driver session cannot re-auth

**Pre-conditions**

- Driver previously held a valid device binding

**Steps**

1. Revoke the bound device or suspend the driver master
2. Attempt token refresh or open a protected driver API route with the old bearer token

**Expected**

- Revoked device returns `DRIVER_DEVICE_SESSION_INVALID`
- Suspended driver returns `DRIVER_AUTH_SUSPENDED`
- Old session is unusable without issuing a replacement binding

---

---

## 5. End-to-End Cross-Surface Flows

### E2E-001 — Enterprise dispatch full cycle

1. **Tenant Portal (TP-001):** Tenant creates enterprise dispatch booking
2. **Ops Console (OC-001/002):** Dispatcher sees order in queue; assigns driver
3. **Driver App (DA-002/019):** Driver accepts, arrives, starts trip, completes with signoff
4. **Tenant Portal (TP-007):** Booking status visible as `completed`
5. **Ops Console (OC-017 / billing):** Earnings statement generated correctly

**Pass criteria:** All state transitions audited; SLA not breached; no cross-tenant data leakage.

---

### E2E-002 — Forwarded order mirror lifecycle

1. External platform sends inbound order
2. **Driver App (DA-001/005):** Driver sees forwarded task with `routeLocked` badge
3. Driver accepts → external platform confirms
4. **Driver App:** Task shows `confirmed_by_platform`
5. External platform cancels → **Driver App:** task shows `cancelled_by_platform`

**Pass criteria:** No owned `dispatch_assignment` created; external lifecycle preserved.

**Evidence classification:** `EXTERNAL-GATED`. The repo has a graceful-skip scaffold, but live
pass language requires either a seeded forwarded task or real forwarder adapter proof.

**Cross-ref:** SC-015, SC-017

---

### E2E-003 — Phone booking to compliance export

1. **Ops Console (OC-021):** Agent creates phone booking; `call_id` stored
2. Recording callback arrives; **OC-022:** recording flag cleared
3. Driver completes trip; **DA-019:** proof submitted
4. **Ops Console (OC-024):** Export includes order row with `call_id` + `recording_id`

**Evidence classification:** `DEFERRED`. This flow stays held until CTI callback and filing /
recording export activation evidence exists.

---

### E2E-004 — Platform admin creates tenant; tenant admin books

1. **Platform Admin (PA-001):** Admin creates tenant with `enterprise_dispatch` module enabled
2. **Tenant Portal (TP-001):** Tenant admin creates a booking
3. **Ops Console (OC-001):** Booking visible in dispatch queue with correct tenant attribution

---

## 6. MVP Regression Reference

Minimum set of scenarios to automate first (aligns with `02_acceptance_scenarios_gherkin.md §2.12`):

| Scenario ID | UAT ID     | Description                                       | Classification  |
| ----------- | ---------- | ------------------------------------------------- | --------------- |
| SC-001      | —          | Owned standard_taxi immediate booking (owned app) | LIVE            |
| SC-003      | OC-021     | Phone booking with recording linkage              | STATIC EVIDENCE |
| SC-005      | OC-002     | Standard dispatch assignment                      | LIVE            |
| SC-008      | TP-001     | Enterprise dispatch booking                       | LIVE            |
| SC-010      | TP-004     | Airport pickup — missing flight number            | LIVE            |
| SC-013      | DA-008     | Enterprise dispatch — signoff required            | SIGN-OFF        |
| SC-015      | DA-001/005 | Forwarded order accepted + confirmed              | EXTERNAL-GATED  |
| SC-020      | DA-004     | Cannot start trip before arrived_pickup           | STATIC EVIDENCE |
| SC-023      | OC-013     | Vehicle — exclusivity review gate                 | LIVE            |
| SC-024      | OC-014     | Vehicle — insurance expiry auto-suspend           | LIVE            |
| SC-027      | OC-010     | Complaint case creation (not incident)            | STATIC EVIDENCE |
| SC-033      | OC-023     | Regulatory monthly filing package                 | DEFERRED        |

---

## 7. Pending Evidence Gates

The following items are blocked until WE-004 (smoke harness) produces evidence:

| Gate                             | Description                                          | Unblocked by                     | Classification  |
| -------------------------------- | ---------------------------------------------------- | -------------------------------- | --------------- |
| **Recording callback**           | Real CTI webhook integration (OC-022)                | External CTI environment or stub | EXTERNAL-GATED  |
| **Insurance expiry trigger**     | Automated job that marks vehicle ineligible (OC-014) | Backend job activation           | LIVE            |
| **SLA breach monitor**           | Complaint SLA job (OC-012)                           | Scheduler activation on staging  | STATIC EVIDENCE |
| **Billing statement generation** | Period-end job (DA-016/017)                          | Staging billing job config       | STATIC EVIDENCE |
| **Regulatory filing**            | Month-end snapshot job (OC-023)                      | Staging reporting job config     | DEFERRED        |

Rows marked `DEFERRED` or `EXTERNAL-GATED` stay blocked until the named evidence exists. Rows
marked `STATIC EVIDENCE` or `LIVE` still require their own `Pass/Fail` execution result before
human UAT pass language is allowed.

---

_End of WE-005 UAT Scenario Pack draft. Final sign-off pending WE-004 smoke evidence mapping._

---

## 8. Complaint Workflow UAT Scenarios (ORX-CS-001)

Added: 2026-04-30 | Owner: Claude2 | Reviewer: Codex

### SC-CS-001: Complaint category → SLA mapping

**Precondition:** Operator has access to Ops Console complaint workspace.

| Step | Action                                                  | Expected                                                   |
| ---- | ------------------------------------------------------- | ---------------------------------------------------------- |
| 1    | Create a `safety_concern` / `high` severity complaint   | SLA due is set to ~2 hours from now (4h base ÷ 2 for high) |
| 2    | Create a `lost_and_found` / `normal` severity complaint | SLA due is set to ~72 hours from now                       |
| 3    | Create a `fare_dispute` / `normal` severity complaint   | SLA due is set to ~48 hours from now                       |

**Pass criteria:** SLA due times match the category+severity matrix defined in `DEFAULT_SLA_HOURS_BY_CATEGORY`.

### SC-CS-002: Complaint category → valid resolution codes

| Step | Action                                                                              | Expected                                                                                            |
| ---- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1    | Select a `fare_dispute` complaint and open resolve form                             | Resolution dropdown shows: refund, credit, corrective action, no fault, duplicate, withdrawn, other |
| 2    | Select a `lost_and_found` complaint and open resolve form                           | Resolution dropdown shows: item returned, item not found, no fault, duplicate, withdrawn, other     |
| 3    | Attempt to resolve a `fare_dispute` complaint with `resolved_item_returned` via API | API rejects with `RESOLUTION_CODE_NOT_VALID_FOR_CATEGORY`                                           |

**Pass criteria:** Resolution code dropdown is filtered per category. Invalid codes are rejected server-side.

### SC-CS-003: Reopen preserves case identity and resets SLA

| Step | Action                                 | Expected                                                                                  |
| ---- | -------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1    | Create, resolve, and close a complaint | Case is `closed` with resolution code and closing note                                    |
| 2    | Reopen the closed case with a reason   | Case stays on the same `caseNo`, status becomes `reopened`, `reopenCount` increments to 1 |
| 3    | Check SLA fields                       | `slaDueAt` is recalculated from current time, `slaBreach` is reset to `false`             |
| 4    | Check timeline                         | Timeline includes `case_reopened` and `sla_recalculated` entries                          |
| 5    | Close and reopen again                 | `reopenCount` increments to 2                                                             |

**Pass criteria:** Case identity is preserved. SLA is fresh on each reopen. Full history is visible in timeline.

### SC-CS-004: SLA breach is a flag, not a state overwrite

| Step | Action                                   | Expected                                                        |
| ---- | ---------------------------------------- | --------------------------------------------------------------- |
| 1    | Create a complaint and mark SLA breach   | `slaBreach` becomes `true`, `status` remains unchanged          |
| 2    | Continue investigation (add note)        | Status moves to `under_investigation`, `slaBreach` stays `true` |
| 3    | Check notifications                      | An `ops_notice` notification was created for the SLA breach     |
| 4    | Reopen a previously breached+closed case | `slaBreach` resets to `false`, new SLA begins                   |

**Pass criteria:** SLA breach never overwrites the workflow status. Breach flag is independent. Reopen resets the breach.

### SC-CS-005: Automatic SLA breach sweep

| Step | Action                                                                | Expected                                                       |
| ---- | --------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1    | Create complaints with past-due SLA times (or wait for SLA to expire) | Cases exist with `slaBreach: false` and `slaDueAt` in the past |
| 2    | Call `POST /complaints/evaluate-sla-breach`                           | All overdue open cases are marked `slaBreach: true`            |
| 3    | Call the endpoint again                                               | Already-breached cases are not double-processed                |

**Pass criteria:** Bulk SLA evaluation correctly identifies and marks all overdue cases.

### SC-CS-006: Cross-lane incident linking

| Step | Action                                              | Expected                                                                                                |
| ---- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1    | Escalate a `safety_concern` complaint to incident   | New incident is created, complaint `relatedIncidentId` is set, incident `relatedComplaintCaseNo` is set |
| 2    | Attempt to escalate the same complaint again        | Rejected with `COMPLAINT_ALREADY_ESCALATED`                                                             |
| 3    | Link a different complaint to an existing incident  | Both records are cross-linked                                                                           |
| 4    | Attempt to relink either to a different counterpart | Rejected with conflict error                                                                            |

**Pass criteria:** Complaint-incident links are bidirectional, exclusive, and auditable.

---

## 9. Negative-Path UAT Scenarios (ORX-GV-001)

Added: 2026-04-30 | Owner: Claude2 | Reviewer: Claude

This section fills coverage gaps identified during ORX-GV-001. Each scenario family
must have at least one positive, one negative, and one permission/audit test before
the release gate can reference it as covered. Scenarios below are grouped by the
workflow family they feed.

### 9.1 Dispatch Negative-Path (WF-DSP-001)

#### NP-DSP-001 — Dispatcher without assign permission cannot assign

**Pre-conditions**

- Authenticated as a user with `ops_viewer` role (read-only dispatch access)
- An order is in `ready_for_dispatch` state

**Steps**

1. Attempt to call `POST /api/dispatch/assign` with a valid order and driver

**Expected**

- Backend returns `403 Forbidden`
- No assignment is created
- Audit trail records the denied access attempt

**Cross-ref:** SC-005 (positive path), OC-002

---

#### NP-DSP-002 — Reassign to ineligible driver rejected

**Pre-conditions**

- An order is in `assigned` state
- Target driver has expired license or is not clocked in

**Steps**

1. Select the order in dispatch queue
2. Attempt reassign to the ineligible driver

**Expected**

- Backend rejects with `DRIVER_NOT_ELIGIBLE`
- Original assignment is preserved unchanged
- Dispatch trace log records the failed reassign attempt

**Cross-ref:** SC-007, OC-003

---

#### NP-DSP-003 — Dispatch timeout triggers escalation, not silent failure

**Pre-conditions**

- An owned order is in `ready_for_dispatch` with dispatch timeout configured
- No driver accepts within the timeout window

**Steps**

1. Observe the order after dispatch timeout expires

**Expected**

- Order enters `redispatch_required` or `exception_hold` state
- Ops notification is created for the timeout event
- No silent state transition occurs without operator visibility
- Tenant SLA notification sent if configured

**Cross-ref:** SC-006, SC-012

---

### 9.2 Finance Negative-Path (WF-FIN-001)

#### NP-FIN-001 — Invoice generation with no eligible trips produces empty result

**Pre-conditions**

- Tenant billing period has ended but no completed trips exist for the period

**Steps**

1. Trigger invoice generation for the empty period

**Expected**

- System either produces a zero-amount invoice or returns `NO_ELIGIBLE_TRIPS`
- No phantom charges appear
- Audit trail records the generation attempt

---

#### NP-FIN-002 — Unauthorized user cannot download sensitive financial artifact

**Pre-conditions**

- A completed invoice exists
- Authenticated as a user without `finance_viewer` or `tenant_admin` role

**Steps**

1. Attempt to call `GET /api/tenant/invoices/:id/download`

**Expected**

- Backend returns `403 Forbidden`
- No download URL is issued
- Audit trail records the denied access attempt

**Cross-ref:** SC-040, OC-025

---

#### NP-FIN-003 — Driver cannot view another driver's earnings

**Pre-conditions**

- Two drivers exist (driver1, driver2)
- Authenticated as driver1

**Steps**

1. Attempt to call driver earnings endpoint with driver2's ID

**Expected**

- Backend returns only driver1's own data or `403 Forbidden`
- No cross-driver financial data is exposed
- Access attempt is audited

**Cross-ref:** SC-036, DA-017

---

#### NP-FIN-004 — Reconciliation dispute cannot be opened by non-finance role

**Pre-conditions**

- Reconciliation issue queue has entries
- Authenticated as `ops_dispatcher` (no finance privileges)

**Steps**

1. Attempt to open a reconciliation dispute via API

**Expected**

- Backend returns `403 Forbidden`
- No dispute record is created
- Access attempt is audited

---

### 9.3 Forwarder Negative-Path (WF-FWD-001)

#### NP-FWD-001 — Forwarded order acceptance after external cancellation

**Pre-conditions**

- A forwarded order mirror exists locally
- External platform has already sent a cancellation callback

**Steps**

1. Driver attempts to accept the cancelled forwarded task

**Expected**

- Backend rejects with `TASK_CANCELLED_BY_PLATFORM` or equivalent
- No local assignment is created
- Driver sees cancellation state in task list

**Cross-ref:** SC-017

---

#### NP-FWD-002 — Forwarded order route override is blocked

**Pre-conditions**

- A forwarded task with `routeLocked=true` is accepted by a driver

**Steps**

1. Driver attempts to modify route waypoints via API

**Expected**

- Backend rejects with `ROUTE_LOCKED_IMMUTABLE`
- Third-party waypoints remain authoritative
- Modification attempt is audited

**Cross-ref:** DA-005, SC-015

---

#### NP-FWD-003 — Forwarder sync failure is surfaced, not swallowed

**Pre-conditions**

- Forwarder adapter is configured but external platform returns an error on sync

**Steps**

1. Observe forwarder sync status after a failed callback

**Expected**

- Sync failure is logged with error code and timestamp
- Ops health dashboard reflects the adapter failure state
- No stale order status is presented as current truth

---

### 9.4 Compliance and Recording Negative-Path (WF-COM-001)

#### NP-COM-001 — Regulatory filing with missing recordings is flagged

**Pre-conditions**

- Phone-origin orders exist in the filing period
- Some orders have `recording_id = null` (recording never arrived)

**Steps**

1. Generate regulatory filing package for the period

**Expected**

- Filing package is generated but includes explicit flags for missing recordings
- Package manifest notes incomplete compliance status
- Missing-recording orders are listed separately for remediation

**Cross-ref:** SC-034

---

#### NP-COM-002 — Non-compliance user cannot access recording artifacts

**Pre-conditions**

- Call recordings exist for phone-origin orders
- Authenticated as `tenant_booking_manager` (no compliance role)

**Steps**

1. Attempt to request call recording download URL

**Expected**

- Backend returns `403 Forbidden`
- No recording URL is issued
- Access attempt is audited

**Cross-ref:** SC-040, OC-025

---

### 9.5 Identity and Auth Negative-Path (WF-TEN-001 / WF-DRV-001)

#### NP-AUTH-001 — Expired API key cannot authenticate

**Pre-conditions**

- A tenant API key has been revoked

**Steps**

1. Make any API call using the revoked key in the `Authorization` header

**Expected**

- Backend returns `401 Unauthorized`
- No tenant session is established
- Rejected auth attempt is audited

**Cross-ref:** TP-017

---

#### NP-AUTH-002 — Cross-tenant API key cannot access another tenant's resources

**Pre-conditions**

- Tenant A has a valid API key
- Tenant B has bookings

**Steps**

1. Use Tenant A's API key to request Tenant B's booking list

**Expected**

- Backend returns empty list (scoped to Tenant A) or `403 Forbidden`
- No cross-tenant data leakage
- Access attempt is logged with tenant scope mismatch

**Cross-ref:** E2E-004, TP-030

---

#### NP-AUTH-003 — Driver device rebind invalidates old session

**Pre-conditions**

- Driver has a valid device binding (device A)
- Admin rebinds driver to a new device (device B)

**Steps**

1. Attempt API call from device A using old bearer token

**Expected**

- Backend returns `DRIVER_DEVICE_SESSION_INVALID`
- Old device cannot access any driver APIs
- Audit trail records the session invalidation

**Cross-ref:** DA-025

---

### 9.6 Override and Exception-Hold Negative-Path (WF-DSP-001)

#### NP-OVR-001 — Override request without reason is rejected

**Pre-conditions**

- An order is in `exception_hold` state

**Steps**

1. Attempt to release the hold without providing a reason or justification

**Expected**

- Backend rejects with `OVERRIDE_REASON_REQUIRED`
- Exception hold remains in place
- Attempted release is logged

---

#### NP-OVR-002 — Non-manager cannot approve override release

**Pre-conditions**

- An override request is pending approval
- Authenticated as `ops_dispatcher` (not `ops_manager`)

**Steps**

1. Attempt to approve the override release

**Expected**

- Backend returns `403 Forbidden`
- Override remains pending
- Unauthorized approval attempt is audited

---

#### NP-OVR-003 — Expired override is auto-revoked

**Pre-conditions**

- An override was approved with a time-limited expiry

**Steps**

1. Observe the override after its expiry time passes

**Expected**

- Override is automatically revoked
- Order returns to its pre-override state or requires new review
- Expiry event is audited with timestamp

---

### 9.7 Vehicle and Master Data Negative-Path

#### NP-VEH-001 — Vehicle with pending offboarding cannot be redispatched

**Pre-conditions**

- Vehicle offboarding has been initiated (debranding task open)

**Steps**

1. Attempt to set `dispatchable_flag=true` via ops console or API

**Expected**

- Backend rejects the action
- Vehicle remains not dispatchable until debranding is complete
- Attempted action is audited

**Cross-ref:** OC-015, SC-026

---

#### NP-VEH-002 — Duplicate vehicle plate number is rejected

**Pre-conditions**

- A vehicle with plate `ABC-1234` already exists

**Steps**

1. Attempt to create a new vehicle record with the same plate number

**Expected**

- Backend returns `DUPLICATE_PLATE_NUMBER` or equivalent uniqueness error
- No duplicate record is created

---
