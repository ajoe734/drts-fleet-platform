# Stage 1 Dev Functional Completeness GAP

Status: closed — functionally complete on dev (verified against release candidate PR #1451 / merge SHA `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4`)

Audit date: `2026-08-08`  
Closeout date: `2026-08-17`

Code baseline: `origin/dev@4012b10c0cd4990bd238eaed6ddc23252bc0c8d4` (Release candidate `527a3d403464806ea1d4f417c60ac3e4fa8f17d6`)

Execution packet: `docs/03-runbooks/stage1-dev-functional-completion-execution-tasks-20260808.md`

Registration script: `tools/task-dispatch/dispatch-stage1-functional-completion-20260808.py`

Evidence pack: `docs/04-uat/s1f-rel-001-release-candidate-evidence.md`

---

## 1. Decision

**Stage 1 Functional Completion is CLOSED and fully verified on Dev.**

All 8 confirmed functional GAPs (`GAP-S1F-REF` through `GAP-S1F-DRV`) identified during the 2026-08-08 audit have been resolved, wired to real backend/BFF APIs without fixture fallbacks or inert buttons, integrated into `dev` via Release Candidate PR [#1451](https://github.com/ajoe734/drts-fleet-platform/pull/1451) (merge SHA `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4`), and verified through hermetic E2E test suites, deterministic UI route suites, Android driver mobile journey replay, and cross-surface operational browser acceptance journeys.

The completion criteria are satisfied across all active product surfaces:

1. **Live Input & Selection**: Users enter and select real data across all web forms and mobile inputs without fixture defaulting.
2. **Real API / BFF Mutation**: Every enabled action performs an authenticated HTTP request or download against the approved API/BFF boundary.
3. **State Persistence & Readback**: Created and updated states survive page refresh and are verified through direct API and database readback.
4. **Complete Lifecycles**: Supported lifecycle operations (create, read, update, cancel, submit, withdraw, resubmit, review, approve, dispute, and export) work end-to-end.
5. **Truthful States**: Operational failures, authorization rejections, empty datasets, and loading states are rendered honestly without substitute sample/demo fixtures.
6. **Frozen Surfaces**: Partner Booking and Concierge Portal remain paused/retired and return HTTP 404.

Current Release Statement:  
**Stage 1 user-operation functional completion is complete and verified on dev (Candidate PR #1451 / merge SHA `4012b10c0cd4990bd238eaed6ddc23252bc0c8d4`).**

---

## 2. Scope boundary

### 2.1 In scope (Delivered & Verified)

- **Formal Referral Embed booking lifecycle**: controlled form inputs, booking creation at `/embed/yuhe-residence`, active trip resume, cancellation, rating, and ride receipts.
- **Enterprise Dispatch employee booking lifecycle**: dynamic semantic inputs, live passenger/address/cost-center/quota binding, booking submission, list, detail, edit, and cancellation.
- **Fleet Partner supply onboarding, statements and operational actions**: valid fleet identity (`fleet-demo-001`), current fee-plan period, driver/vehicle supply onboarding UI with document upload, submit/withdraw/resubmit flows, and statement actions.
- **Platform Admin supply review and truthful operational states**: supply review queue and detail, revision request, approval provisioning, and removal of false fixture fallbacks/inert buttons.
- **Bank Console live Dev read models and minimum downloads**: scoped live API read models for bookings, programs, contracts, and statements; authenticated statement downloads.
- **Channel Partner Portal alignment to formal referral identity**: bound bootstrap identity to formal Yuhe residence partner/program IDs (`yuhe-residence`) and reconciled usage/statement data.
- **Driver App Dev emulator replay**: Android emulator replay covering auth, task inbox, accept, depart, arrive, start, complete with photo proof, offline heartbeat replay, and SOS incident reporting.
- **Cross-surface operational browser acceptance & candidate release**: deterministic 7-journey browser acceptance suite bound to pinned candidate SHA (`x-drts-candidate-sha`), integrated into CI and release workflow.

### 2.2 Explicitly not a Stage 1 blocker (External Gates)

- Real bank or issuer production credentials and issuer-owned KYC/benefit authorization systems.
- Grab or third-party commercial order-forwarding API integrations.
- Public Google Play / Apple App Store mobile distribution and commercial signing accounts.
- Live CTI telephony hardware, voice recording infrastructure, or external regulatory filings.
- Advanced Stage 1.5 security governance (two-person break-glass rule campaigns, advanced access review campaigns) that does not block core user journeys.
- First-party passenger app/web, AV/ODD sandbox, or Phase 2 autonomous vehicle features.

### 2.3 Surfaces that must stay stopped

- **Partner Booking remains paused**: Both `/ctbc/program/site` and `/ctbc/program/embed` continue returning HTTP 404 and are not deployed.
- **Concierge Portal remains retired**: Continues returning HTTP 404 and is decommissioned.

---

## 3. Evidence baseline

| Evidence                                                                                    | Result                                 | What it proves                                                                                                       |
| :------------------------------------------------------------------------------------------ | :------------------------------------- | :------------------------------------------------------------------------------------------------------------------- |
| **CI integration trunk (PR #1451)**                                                         | `success` (22/22 checks)               | Lint, typecheck, unit, integration, i18n, IAM matrix, and build pipelines pass on clean candidate.                   |
| **Hermetic API/business E2E** (`run-e2e-hermetic.sh all`)                                   | `22/22 passed` (100%)                  | Core business domain state machines, revenue share, dispatch, and driver lifecycles pass in harness.                 |
| **Deterministic UI route suite** (`deterministic-route-suite.spec.ts`)                      | `39/39 passed` (100%)                  | All active web routes render cleanly across viewports and locales without console or route errors.                   |
| **Operational browser acceptance suite** (`operational-browser-acceptance.spec.ts`)         | `7/7 journeys passed`                  | Cross-surface user mutations, artifact downloads, intent routing, and 404 checks pass against candidate.             |
| **Android driver journey replay** (`s1f-drv-001-android-driver-journey-replay-evidence.md`) | `5/5 E2E legs + 26 unit suites passed` | Driver auth, task inbox, accept, trip flow, photo proof, offline replay, and SOS pass with API readback.             |
| **Dev deploy run `31997270480` / SHA `4012b10c0`**                                          | `success`                              | Cloud Run containers, migrations, public health checks, and candidate SHA headers (`x-drts-candidate-sha`) verified. |
| **Deployed UI route & 404 smoke**                                                           | `passed`                               | 8 active web surfaces return HTTP 200; paused Partner Booking and retired Concierge return HTTP 404.                 |

---

## 4. Surface status

| Surface                    | Runtime  | Functional status                                                                                                                             | Decision                         |
| :------------------------- | :------: | :-------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------- |
| **API**                    |  `200`   | Core business & BFF APIs fully implemented, tested, and healthy.                                                                              | **CLOSED** (Acceptance consumer) |
| **Ops Console**            |  `200`   | Dispatch board, incident triage, maintenance, approvals, and SOS receipt readback operational.                                                | **CLOSED** (Operational)         |
| **Tenant Console**         |  `200`   | Corporate governance, employee dispatch management, audit trail, and cross-app Ops intent operational.                                        | **CLOSED** (Operational)         |
| **Platform Admin**         |  `200`   | Supply review queue/detail, revision/approve provisioning, and truthful states verified (S1F-ADM-001, S1F-ADM-002).                           | **CLOSED** (Operational)         |
| **Fleet Partner Portal**   |  `200`   | Valid fleet scope (`fleet-demo-001`), supply onboarding UI, document upload, and statement actions operational (S1F-FLT-001..003).            | **CLOSED** (Operational)         |
| **Referral Embed**         |  `200`   | Formal `/embed/yuhe-residence` controlled form, booking creation, active resume, cancel, rating, and receipts operational (S1F-REF-001..002). | **CLOSED** (Operational)         |
| **Enterprise Dispatch**    |  `200`   | Semantic inputs, live passenger/address/cost-center binding, create-read-update-cancel lifecycle operational (S1F-ENT-001..002).              | **CLOSED** (Operational)         |
| **Bank Console**           |  `200`   | Scoped live Dev read models for bookings, programs, contracts, and authenticated statement downloads operational (S1F-BANK-001..002).         | **CLOSED** (Operational)         |
| **Channel Partner Portal** |  `200`   | Formal Yuhe residence identity bound (`yuhe-residence`) and referral statement downloads operational (S1F-CHAN-001).                          | **CLOSED** (Operational)         |
| **Driver App**             | `native` | Android emulator replay of auth, inbox, accept, start, complete with proof, offline replay, and SOS operational (S1F-DRV-001).                | **CLOSED** (Operational)         |
| **Partner Booking**        |  `404`   | Intentionally paused on `/ctbc/program/site` and `/ctbc/program/embed`.                                                                       | **FROZEN** (HTTP 404 verified)   |
| **Concierge Portal**       |  `404`   | Decommissioned and retired.                                                                                                                   | **FROZEN** (HTTP 404 verified)   |

---

## 5. Confirmed functional gaps — Closeout Evidence & Status

### GAP-S1F-REF — Referral Embed does not execute a booking lifecycle

- **Priority:** P0
- **Status:** **CLOSED**
- **Closeout Tasks:** `S1F-REF-001` (PR #1335, commit `690f734d8`), `S1F-REF-002` (PR #1377, commit `da30c8236`)
- **Implemented & Proven Capabilities:**
  - Replaced fixture booking state with semantic controlled inputs matching `docs/05-ui/drts-design-canvas/Passenger Embed.html`.
  - Wired booking submission at `/embed/yuhe-residence` to the referral BFF (`apps/referral-embed-web/app/api/referral/`).
  - Implemented active trip status tracking, refresh resume, booking cancellation, 5-star rating submission, and receipt viewing.
  - Asserted live API readback in operational browser acceptance suite (`referral-create-read-cancel-rate-receipt`).

### GAP-S1F-ENT — Enterprise Dispatch submits fixed fixture data

- **Priority:** P0
- **Status:** **CLOSED**
- **Closeout Tasks:** `S1F-ENT-001` (PR #1343, commit `e46023c03`), `S1F-ENT-002` (PR #1356, commit `37b0e2f23`)
- **Implemented & Proven Capabilities:**
  - Converted `EInput` and segment controls into semantic HTML form elements with controlled React state matching `Enterprise Dispatch.html`.
  - Dynamic loading of scoped passenger identities, addresses, cost centers, and policy/quota preview.
  - Eliminated `getEnterpriseBookingCommandFixture()` from production submission paths; submits user input to tenant booking command API.
  - Implemented full booking lifecycle: create, list (`/bookings`), detail, edit, and cancellation with API readback (`enterprise-create-read-update-cancel`).

### GAP-S1F-FLT — Fleet Partner cannot onboard supply through the portal

- **Priority:** P0
- **Status:** **CLOSED**
- **Closeout Tasks:** `S1F-FLT-001` (PR #1329, commit `21e253469`), `S1F-FLT-002` (PR #1341, commit `f9f33a045`), `S1F-FLT-003` (PR #1350, commit `7b0ce4018`)
- **Implemented & Proven Capabilities:**
  - Bound Dev environment to valid fleet partner identity `fleet-demo-001` and dynamic current period; removed `flp_002` 404 fallback.
  - Removed "design sample data" declarations; rendered live driver, vehicle, trip, and statement read models.
  - Built supply onboarding UI (`/supply`) supporting driver and vehicle creation, document upload intent, confirm, and deletion.
  - Implemented submit, withdraw, and revision/resubmit lifecycle transitions.
  - Wired statement viewing, authenticated CSV download, statement confirmation, and dispute actions (`fleet-submit-read-withdraw-resubmit`).

### GAP-S1F-ADM — Platform Admin supply review and truthful failure states

- **Priority:** P0 for supply review; P1 for truthfulness cleanup
- **Status:** **CLOSED**
- **Closeout Tasks:** `S1F-ADM-001` (PR #1383, commit `594143120`), `S1F-ADM-002` (PR #1348, commit `674d70c69`)
- **Implemented & Proven Capabilities:**
  - Built supply review queue (`/supply-review`) and submission detail view matching `platform-supply-review.jsx`.
  - Implemented start review, request revisions, approve, and reject operations backed by admin supply APIs.
  - Automated canonical registry provisioning upon approval; pre-approval submissions remain quarantined.
  - Removed route-local fallback fixtures and inert alert-only buttons; added honest loading, empty, forbidden, and degraded states (`admin-review-approve-readback`).

### GAP-S1F-BANK — Bank Console is a static demonstration

- **Priority:** P1
- **Status:** **CLOSED**
- **Closeout Tasks:** `S1F-BANK-001` (PR #1351, commit `8d6346c97`), `S1F-BANK-002` (PR #1355, commit `6a31e4012` / `820f53d04`)
- **Implemented & Proven Capabilities:**
  - Replaced static June 2026 demo arrays with live scoped API read models for bookings, program usage, contracts, statements, users, and audit logs.
  - Implemented authenticated statement downloads (`/statements`) returning non-empty CSV attachments.
  - Enforced role capability boundaries and masked PII; retained paused state for cardholder booking (`bank-statement-download`).

### GAP-S1F-CHAN — Channel Portal is attached to the demo entry

- **Priority:** P1
- **Status:** **CLOSED**
- **Closeout Tasks:** `S1F-CHAN-001` (PR #1362, commit `bc6579dc1`)
- **Implemented & Proven Capabilities:**
  - Resolved and injected formal Yuhe partner, tenant, program, and entry configuration (`yuhe-residence`).
  - Removed demo partner fallbacks in deployed Dev; missing configuration produces explicit error state.
  - Reconciled Referral Embed booking volume and revenue-share statements under the formal partner scope (`channel-statement-download`).

### GAP-S1F-UAT — Current smoke does not prove operations

- **Priority:** P0 release gate
- **Status:** **CLOSED**
- **Closeout Tasks:** `S1F-UIX-001` (PR #1386, commit `5ef825968`), `S1F-REL-001` (PR #1451, commit `4012b10c0`), `S1F-DOC-001`
- **Implemented & Proven Capabilities:**
  - Created deterministic cross-surface operational browser acceptance suite (`tests/e2e/operational-browser-acceptance.spec.ts`) executing 7 formal journeys.
  - Validated API response IDs and subsequent readback for all JSON mutations.
  - Verified authenticated artifact downloads and least-privilege cross-app intent links.
  - Automated retired/paused surface assertions confirming HTTP 404 for Partner Booking and Concierge Portal.
  - Integrated into GitHub Actions `deploy-dev.yml` (`operational-candidate-acceptance` job) and bound to `x-drts-candidate-sha`.

### GAP-S1F-DRV — Driver native evidence is not tied to the current release SHA

- **Priority:** P1 acceptance gate
- **Status:** **CLOSED**
- **Closeout Tasks:** `S1F-DRV-001` (PR #1331, commit `6a43f1a9a` / `048a5d328`)
- **Implemented & Proven Capabilities:**
  - Replayed complete Android Driver lifecycle in emulator against candidate SHA: device auth, task inbox, accept, depart, arrive, start, complete with photo proof, offline heartbeat replay, and SOS incident reporting.
  - Verified operator/API readback in Ops Console, Tenant Portal, and Billing modules.
  - Published comprehensive evidence pack in `docs/04-uat/s1f-drv-001-android-driver-journey-replay-evidence.md`.

---

## 6. Minimum security and safety bar

All required Stage 1 security and safety controls are verified:

- **Authentication & Sessions**: Login, sign-out, and expired session recovery verified across active BFF boundaries.
- **Tenant & Partner Isolation**: Server-side scoping enforced for all reads, mutations, and statement exports.
- **Zero Browser Secrets**: No shared secrets or API keys exposed in browser code, URLs, or client storage.
- **BFF CSRF & Session Guards**: Cookie-backed sessions and CSRF protection enforced across all web entry points.
- **Append-Only Audit Trails**: Audit records created for create, update, cancel, submit, review, approve, reject, and dispute actions.
- **Explicit Scope Failure**: Absent tenant/partner scope configurations produce visible error states instead of defaulting to demo accounts.

---

## 7. Completion gates

| Gate                       | Requirement                                                                                   | Verification Evidence                                                                                                    |  Status  |
| :------------------------- | :-------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------- | :------: |
| **G1 Active data truth**   | No active UI shows fixture/preview rows while its API is healthy.                             | Operational browser journey suite rejects sample data/fixture markers across all active routes.                          | **PASS** |
| **G2 Action truth**        | Every enabled control performs a request/download/navigation with result/error state.         | 7 formal operational browser journeys verify live HTTP requests, artifact downloads, and intent navigation.              | **PASS** |
| **G3 Lifecycle truth**     | Create, update, cancel, submit, and approve operations survive refresh and readback.          | Hermetic E2E tests (`001`, `002`, `006`, `012`, `019`) and Playwright readback specs validate state persistence.         | **PASS** |
| **G4 Cross-surface truth** | Formal Referral and Fleet supply records are visible in downstream scoped surfaces.           | Cross-surface integration verified between Referral Embed -> Channel Portal, and Fleet Portal -> Platform Admin.         | **PASS** |
| **G5 Native truth**        | Current-SHA Android emulator journey passes.                                                  | Full mobile lifecycle replayed and verified (`docs/04-uat/s1f-drv-001-android-driver-journey-replay-evidence.md`).       | **PASS** |
| **G6 Runtime truth**       | Exact accepted SHA is verified across CI and all active services pass health plus operations. | PR #1451 CI passing (22/22 checks) and Candidate SHA header propagation (`x-drts-candidate-sha`) bound.                  | **PASS** |
| **G7 Frozen surfaces**     | Partner Booking and Concierge remain stopped with HTTP 404.                                   | Automated Playwright suite confirms HTTP 404 on `/ctbc/program/site`, `/ctbc/program/embed`, and Concierge URLs.         | **PASS** |
| **G8 Regression truth**    | Existing 22/22 API E2E, 39-route suite, build/typecheck, and deployed smoke stay green.       | Executed and green: `run-e2e-hermetic.sh all` (22/22), `deterministic-route-suite.spec.ts` (39/39), and full typechecks. | **PASS** |

---

## 8. Operator Matrix of URL, Role, Supported Operations, and Known External Gates

| App / Surface              | Deployed Dev URL                                                                                                                                         | Primary User Role(s)                                    | Supported Operations & Workflows                                                                                                                                                                                                                         | Known External Gates & Out-of-Scope Boundaries                                                                                            |
| :------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------- |
| **API**                    | `https://drts-dev-api-4t7rg6fmeq-uc.a.run.app`                                                                                                           | System / BFF / Background Workers                       | Core REST/BFF endpoints, health check (`/api/health`), booking lifecycle, dispatch state machine, driver heartbeat ingestion, supply review, billing calculations, audit logs.                                                                           | Real bank issuer API credentials; Grab external dispatch forwarder; Live CTI telephony integration.                                       |
| **Platform Admin**         | `https://drts-dev-platform-admin-web-4t7rg6fmeq-uc.a.run.app`                                                                                            | `platform_admin`                                        | Supply review queue (`/supply-review`), diff review, request revisions, approve/reject supply, canonical registry provisioning, partner governance (`/partners`, `/partners/[entrySlug]`, `/partners/referral`), rate rule admin, tenant administration. | Two-person break-glass rule campaigns (Stage 1.5); Automated commercial contract e-signing.                                               |
| **Ops Console**            | `https://drts-dev-ops-console-web-4t7rg6fmeq-uc.a.run.app`                                                                                               | `ops_dispatcher`, `ops_manager`, `complaint_specialist` | Live dispatch board, manual dispatch assignment/override, incident tracking and SOS receipt resolution (`/incidents`), vehicle maintenance status, driver real-time status tracking, manual booking adjustments.                                         | Real-world GPS cellular hardware telematics (simulated via heartbeat ingest); Live CTI telephony integration.                             |
| **Tenant Console**         | `https://drts-dev-tenant-console-web-4t7rg6fmeq-uc.a.run.app`                                                                                            | `tenant_admin`, `tenant_booking_manager`                | Corporate employee booking management, cost-center quota configuration, booking audit trail, cross-app dispatch detail intent link, tenant user role assignments.                                                                                        | Corporate SSO/SAML IDP integration (dev uses mock OIDC/BFF session); ERP accounting sync.                                                 |
| **Enterprise Dispatch**    | `https://drts-dev-enterprise-dispatch-web-4t7rg6fmeq-uc.a.run.app`                                                                                       | Corporate Commuter / `employee`, `tenant_admin`         | Controlled booking request form (`/bookings/new`), passenger/address/cost-center selection, quota/policy preview, booking list (`/bookings`), booking detail & edit, cancellation.                                                                       | Internal enterprise intranet portal iframe embedding; Production corporate LDAP/AD directory sync.                                        |
| **Fleet Partner Portal**   | `https://drts-dev-fleet-partner-portal-web-4t7rg6fmeq-uc.a.run.app`                                                                                      | `fleet_partner` (scoped to `fleet-demo-001`)            | Fleet dashboard, driver & vehicle supply onboarding (`/supply`), document upload intent/confirmation/deletion, supply submission/withdrawal/resubmission, driver fee plan & trips summary, statement viewing/download/confirm/dispute.                   | Live bank payout clearinghouse; Automated DMV / regulatory driver license verification API.                                               |
| **Referral Embed**         | `https://drts-dev-referral-embed-web-4t7rg6fmeq-uc.a.run.app/embed/yuhe-residence`<br>_(Custom: `https://refer.smarttransport.tw/embed/yuhe-residence`)_ | Community Resident / Referral Passenger                 | Formal partner entry (`/embed/yuhe-residence`), origin/destination input, vehicle type selection, fare calculation, booking creation, active trip status tracking & resume, trip cancellation, 5-star rating submission, ride receipt viewing.           | Third-party property management mobile app native webview container (`app.yuhe-living.com.tw`); Credit card payment gateway tokenization. |
| **Channel Partner Portal** | `https://drts-channel-partner-portal-web-4t7rg6fmeq-uc.a.run.app`<br>_(Custom: `https://channel.smarttransport.tw`)_                                     | `channel_partner` (scoped to formal `yuhe-residence`)   | Partner dashboard (`/dashboard`), referral ride volume & commission usage analytics (`/usage`), settlement statement downloads (`/statements` in CSV/PDF), channel entry configuration preview.                                                          | Live tax invoice filing / Taiwan GUI issuance; Bank wire clearing system.                                                                 |
| **Bank Console**           | `https://drts-dev-bank-console-web-4t7rg6fmeq-uc.a.run.app`                                                                                              | `bank_program_admin`, `bank_auditor`                    | Issuing bank cardholder airport transfer program dashboard, scoped booking transaction list and detail, program quota & usage metrics, contract terms view, authenticated monthly settlement statement downloads (`/statements`), masked audit log.      | Core banking ledger API; Issuer-owned cardholder privilege validation / KYC engine.                                                       |
| **Driver App**             | _Native Expo/React Native Android build_                                                                                                                 | `driver`                                                | Device authentication and binding, task inbox view, task acceptance, departure and arrival timestamp logging, trip initiation, trip completion with photo proof sign-off, offline heartbeat batch queuing and replay, SOS emergency event broadcast.     | Google Play Store / Apple App Store public release & enterprise MDM; Cellular MDT hardware integration.                                   |
| **Partner Booking**        | _PAUSED (`404`)_                                                                                                                                         | _N/A (Intentionally paused)_                            | None (All routes return HTTP 404; paused pending bank cardholder digital channel cutover).                                                                                                                                                               | Bank issuer mobile app deep-linking agreement.                                                                                            |
| **Concierge Portal**       | _RETIRED (`404`)_                                                                                                                                        | _N/A (Decommissioned)_                                  | None (Retired / removed from active deployments).                                                                                                                                                                                                        | N/A.                                                                                                                                      |

---

## 9. Traceability & Lineage Ledger

| Task ID          | Component / Focus                                        | Owning GAP   | PR / Branch | Commit / Reviewed SHA |  Owner  | Reviewer |    Status     |
| :--------------- | :------------------------------------------------------- | :----------- | :---------- | :-------------------- | :-----: | :------: | :-----------: |
| **S1F-REF-001**  | Referral Embed form wiring                               | GAP-S1F-REF  | PR #1335    | `690f734d8`           | Gemini  |  Codex   |    `done`     |
| **S1F-REF-002**  | Referral active/history/cancel/rating                    | GAP-S1F-REF  | PR #1377    | `da30c8236`           |  Codex  |  Gemini  |    `done`     |
| **S1F-ENT-001**  | Enterprise Dispatch semantic inputs                      | GAP-S1F-ENT  | PR #1343    | `e46023c03`           | Claude  |  Gemini  |    `done`     |
| **S1F-ENT-002**  | Enterprise booking lifecycle                             | GAP-S1F-ENT  | PR #1356    | `37b0e2f23`           |  Codex  | Gemini2  |    `done`     |
| **S1F-FLT-001**  | Fleet Dev identity & fee plan                            | GAP-S1F-FLT  | PR #1329    | `21e253469`           | Gemini  |  Codex   |    `done`     |
| **S1F-FLT-002**  | Fleet supply onboarding UI                               | GAP-S1F-FLT  | PR #1341    | `f9f33a045`           |  Codex  | Gemini2  |    `done`     |
| **S1F-FLT-003**  | Fleet operational actions & statements                   | GAP-S1F-FLT  | PR #1350    | `7b0ce4018`           |  Codex  |  Gemini  |    `done`     |
| **S1F-ADM-001**  | Platform supply review UI & approval                     | GAP-S1F-ADM  | PR #1383    | `594143120`           | Gemini  |  Codex   |    `done`     |
| **S1F-ADM-002**  | Platform Admin truthful states & cleanup                 | GAP-S1F-ADM  | PR #1348    | `674d70c69`           | Gemini  | Gemini2  |    `done`     |
| **S1F-BANK-001** | Bank Console scoped live read models                     | GAP-S1F-BANK | PR #1351    | `8d6346c97`           | Claude  |  Gemini  |    `done`     |
| **S1F-BANK-002** | Bank statement downloads & role actions                  | GAP-S1F-BANK | PR #1355    | `6a31e4012`           | Gemini  |  Codex   |    `done`     |
| **S1F-CHAN-001** | Channel Portal Yuhe residence binding                    | GAP-S1F-CHAN | PR #1362    | `bc6579dc1`           | Gemini2 |  Gemini  |    `done`     |
| **S1F-DRV-001**  | Android Driver journey replay evidence                   | GAP-S1F-DRV  | PR #1331    | `6a43f1a9a`           | Gemini  |  Codex   |    `done`     |
| **S1F-UIX-001**  | Cross-surface operational browser suite                  | GAP-S1F-UAT  | PR #1386    | `5ef825968`           | Gemini2 |  Codex   |    `done`     |
| **S1F-REL-001**  | Release candidate integration & verification             | GAP-S1F-UAT  | PR #1451    | `4012b10c0`           | Gemini  | Gemini2  |    `done`     |
| **S1F-DOC-001**  | Publish final Stage 1 functional truth & operator matrix | GAP-S1F-UAT  | Current     | HEAD                  | Gemini2 |  Claude  | `in_progress` |
