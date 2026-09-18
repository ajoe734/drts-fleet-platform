# DRTS App Entry-URL Index (dev)

_Last verified & reconciled: 2026-08-17, against Stage 1 functional release candidate PR [#1451](https://github.com/ajoe734/drts-fleet-platform/pull/1451) (merge SHA `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4`)._

Authoritative source of truth for **which app serves which surface, at which dev URL, for which role, with which supported operations, and under which deployment / external gate conditions**.

> **Active Inventory & Deployment Status**:
> - **Codebase & CI Baseline:** `deploy-dev` configures **9 active services** (8 web + 1 API):  
>   `api, platform-admin-web, ops-console-web, fleet-partner-portal-web, tenant-console-web, bank-console-web, enterprise-dispatch-web, channel-partner-portal-web, referral-embed-web`.  
>   All 9 services are code-complete, verified in CI (`CI (integration trunk)` Run 31997773400 / PR #1451 merge `4012b10c`), and backed by hermetic E2E (22/22), deterministic route suites (39/39), and operational browser suites (7/7 journeys).
> - **Live Cloud Run Deployment Status:** Deployment via `deploy-dev.yml` is currently **blocked on an external infrastructure gate** (Google Cloud Project #952590575714 requires billing enablement for container registry/artifact push).  
> - **Current Live Endpoint Responses (2026-08-17 audit):** All 9 active Cloud Run URLs currently return Cloud Run `503` ("The service you requested is not available yet") pending GCP billing enablement and image rollout. Paused Partner Booking and retired Concierge return HTTP `404`.

---

## 1. Active Operator & Surface Matrix

| App / Surface | Target Dev URL | Live HTTP Status (2026-08-17) | Role(s) | Supported Operations & Workflows | Known External Gates & Out-of-Scope Boundaries |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **`api`** | https://drts-dev-api-4t7rg6fmeq-uc.a.run.app | `503` (Deploy Blocked) | System / BFF / Background Workers | Control-plane API (`/api/health` target). Core business domain state machines, dispatch algorithms, driver heartbeat ingestion, supply review, billing calculations, append-only security/audit logging. | External GCP project billing enablement; Real bank issuer API credentials; Grab order forwarding; Live CTI telephony integration. |
| **`platform-admin-web`** | https://drts-dev-platform-admin-web-4t7rg6fmeq-uc.a.run.app | `503` (Deploy Blocked) | `platform_admin` | 車隊與平台管理 (indigo). Supply review queue (`/supply-review`), diff inspection, request revisions, approve/reject supply submissions, canonical registry provisioning, third-party referral governance (`/partners`, `/partners/[entrySlug]`, `/partners/[entrySlug]/rates`, `/partners/referral`), rate rule admin, tenant administration. | External GCP project billing enablement; Two-person break-glass rule campaigns (Stage 1.5); Automated commercial contract e-signing. |
| **`ops-console-web`** | https://drts-dev-ops-console-web-4t7rg6fmeq-uc.a.run.app | `503` (Deploy Blocked) | `ops_dispatcher`, `ops_manager`, `complaint_specialist` | 營運管理 (coral). Live dispatch board, manual dispatch assignment and override, incident tracking and SOS receipt resolution (`/incidents`), vehicle maintenance management, driver live status tracking. | External GCP project billing enablement; Real-world GPS cellular hardware telematics (simulated via heartbeat ingest); Live CTI telephony integration. |
| **`tenant-console-web`** | https://drts-dev-tenant-console-web-4t7rg6fmeq-uc.a.run.app | `503` (Deploy Blocked) | `tenant_admin`, `tenant_booking_manager` | Enterprise dispatch **admin** back office. Corporate employee booking management, cost-center quota configuration, booking audit trail, cross-app dispatch detail intent link, tenant user role assignments. | External GCP project billing enablement; Corporate SSO/SAML IDP integration (dev uses mock OIDC/BFF session); ERP accounting sync. |
| **`enterprise-dispatch-web`** | https://drts-dev-enterprise-dispatch-web-4t7rg6fmeq-uc.a.run.app | `503` (Deploy Blocked) | Corporate Commuter / `employee`, `tenant_admin` | Enterprise dispatch employee **front** (S1 standalone + S2 in-app embed `/embed/*`). Semantic booking request form (`/bookings/new`), passenger/address/cost-center selection, quota/policy preview, booking list (`/bookings`), booking detail & edit, cancellation. | External GCP project billing enablement; Internal enterprise intranet portal iframe embedding; Production corporate LDAP/AD directory sync. |
| **`fleet-partner-portal-web`** | https://drts-dev-fleet-partner-portal-web-4t7rg6fmeq-uc.a.run.app | `503` (Deploy Blocked) | `fleet_partner` (scoped to `fleet-demo-001`) | 車行管理 (emerald). Fleet dashboard, driver & vehicle supply onboarding (`/supply`), document upload intent/confirmation/deletion, supply submission/withdrawal/resubmission, driver fee plan & trips summary, statement viewing/download/confirm/dispute. | External GCP project billing enablement; Live bank payout clearinghouse; Automated DMV / regulatory driver license verification API. |
| **`referral-embed-web`** | https://drts-dev-referral-embed-web-4t7rg6fmeq-uc.a.run.app/embed/yuhe-residence<br>_(Custom: `https://refer.smarttransport.tw/embed/yuhe-residence`)_ | `503` (Deploy Blocked) | Community Resident / Referral Passenger | Embedded ride-hailing front. Formal 御和物業 partner entry (`/embed/yuhe-residence`), origin/destination input, vehicle type selection, fare calculation, booking creation, active trip status tracking & resume, trip cancellation, 5-star rating submission, ride receipt viewing. | External GCP project billing enablement; Third-party property management mobile app native webview container (`app.yuhe-living.com.tw`); Credit card payment gateway tokenization. |
| **`channel-partner-portal-web`** | https://drts-channel-partner-portal-web-4t7rg6fmeq-uc.a.run.app<br>_(Custom: `https://channel.smarttransport.tw`)_ | `503` (Deploy Blocked) | `channel_partner` (scoped to formal `yuhe-residence`) | Channel-partner self-service back office. Partner dashboard (`/dashboard`), referral ride volume & commission usage analytics (`/usage`), settlement statement downloads (`/statements` in CSV/PDF), channel entry configuration preview. | External GCP project billing enablement; Live tax invoice filing / Taiwan GUI issuance; Bank wire clearing system. |
| **`bank-console-web`** | https://drts-dev-bank-console-web-4t7rg6fmeq-uc.a.run.app | `503` (Deploy Blocked) | `bank_program_admin`, `bank_auditor` | Line A — 信用卡卡友機場接送 Issuing-bank back office. Program dashboard, scoped booking transaction list and detail, program quota & usage metrics, contract terms view, authenticated monthly settlement statement downloads (`/statements`), masked audit log. | External GCP project billing enablement; Core banking ledger API; Issuer-owned cardholder privilege validation / KYC engine. |

---

## 2. Native Mobile Surface

| App | Surface Type | Role | Notes & Verification Evidence |
| :--- | :--- | :--- | :--- |
| **`driver-app`** | Native Expo / React Native (Android & iOS) | `driver` | Internal test build runner. Auth/device binding, task inbox, accept, depart, arrive, start, complete with photo proof, offline heartbeat batch replay, and SOS emergency reporting. Replayed against candidate SHA (`docs/04-uat/s1f-drv-001-android-driver-journey-replay-evidence.md`). No public app store distribution requirement for Stage 1. |

---

## 3. Paused Surfaces (HTTP 404 Enforced)

| App | Paused Routes | Status | Notes |
| :--- | :--- | :---: | :--- |
| **`partner-booking-web`** | `/ctbc/program/site`<br>`/ctbc/program/embed` | **PAUSED** (`404`) | Intentionally paused as of 2026-08-01. Covers both standalone website and bank-app embed. Has no active dev URL: deploy does not build or expose it; Cloud Run service returns 404; domain maintenance does not route `book.smarttransport.tw`. Source and route docs remain available for future reviewed re-enablement. |

---

## 4. Retired & Decommissioned Surfaces (HTTP 404 Enforced)

| App | Status | Historical Role & Decommission Details |
| :--- | :---: | :--- |
| **`concierge-portal-web`** | **RETIRED** (`404`) | **Decommissioned.** Removed from `deploy-dev.yml`, domain mappings, smoke suites, and active inventories. Returns HTTP 404. |
| **`passenger-web`** | **RETIRED** (`404`) | **Retired 2026-06-16.** Removed from `deploy-dev`; embed ride-hailing surface migrated to `referral-embed-web`. Old routes return HTTP 404. |
| **`tenant-commute-hub` (Lovable)** | **RETIRED** | **Retired.** Superseded by `enterprise-dispatch-web`. |
| **`tenant-portal-web`** | **NOT DEPLOYED** (`404`) | Historical early scaffold; superseded by `tenant-console-web`. |
| **`assisted-entry-web`** | **STUB** | Stub / naming bridge only; not an active deployment target. |

---

## 5. Architectural & Governance References

- **Functional Completeness Baseline:** [`docs/02-architecture/stage1-dev-functional-completeness-gap-20260808.md`](stage1-dev-functional-completeness-gap-20260808.md)
- **Execution Runbook:** [`docs/03-runbooks/stage1-dev-functional-completion-execution-tasks-20260808.md`](../03-runbooks/stage1-dev-functional-completion-execution-tasks-20260808.md)
- **Operational Acceptance Evidence:** [`docs/04-uat/s1f-rel-001-release-candidate-evidence.md`](../04-uat/s1f-rel-001-release-candidate-evidence.md)
- **Canonical Document Map:** [`CANONICAL_DOCUMENT_MAP.md`](../../CANONICAL_DOCUMENT_MAP.md)
