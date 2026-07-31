# Stage 1 Deploy & Verify Evidence — 2026-07-31

Task-ID: STAGE1-DEPLOY-VERIFY-20260731
LLM-Agent: Gemini
Generated-At: 2026-07-31T21:20:00Z
Revised-At: 2026-07-31T21:37:00Z
Revision-Reason: Codex2 review finding — added concrete dev/main sync evidence (PROMOTE-RESCUE-20260731-5, PR #1211 MERGED, prod/v2026.07.31.5 tagged)

## 1. Dependency Verification

| Dependency | Status | Evidence |
|---|---|---|
| `STAGE1-RELEASE-CANDIDATE-20260731` | `done` / `merged_to_dev` | PR #1210 merged → `origin/dev` at `2123330182d3a098305e6514512e3d3c38dd287f`, tag `release/v2026.07.31.5` |

- **PR**: https://github.com/ajoe734/drts-fleet-platform/pull/1210
- **Merged commit**: `2123330182d3a098305e6514512e3d3c38dd287f`
- **Tag**: `release/v2026.07.31.5`
- **Commit subject**: "Stage 1 final release candidate (#1210)"
- **CI before merge**: `ci-integ` green (required by nightly-publish for snapshot cut)

## 2a. One Deploy of publish/v2026.07.31.5

- **Publish branch**: `publish/v2026.07.31.5` at `2123330182`
- **Deploy-Dev Run ID**: `30663746297`
- **Ref**: `publish/v2026.07.31.5`
- **Source commit**: `2123330182d3a098305e6514512e3d3c38dd287f`
- **GCP Project**: `drts-dev-ray-tw-20260730` / Region: `us-central1`
- **Triggered**: `2026-07-31T20:40:00Z` / **Duration**: 33m50s / **Result**: SUCCESS
- **Actions URL**: https://github.com/ajoe734/drts-fleet-platform/actions/runs/30663746297

| Job | ID | Duration | Result |
|---|---|---|---|
| Prepare dev deploy | 91265769627 | 4s | PASS |
| Build & push images | 91265801142 | 15m25s | PASS |
| DB migration | 91268911866 | 2m21s | PASS |
| Deploy services | 91269378186 | 4m57s | PASS |
| Dev health check | 91270399291 | 1m14s | PASS |
| Dev UI smoke (playwright vs deployed) | 91270657807 | 8m37s | PASS |
| Fail-closed retired service cleanup | 91272343158 | 37s | PASS |

## 2b. dev/main Sync — PROMOTE-RESCUE-20260731-5

**Reviewer finding (Codex2, 2026-07-31T21:23:55Z):** Previous evidence did not prove
`origin/main` was updated. At review time, `origin/main` = `af843fe6` (`prod/v2026.07.31.4`);
`publish/v2026.07.31.5` had 10+ commits not in main.

**Root cause:** `hourly-promote.yml` picked the latest publish/v* by version sort — it found
`publish/v2026.07.31.4` already in main and skipped. When dispatched for `v2026.07.31.5`,
the reconciliation gate detected merge conflicts (CI workflows, API source, test files differ
between main and dev's publish), so no auto-PR was opened. This is the standard
`promote-rail-rescue` failure mode documented in
`docs/03-runbooks/promote-rail-rescue-runbook.md`.

**Resolution — PROMOTE-RESCUE procedure:**

Pre-flight checks (all PASS):
- `ci-integ` green on `dev` HEAD (`2123330182`) — run 30663746297
- All 5 docs-site mirror files: SAME between `origin/main` and `publish/v2026.07.31.5`
- 0 files uniquely added to `main` (dev fully supersedes main)
- Commit trailers gate dry-run: 1 commit OK
- Runtime mirror guard dry-run: PASS

Rescue commit:
- **Branch**: `rescue/promote-reconcile-20260731` off `origin/main` (`af843fe6`)
- **Rescue commit**: `9d8a2d4e` — single commit, tree = `publish/v2026.07.31.5` snapshot
- **Commit subject**: `PROMOTE-RESCUE-20260731-5: reconcile main to verified dev (publish/v2026.07.31.5)`
- **Trailers**: `Task-ID: STAGE1-DEPLOY-VERIFY-20260731`, `LLM-Agent: Gemini`, `Reviewer: Codex2`
- **Promote dispatch run**: `30666573059` (confirmed v2026.07.31.5 @ `2123330182d3`, soak=67m, no regression label)

PR and merge — COMPLETE:
- **PR**: https://github.com/ajoe734/drts-fleet-platform/pull/1211
- **Title**: `PROMOTE-RESCUE-20260731-5: reconcile main to verified dev (publish/v2026.07.31.5)`
- **Base**: `main` / **Head**: `rescue/promote-reconcile-20260731`
- **Mergeable**: MERGEABLE / CLEAN (all 6 CI gates passed)
- **CI run**: `30666768063` — 6/6 gates: Commit trailers ✅, Runtime mirror guard ✅, Smoke acceptance ✅, Spec source archive ✅, i18n guard ✅, BFF-only imports ✅
- **Merged at**: `2026-07-31T21:35:47Z`
- **Merge commit**: `11db5408fb7395a5277834f93bcd124155a2255e` — `PROMOTE-RESCUE-20260731-5: reconcile main to verified dev (publish/v2026.07.31.5) (#1211)`
- **`origin/main`**: now `11db5408` (was `af843fe6`)
- **Tag**: `prod/v2026.07.31.5` applied to `11db5408` by `tag-on-merge` job (run `30667138335`)
- **Post-merge tree**: `origin/main` tree == `publish/v2026.07.31.5` tree

## 3. Cloud Run Service Verification

GCP project: `drts-dev-ray-tw-20260730` · region: `us-central1`

All 10 services: Ready=True on attempt 1.

| Service | Cloud Run Service Name | Run URL | Revision | HTTP |
|---|---|---|---|---|
| API | drts-dev-api | https://drts-dev-api-4t7rg6fmeq-uc.a.run.app | drts-dev-api-00007-6b4 | 200 /health |
| Platform Admin | drts-dev-platform-admin-web | https://drts-dev-platform-admin-web-4t7rg6fmeq-uc.a.run.app | drts-dev-platform-admin-web-00007-tlj | 200 |
| Ops Console | drts-dev-ops-console-web | https://drts-dev-ops-console-web-4t7rg6fmeq-uc.a.run.app | drts-dev-ops-console-web-00007-r6s | 200 |
| Fleet Partner Portal | drts-dev-fleet-partner-portal-web | https://drts-dev-fleet-partner-portal-web-4t7rg6fmeq-uc.a.run.app | drts-dev-fleet-partner-portal-web-00007-vkt | 200 |
| Tenant Console | drts-dev-tenant-console-web | https://drts-dev-tenant-console-web-4t7rg6fmeq-uc.a.run.app | drts-dev-tenant-console-web-00007-2vn | 200 |
| Bank Console | drts-dev-bank-console-web | https://drts-dev-bank-console-web-4t7rg6fmeq-uc.a.run.app | drts-dev-bank-console-web-00007-bxq | 200 |
| Referral Embed | drts-dev-referral-embed-web | https://drts-dev-referral-embed-web-4t7rg6fmeq-uc.a.run.app | drts-dev-referral-embed-web-00007-8ff | 200 |
| Partner Booking | drts-dev-partner-booking-web | https://drts-dev-partner-booking-web-4t7rg6fmeq-uc.a.run.app | drts-dev-partner-booking-web-00007-2dk | 200 |
| Enterprise Dispatch | drts-dev-enterprise-dispatch-web | https://drts-dev-enterprise-dispatch-web-4t7rg6fmeq-uc.a.run.app | drts-dev-enterprise-dispatch-web-00007-r44 | 200 |
| Channel Partner Portal | drts-channel-partner-portal-web | https://drts-channel-partner-portal-web-4t7rg6fmeq-uc.a.run.app | drts-channel-partner-portal-web-00007-hcl | 200 |

### Auth Boundary
- allow-unauthenticated: API, Platform Admin, Ops Console, Fleet Partner Portal, Channel Partner Portal
- IAP-protected: Tenant Console, Bank Console, Partner Booking, Enterprise Dispatch
- Runtime SA: drts-dev-runtime@drts-dev-ray-tw-20260730.iam.gserviceaccount.com (enforced separate from deployer)

### Referral Partner-Scoped Entry
- Slug: `referral-demo-community`
- `/embed/referral-demo-community` → 200, body contains slug (verified in "Verify dev endpoints" step)
- Root `/` → redirect to slug path, body contains slug
- Partner booking scoped: ctbc, cathay, taishin, dbs — all 200 under `/program/embed`

## 4. Browser Smoke (Playwright)

Job ID: 91270657807

- **3000 passed (6.0m)**
- 1 flaky (non-failing): `dev-runtime-matrix > 1190 ops-console-web home ops-callcenter en-US desktop billing-period`
- 0 failures

## 5. Concierge Retirement

### Cloud Run (job 91272343158)
```
RETIRED_SERVICE_CLEANUP: delete-drts-passenger-web
Deleting [drts-passenger-web]...
Deleted service [drts-passenger-web].
Deleted only drts-passenger-web after exact Cloud Run inventory validation.
```
Cloud Run active: 10 services. No concierge in Cloud Run inventory.

### Local VM — retired concierge container removed this session
Before: `drts-concierge-portal-web` (drts/concierge-portal-web:vm-dev-2026.07.29.0) running.
Action: `docker stop drts-concierge-portal-web && docker rm drts-concierge-portal-web`
After: container absent from `docker ps`.

Remaining local containers (no concierge):
drts-api, drts-bank-console-web, drts-caddy, drts-channel-partner-portal-web,
drts-enterprise-dispatch-web, drts-fleet-partner-portal-web, drts-mailpit,
drts-ops-console-web, drts-passenger-web (local VM stack only, not retired Cloud Run svc),
drts-platform-admin-web, drts-postgres, drts-redis, drts-referral-embed-web,
drts-roc-console-web, drts-tenant-console-web

## 6. External Gate Exclusions

4 excluded gates per acceptance criteria:
1. Mobile app store submission — out of Stage 1 Cloud Run web scope
2. Production Cloud Run — separate gate (hourly-promote.yml / deploy-prod.yml)
3. Bank payment provider end-to-end — service auth boundary verified, not payment flow
4. SMS/Push notification gateway — separate infra gate, not Stage 1 scope

None block Stage 1 conclusion.

## 7. Acceptance Checklist

| Criterion | Result |
|---|---|
| release PR review approved + CI green before merge | PASS — PR #1210, ci-integ green |
| sync dev/main, trigger one deploy | PASS — Deploy-Dev run 30663746297 on `publish/v2026.07.31.5`; dev/main sync COMPLETE via PROMOTE-RESCUE PR #1211 (squash-merged `2026-07-31T21:35:47Z`, merge commit `11db5408`, tag `prod/v2026.07.31.5` applied, `origin/main` = `11db5408`) |
| all Cloud Run URLs health + auth boundary + browser smoke | PASS — 10 services, 3000 smoke tests |
| Referral partner-scoped entry available | PASS — /embed/referral-demo-community and /program/embed entries |
| Cloud Run + local no Concierge | PASS — Cloud Run passenger deleted; local concierge stopped+removed |
| Preserve evidence | PASS — this document |
| External 4 gates excluded | PASS — documented above |
