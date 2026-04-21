# Current System Blueprint Alignment Audit

Date: 2026-04-21  
Method: code-first repo inspection cross-checked with current machine truth and
accepted planning / closeout documents.

## Scope

This audit answers one practical question:

> Does the current repository actually match the full Phase 1 system blueprint,
> or are we only telling ourselves that in docs?

The review used:

- root blueprint files (`phase1_prd_detailed_v1.md`, `phase1_system_analysis_v1.md`,
  `phase1_service_contracts_v1.md`, `phase1_migration_plan_v1.md`)
- live closeout truth (`ai-status.json`, `current-work.md`)
- code under `apps/*` and `apps/api/src/modules/*`
- current rollout / auth / UAT runbooks under `docs/03-runbooks` and `docs/04-uat`

## Executive Verdict

The repository is no longer a bootstrap-only shell. The core Phase 1 operator
system is substantially implemented in code, and the current execution board is
effectively closed except for one remaining product-critical blocker:
`GAP-P2S3-001` (Cloud IAP / OIDC JWT production cutover).

That said, "substantially aligned" is not the same as "perfectly complete."
The biggest remaining gaps are:

- auth cutover is not fully closed
- some backend slices still rely on seed/fallback behavior instead of durable
  source-of-truth persistence
- the forwarder adapter remains stubbed
- driver-task SSE is still single-instance in-memory
- passenger / concierge / AV live-board surfaces remain explicitly deferred or
  future-gated
- external repo `tenant-commute-hub` is directionally aligned, but this repo
  cannot by itself prove the external code no longer carries forbidden authority

## Repo-Wide Status Snapshot

- `ai-status.json`: 168 tasks total, 167 `done`, 1 `blocked`
- only open task: `GAP-P2S3-001`
- current execution posture: `supervisor_managed_execution`
- master closeout wave is complete enough that auth cutover is now the only
  active product-critical blocker

## Blueprint Alignment by Surface

| Blueprint Family                  | Code Reality                                                                                                                                                                                                  | Alignment Verdict                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| API host and domain modules       | `apps/api/src/modules/*` contains tenant, regulatory, dispatch, complaint, billing, reporting, forwarder, audit, incident, maintenance, shifts, driver profile/settings, feature flags                        | `substantially_aligned`                  |
| Driver app                        | `apps/driver-app/app/` contains jobs, trip, incident, settings, shift, platform-presence, earnings                                                                                                            | `substantially_aligned_with_finish_work` |
| Ops console                       | `apps/ops-console-web/app/` contains dashboard, dispatch, callcenter, complaints, incidents, maintenance, revenue, reports, drivers, vehicles, attendance, contracts                                          | `substantially_aligned_with_finish_work` |
| Platform admin                    | `apps/platform-admin-web/app/` contains tenants, users, pricing, payments, notices, fleet, feature flags, switchboard, audit                                                                                  | `substantially_aligned_with_finish_work` |
| Tenant portal topology            | Internal `apps/tenant-portal-web` still exists as a frozen shell, but is marked sunset; accepted topology keeps external `tenant-commute-hub` as the only production tenant UI and this repo as BFF/authority | `directionally_aligned_cross_repo`       |
| Passenger app / web               | No dedicated landing zone under `apps/`                                                                                                                                                                       | `deferred_missing_surface`               |
| Call point / concierge portal     | No dedicated landing zone under `apps/`; only backend/operator building blocks exist                                                                                                                          | `deferred_missing_surface`               |
| AV / ODD / Tesla / ROC live-board | No landing zone in current monorepo                                                                                                                                                                           | `future_gated_missing_surface`           |

## Code-Verified Strengths

### 1. The repo carries real product surfaces, not just shells

Web/mobile surfaces exist with route coverage:

- platform admin: `apps/platform-admin-web/app/*`
- ops console: `apps/ops-console-web/app/*`
- driver app: `apps/driver-app/app/*`
- frozen tenant shell: `apps/tenant-portal-web/app/*`

The backend carries corresponding domain modules under
`apps/api/src/modules/*`, including:

- `tenant-partner`
- `regulatory-registry`
- `owned-mobility`
- `callcenter`
- `complaint`
- `billing-settlement`
- `reporting-filing`
- `forwarder`
- `platform-admin`
- `platform-presence`
- `platform-earnings`
- `incident`
- `maintenance`
- `shift-attendance`

### 2. Auth groundwork for the IAP/OIDC wave is already in code

The API already accepts verified Bearer tokens and records `authMode` as
`jwt_bearer`, while still supporting bootstrap fallback:

- `apps/api/src/common/auth/bootstrap-auth.guard.ts`
- `apps/api/src/common/auth/jwt-auth.service.ts`
- `apps/api/src/common/auth/auth.types.ts`
- `apps/api/tests/unit/auth-bootstrap.test.ts`
- `tests/smoke/lib/helpers.sh`

### 3. Tenant portal production topology is documented and stabilized

The repo clearly marks the internal tenant portal as sunset and points the
production tenant UI to the external repo:

- `apps/tenant-portal-web/README.md`
- `docs/02-architecture/authority/fbp-007-tenant-portal-web-sunset.md`
- `docs/02-architecture/authority/rgp-002-authority-map.md`

## Code-Verified Residual Gaps

### 1. `GAP-P2S3-001` is still not fully closed

Why it is not done yet:

- runbook still says bootstrap trust remains a phased fallback
- smoke docs still describe bootstrap as the default pre-cutover staging path
- direct Cloud Run access was still restored as public in recent operator logs,
  so the system is not yet protected-by-default

Primary anchors:

- `docs/03-runbooks/gap-p2s3-001-cloud-iap-checklist.md`
- `tests/smoke/README.md`
- `ai-status.json`
- `ai-activity-log.jsonl`

### 2. Some domain modules still depend on seed or fallback state

These modules exist and work, but they are not uniformly "hard" source-of-truth
implementations yet:

- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`
  still contains `DEMO_TENANT_ID`, passenger/address/user-role/API-key seed data
- `apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts`
  still boots from vehicle/driver/contract/policy/exclusivity seed records
- `apps/api/src/modules/driver-profile/driver-profile.service.ts`
  still resolves from in-memory seed profiles before persistence
- `apps/api/src/modules/platform-earnings/platform-earnings.service.ts`
  still contains seed-backed records
- `apps/api/src/modules/billing-settlement/billing-settlement.service.ts`
  still creates default tenant billing profiles and falls back through
  `DEMO_TENANT_ID`

These are not fake modules, but they do mean some blueprint slices are still
closer to "accepted baseline plus fallback" than to fully hardened persistence.

### 3. Forwarder integration is still a real implementation gap

`apps/api/src/modules/forwarder/grab-taiwan.adapter.ts` is still explicitly a
stub for accept / reject / complete / heartbeat / earnings.

This means the forwarder family exists structurally, but external-partner
production parity is not fully closed.

### 4. Driver-task SSE is still single-instance only

`apps/api/src/modules/owned-mobility/owned-mobility-task-events.service.ts`
still documents that multi-instance fan-out needs a later Redis/pub-sub follow-up.

That is good enough for the current baseline, but it is not full operational
hardening for horizontally scaled runtime.

### 5. Driver onboarding still falls back to a placeholder path

`apps/driver-app/app/onboarding.tsx` now performs real connectivity checks and
shows a real workstation entry when they pass, but it still falls back to a
placeholder onboarding screen when they do not.

This is no longer a blank shell, but it is still not a full production-grade
onboarding/provisioning flow.

### 6. Platform admin authority is broad, but not perfectly hardened

`apps/api/src/modules/platform-admin/platform-admin.service.ts` prefers the
reviewer/identity path when present, but `publishPublicInfoVersion()` can still
fall back to `command.publishedBy` if no actor id is injected.

This is better than pure free-form publish metadata, but it is still more
permissive than a strictly identity-only production authority path.

## Blueprint Families That Remain Explicitly Deferred

These are not hidden gaps; they are visible, documented defer decisions.

- Passenger App / Web
- Call Point / Concierge Portal
- AV / ODD / Tesla / ROC live-board

Primary anchors:

- `ROADMAP.md`
- `docs/02-architecture/roadmap/fbp-015-deferred-scope-packet.md`
- `docs/02-architecture/consensus/phase2-full-blueprint-planning-20260415/scope-matrix.md`

## Documentation Reality Check

The codebase is ahead of some entry docs. Before this audit, several repo-entry
files still described the project as a bootstrap shell or old planning state.
Those files must track the current code-backed closeout posture, otherwise
engineers entering the repo get the wrong story even when implementation is
correct.

The most important files to keep synchronized are:

- `README.md`
- `docs/00-context/project-overview.md`
- `CANONICAL_DOCUMENT_MAP.md`
- `docs/03-runbooks/master-system-closeout-checklist.md`
- `docs/03-runbooks/gap-p2s3-001-cloud-iap-checklist.md`

## Practical Conclusion

Overall alignment with the full Phase 1 system blueprint is:

- **aligned enough to say the core system has been built**
- **not aligned enough to claim fully closed operational completion**

The reason is not broad product absence anymore. The remaining differences are
now concentrated in:

1. auth cutover (`GAP-P2S3-001`)
2. persistence / seed hardening in a few domains
3. true partner-forwarder integration
4. deferred customer / concierge / AV surfaces that remain outside the current
   completion bar

## Recommended Reading Order

1. `docs/00-context/current-system-blueprint-alignment-audit-20260421.md`
2. `docs/03-runbooks/master-system-closeout-checklist.md`
3. `docs/03-runbooks/gap-p2s3-001-cloud-iap-checklist.md`
4. `ai-status.json`
5. root `phase1_*` blueprint files

This gives a reader the intended architecture, the current code-backed reality,
the one remaining active blocker, and the execution truth in the right order.
