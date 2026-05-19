# Phase 1 `origin/dev` Execution Worklist

**Date:** 2026-05-19
**Audience:** system development team, delivery lead, QA lead, DevOps lead
**Scope:** Phase 1 taxi / business-dispatch / partner-channel / multi-platform-driver system
**Baseline:** `ajoe734/drts-fleet-platform@origin/dev` as inspected on 2026-05-19
**Purpose:** convert the system-design gap review into executable development work. This is not a discussion prompt. It is the implementation task list required to close Phase 1 business-flow gaps.

> **Filed by:** Claude on 2026-05-19 as part of the Phase 1 v2 wave (PR #156).
> **Companion runbook:** [phase1-v2-execution-wave-planning-20260519.md](../03-runbooks/phase1-v2-execution-wave-planning-20260519.md)
> **Authority hierarchy:** the wave planning runbook is operational state (which agent, which dependency). This worklist is the system-design rationale (why each task exists, what acceptance bar to use). Both must stay in sync.

---

## 0. System-design ruling

The current `origin/dev` branch has completed a large amount of repo-local implementation and UI redesign work. The remaining work is not more isolated UI polishing. The remaining work is **business-flow closure**.

Phase 1 completion must be judged by workflow-family gates, not by page closeout or backend-contract closeout alone.

The development team shall treat the following as the Phase 1 completion model:

```text
Tenant / partner demand entry
→ tenant governance
→ booking creation / update
→ approval / quota evaluation
→ dispatch or forwarder routing
→ driver task / platform workbench
→ trip completion / proof
→ platform earnings / settlement
→ tenant billing / reports
→ audit / evidence / filing
→ staging / production deploy evidence
```

---

## 1. Current `origin/dev` status summary

### 1.1 Confirmed progress

`origin/dev` is ahead of `main` and carries the current UI-redesign and governance work. It includes:

- Tenant Governance contracts and closeout documents.
- Tenant Console redesign closeout.
- Platform Admin redesign closeout.
- Driver App redesign closeout.
- A repo-local `apps/partner-booking-web` white-label surface.
- Updated branch strategy: nightly publish, hourly promote, manual staging / production deploy rails.

### 1.2 Main remaining gap pattern

The gap is no longer "missing modules." The gap is:

1. Some flows are complete in repo-local code but not yet represented as formal workflow-family release gates.
2. Some flows are UI/contract complete but not yet proven in staging E2E.
3. Some flows remain external-gated: third-party platform, issuer / bank, CTI provider, mobile distribution, production deployment.
4. Some documents have time drift between older closeout packets and newer `origin/dev` reality.

---

## 2. Execution rules for the development team

### Rule 1 — No new product semantics in UI

Tenant Console, Partner Booking, Platform Admin, and Driver App may consume contracts. They must not define new business truth.

### Rule 2 — No release claim without workflow-family gate

A task is not Phase 1 complete merely because a page, route, or backend type exists. Completion requires a named workflow-family gate and verification path.

### Rule 3 — Repo-local done is not production done

Repo-local, static evidence, live staging evidence, external-gated, pilot-gated, and production-gated must be separately labeled.

### Rule 4 — Partner booking UI is not production cutover

`apps/partner-booking-web` is the repo-local partner booking surface. It does not replace the current live partner mode until a separate per-partner-entry cutover task is completed.

### Rule 5 — Driver App must remain a multi-platform workbench

Driver App work must prioritize platform presence, forwarded task visibility, route intent preservation, status sync, and platform-specific earnings. It must not become only an owned-dispatch trip executor.

---

## 3. Required workstreams

The following workstreams are required to close Phase 1. Each item includes a task ID, owner role, required deliverables, dependencies, and acceptance criteria.

---

# Workstream A — Dev-branch truth sync and release-gate correction

## A1. `SD-DEV-STATUS-001` — Produce current `origin/dev` status truth packet

**Owner:** System design / release engineering
**Reviewer:** QA lead + delivery lead
**Priority:** P0
**Dependencies:** none

### Deliverables

Create:

```text
docs/00-context/current-dev-branch-status-20260519.md
```

The document must consolidate:

- `current-work.md`
- Tenant Governance wave closeout
- Tenant Console redesign closeout
- Platform Admin redesign closeout
- Driver App redesign closeout
- Partner Booking cutover topology
- Branch strategy
- Current workflow acceptance matrix

### Acceptance criteria

- The file clearly states what is:
  - `repo-local done`
  - `review done`
  - `static evidence`
  - `live staging evidence`
  - `external-gated`
  - `pilot-gated`
  - `production-gated`
  - `deferred Phase 2`
- It resolves the date drift between 2026-05-14 Tenant Governance closeout and 2026-05-18 Tenant Console closeout.
- It explicitly states that `TEN-UI-RD-010`, `TEN-UI-RD-013`, `TEN-UI-RD-014`, and `TEN-UI-RD-099` are no longer to be treated as unresolved if machine truth says they are done.

---

## A2. `SD-GATE-001` — Add missing workflow-family gates

**Owner:** QA lead / backend lead
**Reviewer:** system design
**Priority:** P0
**Dependencies:** `SD-DEV-STATUS-001`

### Deliverables

Update:

```text
docs/03-runbooks/phase1-workflow-acceptance-release-gates.md
```

Add the following workflow families:

```text
WF-TGV-001       Tenant Governance Flow
WF-DRV-MP-001    Driver Multi-Platform Workbench
WF-PBK-001       Partner Booking Pilot Flow
WF-PARTNER-001   Partner Eligibility / Airport Transfer Flow
WF-PROD-001      Production Deploy Rail
```

Clarify or split existing families where needed:

```text
WF-FWD-001       Forwarded Order / External Platform Boundary
WF-COM-001       CTI / Recording / Filing
WF-FIN-001       Billing / Reporting / Sensitive Artifact Access
```

### Acceptance criteria

Each workflow family must include:

- what must be true
- named verification path
- current gate read
- remaining non-claim
- positive-path scenarios
- negative-path scenarios
- audit requirements
- required evidence level

---

# Workstream B — Tenant Governance business-flow closure

Tenant Governance has backend contracts and UI closeout on `origin/dev`. The remaining system-level work is to make it a formal business flow and prove it end to end.

## B1. `TGV-E2E-001` — Add Tenant Governance E2E

**Owner:** backend lead + QA lead
**Reviewer:** system design
**Priority:** P0
**Dependencies:** Tenant Governance contracts on `origin/dev`

### Deliverables

Create:

```text
tests/e2e/E2E-005-tenant-governance.sh
```

The E2E must execute:

```text
create tenant or use seeded tenant
→ create cost center
→ set tenant-level quota
→ set cost-center quota
→ create approval rule
→ create booking with costCenterCode
→ quota preview
→ approval evaluation
→ approval request created
→ approve request
→ booking released to dispatch
→ dispatch assignment
→ trip completion
→ invoice / report generation
→ audit trail validation
```

### Acceptance criteria

- Runs against local API and staging API.
- Fails if cost-center attribution is missing from billing/report output.
- Fails if approval evaluation does not create or resolve an approval request.
- Fails if quota ledger is not written.
- Fails if audit events are missing.

---

## B2. `TGV-NEG-001` — Add Tenant Governance negative-path tests

**Owner:** QA lead
**Reviewer:** backend lead
**Priority:** P0
**Dependencies:** `TGV-E2E-001`

### Required scenarios

1. Unknown cost center rejected.
2. Disabled cost center rejected.
3. Cross-tenant cost center rejected.
4. Hard quota exceeded returns `QUOTA_INSUFFICIENT_AT_COMMIT`.
5. Approval rule block action prevents booking release.
6. No resolvable approver rolls back booking transaction.
7. Update booking re-triggers approval when governance-sensitive fields change.
8. Update booking does not re-trigger approval for notes-only change.
9. Approval rejection prevents dispatch.
10. Approval timeout escalation is visible to tenant admin / ops.

### Acceptance criteria

- Tests run under `pnpm phase1:verify:uat` or equivalent rollout verification.
- Each denial creates audit evidence.
- UI-facing error codes are documented in API examples.

---

## B3. `TGV-REPORT-001` — Governance-aware billing and reporting evidence

**Owner:** finance/reporting backend lead
**Reviewer:** QA lead
**Priority:** P0
**Dependencies:** `TGV-E2E-001`

### Deliverables

Update billing and reporting verification to prove:

- cost center code appears in invoice/report rows
- cost center display name appears when directory match exists
- legacy unmapped cost center is flagged
- approval state and approval request ID are available for report drilldown
- quota period and usage impact can be reconciled to booking

### Acceptance criteria

- Add or update report fixture proving cost center attribution.
- Add or update invoice fixture proving governance-aware billing.
- Add audit proof for report download.

---

# Workstream C — Driver Multi-Platform Workbench closure

Driver App UI has been redesigned, but Phase 1 commercial value depends on multi-platform driver workbench behavior.

## C1. `DRV-MP-E2E-001` — Add Driver Multi-Platform Workbench E2E

**Owner:** mobile lead + backend lead
**Reviewer:** QA lead
**Priority:** P0
**Dependencies:** platform presence + platform earnings + forwarded task mirror

### Deliverables

Create:

```text
tests/e2e/E2E-006-driver-multi-platform.sh
```

The E2E must execute:

```text
register / authenticate driver
→ bind platform account A
→ set platform A online
→ set platform B offline
→ create forwarded platform task
→ driver sees sourcePlatform badge
→ driver sees routeLocked / route intent
→ driver accepts task
→ accept relay recorded
→ status sync recorded
→ trip completion recorded
→ platform-specific earnings generated
```

### Acceptance criteria

- E2E fails if route override is allowed on forwarded task.
- E2E fails if forwarded task creates owned dispatch assignment.
- E2E fails if platform earnings are not separated by source platform.
- E2E fails if online/offline state is ignored.

---

## C2. `DRV-DEVICE-001` — Real-device mobile verification

**Owner:** mobile lead
**Reviewer:** QA lead
**Priority:** P0
**Dependencies:** Driver App build pipeline

### Deliverables

Create:

```text
docs/04-uat/driver-mobile-real-device-test-report-202605xx.md
```

Must cover:

- Android real device install proof
- iPhone real device install proof
- login / device binding
- platform presence toggle
- task notification
- task accept / reject
- route intent screen
- proof upload
- earnings by platform
- weak network behavior

### Acceptance criteria

- At least one Android and one iPhone test pass recorded.
- Screenshots or video evidence captured.
- Any failed device-specific behavior becomes a tracked issue.

---

## C3. `DRV-DIST-001` — Mobile distribution gate

**Owner:** mobile lead + DevOps
**Reviewer:** release engineering
**Priority:** P0
**Dependencies:** `DRV-DEVICE-001`

### Deliverables

- Expo / EAS account configured or equivalent native distribution configured.
- Android signing configured.
- Apple team configured.
- Tester groups configured.
- Install evidence captured.

### Acceptance criteria

- Driver App can be distributed to named testers without local developer machine.
- Release channel ownership and rollback procedure documented.

---

# Workstream D — Forwarder / third-party platform proof

Forwarder remains the commercial core of the platform. It must be proven beyond repo-local guardrails.

## D1. `FWD-SBX-001` — Implement first external-platform sandbox proof harness

**Owner:** integration backend lead
**Reviewer:** QA lead
**Priority:** P0
**Dependencies:** Forwarder module

### System-design decision

If a real third-party platform sandbox is not yet available, implement a **Generic Forwarder Sandbox Provider** that behaves like a real external platform for staging proof. This does not replace real partner proof, but it gives the team deterministic integration coverage.

### Deliverables

Create provider / harness for:

- inbound order webhook
- route intent / waypoint payload
- broadcast offer
- accept callback
- lost race callback
- cancellation callback
- completion callback
- settlement sample file

### Acceptance criteria

- Harness is clearly labeled as sandbox, not production partner.
- E2E can run without external credentials.
- Payloads mirror the intended external adapter contract.

---

## D2. `FWD-E2E-001` — Convert forwarded-order gate from external-gated to sandbox-proven

**Owner:** integration backend lead
**Reviewer:** QA lead
**Priority:** P0
**Dependencies:** `FWD-SBX-001`, `DRV-MP-E2E-001`

### Deliverables

Update:

```text
tests/e2e/E2E-002-forwarded-order.sh
```

The test must prove:

```text
external order inbound
→ mirror stored
→ driver task visible
→ routeLocked enforced
→ accept relay emitted
→ external confirmation received
→ cancellation / lost race handled
→ status sync handled
→ settlement row generated
→ no owned dispatch assignment created
```

### Acceptance criteria

- `WF-FWD-001` can be updated from `EXTERNAL-GATED` to `PASS (sandbox evidence)`.
- Real partner credential proof remains separately marked as required for production.

---

## D3. `FWD-LIVE-001` — Real provider proof packet

**Owner:** integration lead + business partnership owner
**Reviewer:** system design + QA lead
**Priority:** P1, production-gate required

### Deliverables

Create:

```text
support/sidecars/FWD-LIVE-001/FWD-LIVE-001-PROVIDER-PROOF.md
```

Must include:

- provider name
- contract/API version
- sandbox or production credential class
- inbound order sample
- accept/lost race/cancel/complete samples
- signature verification evidence
- idempotency evidence
- settlement sample

### Acceptance criteria

- Without this packet, no production claim for third-party forwarded orders is allowed.

---

# Workstream E — Partner Eligibility and Partner Booking pilot

`apps/partner-booking-web` exists as repo-local UI, but it is not production cutover. Partner mode remains live elsewhere until explicit cutover.

## E1. `PBK-LIVE-PLAN-001` — Partner Booking live cutover plan

**Owner:** release engineering + partner-channel product owner
**Reviewer:** system design
**Priority:** P0

### Deliverables

Create:

```text
docs/03-runbooks/partner-booking-live-cutover-plan-202605xx.md
```

For each pilot partner entry, define:

- entrySlug
- current live owner
- target surface
- cutoverOwner
- rollbackOwner
- rollback route / host
- support hotline
- branding metadata
- eligibility mode
- monitoring dashboard
- pilot date
- rollback retention window

### Acceptance criteria

- No partner entry can cut over without this plan.
- Cutover unit is partner entry, not whole tenant.

---

## E2. `PBK-BFF-001` — Wire partner-booking-web to backend authority

**Owner:** frontend lead + backend lead
**Reviewer:** QA lead
**Priority:** P0
**Dependencies:** Partner entry APIs

### Deliverables

`apps/partner-booking-web` must use backend authority for:

- entry resolution
- branding metadata
- eligibility verification
- booking creation
- confirmation state
- trip tracking
- receipt / partner record view

### Acceptance criteria

- No mock-only UI state is used for pilot flow.
- Unknown partner slug returns proper not-found or inactive state.
- Eligibility errors use canonical backend error codes.

---

## E3. `PBK-E2E-001` — Partner Booking pilot E2E

**Owner:** QA lead
**Reviewer:** frontend lead + backend lead
**Priority:** P0
**Dependencies:** `PBK-BFF-001`

### Required flow

```text
open partner landing page
→ resolve partner entry
→ run eligibility verification
→ create airport-transfer booking
→ show confirmation
→ show trip status
→ show receipt / partner record
→ verify audit
→ verify billing/report linkage
```

### Negative paths

1. inactive partner entry
2. ineligible card/reference
3. manual review state
4. missing flight number for airport pickup
5. revoked partner key / invalid session

### Acceptance criteria

- `WF-PBK-001` can be marked `PASS (staging evidence)` for the pilot entry.

---

# Workstream F — CTI / recording / filing activation

## F1. `COM-CTI-SBX-001` — CTI sandbox webhook harness

**Owner:** backend lead
**Reviewer:** QA lead
**Priority:** P1

### Deliverables

Implement or configure sandbox callbacks for:

- call started
- call ended
- recording pending
- recording ready
- recording failed

### Acceptance criteria

- Call center can create phone booking with call ID.
- Recording pending flag is visible.
- Recording-ready callback attaches recording ID.
- Missing recording remains visible as compliance flag.

---

## F2. `COM-E2E-003` — Phone recording filing E2E

**Owner:** QA lead
**Reviewer:** compliance / backend lead
**Priority:** P1
**Dependencies:** `COM-CTI-SBX-001`

### Deliverables

Create or automate:

```text
tests/e2e/E2E-003-phone-recording-filing.sh
```

Must verify:

```text
CTI call
→ call session
→ phone booking
→ recording pending
→ recording callback
→ recording index export
→ filing package artifact
→ retention metadata
→ permissioned download audit
```

### Acceptance criteria

- `WF-COM-001` moves from `HOLD` to at least `PASS (sandbox evidence)`.

---

# Workstream G — Finance and settlement completion

## G1. `FIN-GOV-001` — Governance-aware billing and reporting E2E

**Owner:** finance backend lead
**Reviewer:** QA lead
**Priority:** P0
**Dependencies:** `TGV-E2E-001`

### Deliverables

Extend finance/report tests to include:

- cost center code
- cost center display name
- approval request ID
- quota period
- partner program code
- source platform
- driver platform earnings

### Acceptance criteria

- Enterprise tenant can reconcile bookings by cost center.
- Partner can reconcile bookings by partner program.
- Driver earnings are separable by source platform.
- Report export and invoice export are consistent.

---

## G2. `FIN-FWD-001` — External platform settlement sample integration

**Owner:** finance backend lead + integration lead
**Reviewer:** QA lead
**Priority:** P1
**Dependencies:** `FWD-SBX-001`

### Deliverables

- settlement sample parser
- mapped platform earnings rows
- reconciliation report
- mismatch detection

### Acceptance criteria

- Imported settlement file produces platform earnings and reconciliation output.
- Mismatch creates review item.

---

# Workstream H — Production deploy rail completion

## H1. `PROD-INFRA-001` — Configure production GCP variables and WIF

**Owner:** DevOps lead
**Reviewer:** release engineering
**Priority:** P0

### Deliverables

Configure:

- `PROD_GCP_PROJECT_ID`
- `PROD_GCP_REGION`
- `PROD_GCP_CLOUDSQL_INSTANCE`
- `PROD_GCP_RUNTIME_SERVICE_ACCOUNT`
- `PROD_ARTIFACT_*` if needed
- `PROD_SECRET_PREFIX`
- `PROD_WIF_PROVIDER`
- `PROD_WIF_SERVICE_ACCOUNT`

### Acceptance criteria

- `deploy-prod.yml` validates production config without failing at config validation.

---

## H2. `PROD-DEPLOY-001` — Complete production deploy workflow

**Owner:** DevOps lead
**Reviewer:** release engineering + system design
**Priority:** P0
**Dependencies:** `PROD-INFRA-001`

### Deliverables

Complete:

```text
.github/workflows/deploy-prod.yml
```

with:

- tag validation
- image build / pull by tag
- Artifact Registry push or pull
- Cloud Run deploy for API and web services
- Cloud SQL connectivity
- Secret Manager mount / env resolution
- post-deploy smoke
- rollback command path

### Acceptance criteria

This command succeeds for a controlled dry run:

```bash
gh workflow run deploy-prod.yml -f tag=prod/vYYYY.MM.DD.N
```

Production environment must require manual reviewer approval.

---

## H3. `PROD-DRYRUN-001` — Production dry-run evidence packet

**Owner:** release engineering
**Reviewer:** delivery lead
**Priority:** P0
**Dependencies:** `PROD-DEPLOY-001`

### Deliverables

Create:

```text
support/sidecars/PROD-DRYRUN-001/PROD-DRYRUN-001-EVIDENCE.md
```

Include:

- selected prod tag
- deployed services
- Cloud Run revisions
- DB migration status
- smoke results
- rollback command tested
- reviewer approval record

### Acceptance criteria

- `WF-PROD-001` can move from production-gated to `PASS (production dry-run evidence)`.

---

# Workstream I — Tenant UI consumer / Lovable loop hardening

## I1. `TCH-CONTRACT-001` — Contract version lock and API delivery sync

**Owner:** frontend lead
**Reviewer:** backend lead
**Priority:** P0

### Deliverables

For `tenant-commute-hub` and any Lovable-driven tenant UI:

- update contract lock
- update backend delivery note
- enforce SDK version alignment
- reject builds with stale contract version

### Acceptance criteria

- UI cannot compile against outdated `@drts/contracts` / `@drts/api-client` if core contract changed.
- `.ai-loop/BACKEND_DELIVERY_NOTE.md` reflects Tenant Governance contracts.

---

## I2. `TCH-AUTHORITY-001` — BFF-only import enforcement

**Owner:** frontend lead
**Reviewer:** system design
**Priority:** P0

### Deliverables

- Remove or archive legacy direct-backend / Supabase artifacts if present.
- Add CI check that production UI code cannot import forbidden authority clients.
- Document allowed API client usage.

### Acceptance criteria

- No production tenant UI code imports legacy direct DB client.
- All production reads/writes go through BFF API client.

---

# Workstream J — QA and release evidence consolidation

## J1. `QA-MATRIX-001` — Business-flow verification dashboard

**Owner:** QA lead
**Reviewer:** delivery lead
**Priority:** P0

### Deliverables

Create:

```text
docs/04-uat/phase1-business-flow-verification-dashboard-202605xx.md
```

Include the current gate read for:

- WF-RLS-001
- WF-TEN-001
- WF-ORD-001
- WF-TGV-001
- WF-DSP-001
- WF-DRV-001
- WF-DRV-MP-001
- WF-FWD-001
- WF-PBK-001
- WF-PARTNER-001
- WF-COM-001
- WF-FIN-001
- WF-PROD-001

### Acceptance criteria

- Delivery lead can see at a glance what is complete, what is staging-only, what is sandbox-only, what is external-gated, and what is production-gated.

---

## J2. `QA-NEG-001` — Negative-path audit proof expansion

**Owner:** QA lead
**Reviewer:** compliance / backend lead
**Priority:** P1

### Deliverables

For every new workflow family added in this packet, define at least five negative-path cases and verify audit emission.

### Acceptance criteria

- Denials create user-visible errors.
- Denials create audit events.
- Escalations are visible to the relevant role.

---

# 4. Updated Phase 1 completion bar

Phase 1 is not complete until the following are all true:

| Gate                         | Required status                                                           |
| ---------------------------- | ------------------------------------------------------------------------- |
| Runtime / Deploy             | PASS live staging + production dry-run evidence                           |
| Tenant bootstrap / isolation | PASS live staging evidence                                                |
| Booking intake               | PASS live staging evidence                                                |
| Tenant Governance            | PASS live staging evidence                                                |
| Core Dispatch                | PASS live staging evidence                                                |
| Driver owned lifecycle       | PASS live staging or device evidence                                      |
| Driver multi-platform        | PASS real-device + sandbox forwarded evidence                             |
| Forwarder                    | PASS sandbox evidence, production claim blocked until real provider proof |
| Partner booking              | PASS pilot entry staging evidence                                         |
| Partner eligibility          | PASS sandbox / issuer evidence                                            |
| CTI / recording / filing     | PASS sandbox evidence, production claim blocked until provider proof      |
| Billing / reporting          | PASS governance-aware report evidence                                     |
| Production rail              | PASS controlled dry run                                                   |

---

# 5. Immediate sprint plan

## Sprint 1 — Evidence and gates

1. `SD-DEV-STATUS-001`
2. `SD-GATE-001`
3. `TGV-E2E-001`
4. `TGV-NEG-001`
5. `QA-MATRIX-001`

## Sprint 2 — Commercial-core proof

1. `DRV-MP-E2E-001`
2. `FWD-SBX-001`
3. `FWD-E2E-001`
4. `FIN-GOV-001`
5. `PBK-LIVE-PLAN-001`

## Sprint 3 — Partner / CTI / mobile distribution

1. `PBK-BFF-001`
2. `PBK-E2E-001`
3. `COM-CTI-SBX-001`
4. `COM-E2E-003`
5. `DRV-DEVICE-001`
6. `DRV-DIST-001`

## Sprint 4 — Production rail

1. `PROD-INFRA-001`
2. `PROD-DEPLOY-001`
3. `PROD-DRYRUN-001`
4. `FWD-LIVE-001` if external partner is available
5. `FIN-FWD-001`

---

# 6. Do not open these as Phase 1 tasks

The following are deliberately Phase 2 unless explicitly re-scoped:

- Real sequential `ordered_chain` approval execution.
- Automated approval timeout cron beyond manual escalation / stub.
- Cost-center hierarchy and inherited quota tree.
- Quarterly / yearly quota periods.
- Time-of-day / weekend / holiday rule conditions.
- CSV bulk upload for cost centers and quota policies.
- Self-driving showcase / autonomous availability condition UI.
- First-party general consumer passenger app.

---

# 7. Required reporting cadence

For each task above, development must report:

```text
Task ID
Owner
Reviewer
Current status
Branch / PR
Files changed
Verification command
Evidence artifact
Workflow family affected
Gate read before
Gate read after
Remaining non-claim
```

No task may be closed with only "build passed" or "UI looks done."

---

# 8. Final directive

The development team shall proceed by **workflow closure**, not by isolated page completion.

The top priority is:

```text
1. Tenant Governance E2E
2. Driver Multi-Platform E2E
3. Forwarder sandbox / external proof
4. Partner Booking pilot proof
5. CTI / Recording / Filing proof
6. Production deploy dry run
```

Once these six areas have named evidence, Phase 1 can be considered ready for pilot / production go-no-go review.
