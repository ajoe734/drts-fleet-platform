# Stage 1 Truth Closeout (2026-07-31)

**Task:** `STAGE1-TRUTH-CLOSEOUT-20260731`  
**Depends on:** `STAGE1-DEPLOY-VERIFY-20260731`  
**Scope rule:** this closeout records only controllable repo-and-deploy truth proven by the verified dev release. It does not reopen external gates, pilot gates, or production-only gates.

## 1. Accepted release evidence

- Verified deploy run: `Deploy — Dev` run `30663746297`
- Published source snapshot: `publish/v2026.07.31.5`
- Deploy source commit: `2123330182d3a098305e6514512e3d3c38dd287f`
- Promote rescue PR: `#1211` `PROMOTE-RESCUE-20260731-5: reconcile main to verified dev (publish/v2026.07.31.5)`
- PR merge commit: `11db5408fb7395a5277834f93bcd124155a2255e`
- Deploy project / region: `drts-dev-ray-tw-20260730` / `us-central1`

## 2. Official active dev surfaces

Authoritative active inventory remains exactly these 10 services. No passenger or concierge surface is active.

| Surface | Service | Revision | Ready URL | Friendly/dev URL used by health + smoke |
| --- | --- | --- | --- | --- |
| API | `drts-dev-api` | `drts-dev-api-00007-6b4` | `https://drts-dev-api-952590575714.us-central1.run.app` | `https://drts-dev-api-4t7rg6fmeq-uc.a.run.app` |
| Platform Admin | `drts-dev-platform-admin-web` | `drts-dev-platform-admin-web-00007-tlj` | `https://drts-dev-platform-admin-web-952590575714.us-central1.run.app` | `https://drts-dev-platform-admin-web-4t7rg6fmeq-uc.a.run.app` |
| Ops Console | `drts-dev-ops-console-web` | `drts-dev-ops-console-web-00007-r6s` | `https://drts-dev-ops-console-web-952590575714.us-central1.run.app` | `https://drts-dev-ops-console-web-4t7rg6fmeq-uc.a.run.app` |
| Fleet Partner Portal | `drts-dev-fleet-partner-portal-web` | `drts-dev-fleet-partner-portal-web-00007-vkt` | `https://drts-dev-fleet-partner-portal-web-952590575714.us-central1.run.app` | `https://drts-dev-fleet-partner-portal-web-4t7rg6fmeq-uc.a.run.app` |
| Tenant Console | `drts-dev-tenant-console-web` | `drts-dev-tenant-console-web-00007-2vn` | `https://drts-dev-tenant-console-web-952590575714.us-central1.run.app` | `https://drts-dev-tenant-console-web-4t7rg6fmeq-uc.a.run.app` |
| Bank Console | `drts-dev-bank-console-web` | `drts-dev-bank-console-web-00007-bxq` | `https://drts-dev-bank-console-web-952590575714.us-central1.run.app` | `https://drts-dev-bank-console-web-4t7rg6fmeq-uc.a.run.app` |
| Referral Embed | `drts-dev-referral-embed-web` | `drts-dev-referral-embed-web-00007-8ff` | `https://drts-dev-referral-embed-web-952590575714.us-central1.run.app` | `https://drts-dev-referral-embed-web-4t7rg6fmeq-uc.a.run.app/embed/referral-demo-community` |
| Partner Booking | `drts-dev-partner-booking-web` | `drts-dev-partner-booking-web-00007-2dk` | `https://drts-dev-partner-booking-web-952590575714.us-central1.run.app` | `https://drts-dev-partner-booking-web-4t7rg6fmeq-uc.a.run.app` |
| Enterprise Dispatch | `drts-dev-enterprise-dispatch-web` | `drts-dev-enterprise-dispatch-web-00007-r44` | `https://drts-dev-enterprise-dispatch-web-952590575714.us-central1.run.app` | `https://drts-dev-enterprise-dispatch-web-4t7rg6fmeq-uc.a.run.app` |
| Channel Partner Portal | `drts-channel-partner-portal-web` | `drts-channel-partner-portal-web-00007-hcl` | `https://drts-channel-partner-portal-web-952590575714.us-central1.run.app` | `https://drts-channel-partner-portal-web-4t7rg6fmeq-uc.a.run.app` |

Retired and forbidden from active inventory:

- `drts-passenger-web`
- `concierge-portal-web`
- `assisted-entry-web`

## 3. Health and smoke truth

### Health verification from run `30663746297`

The verified health step completed successfully after all 10 services reached `Ready`:

- `https://drts-dev-api-4t7rg6fmeq-uc.a.run.app/health`
- web roots for platform-admin, ops-console, fleet-partner-portal, tenant-console, bank-console, enterprise-dispatch, and channel-partner-portal
- referral embed path and root redirect behavior:
  - `/embed/referral-demo-community`
  - `/` redirects to the same partner-scoped entry
- partner booking paths:
  - `/ctbc`
  - `/ctbc/program`
  - `/ctbc/program/embed`
  - `/cathay/program/embed`
  - `/taishin/program/embed`
  - `/dbs/program/embed`

### UI smoke truth from run `30663746297`

- Playwright deployed-dev smoke job succeeded.
- Business-flow suites executed before the high-volume matrix:
  - `playwright.bank-console-depth.config.ts`
  - `playwright.bank-console-auth.config.ts`
  - `playwright.ops-console-parity.config.ts`
  - `playwright.google-map-live.config.ts`
  - `playwright.ops-assistant.config.ts`
  - `playwright.fleet-partner-portal.config.ts`
  - `playwright.partner-booking-surfaces.config.ts`
  - `playwright.enterprise-dispatch.config.ts`
  - `playwright.channel-partner-portal.config.ts`
  - `playwright.referral-embed.config.ts`
  - `playwright.platform-admin-service-area.config.ts`
  - `playwright.dev-runtime-matrix.config.ts`
- Final matrix result was `3000 passed (6.0m)` with `1 flaky` retried case:
  - `ops-console-web home ops-callcenter en-US desktop billing-period`
  - first attempt observed `503`, retry passed, so the job remained `success`

This closeout must therefore describe the smoke result as: successful deploy smoke with one recovered flaky case, not a pristine zero-flake run.

## 4. Referral and concierge truth

- Referral is an active Stage 1 surface only as a **partner-scoped entry**:
  - canonical custom-domain entry: `https://refer.smarttransport.tw/embed/referral-demo-community`
  - Cloud Run fallback: `https://drts-dev-referral-embed-web-4t7rg6fmeq-uc.a.run.app/embed/referral-demo-community`
  - platform governance remains under `platform-admin-web` `/partners*`
  - partner self-service remains `channel-partner-portal-web`
- Concierge is not an official active URL, not an active Cloud Run service, and not part of the Stage 1 deploy inventory.

## 5. Retired-service cleanup truth

The verified cleanup job `Fail-closed retired service cleanup` in run `30663746297` deleted only:

- `drts-passenger-web`

Recorded job result:

- exact inventory validation passed
- deleted only `drts-passenger-web`
- no concierge service was reintroduced into active inventory

## 6. GitHub issue closeout truth

Searches for open release-specific or regression issues tied to this verified release produced no matching open issues to close:

- no open issue with label `regression:v2026.07.31.5`
- no open issue matching `30663746297`, `2123330182`, `11db5408`, `concierge`, or `referral-demo-community`

Therefore this closeout records **no controllable GitHub issue closure action for this release**, rather than inventing one.

## 7. Stage 1 conclusion

Within controllable Stage 1 scope, the deployed truth is:

- one verified dev release exists and is traceable to run `30663746297`
- main was reconciled to that verified snapshot by PR `#1211`
- the official active inventory is the 10-service set above
- referral is active only through the partner-scoped entry `referral-demo-community`
- concierge does not belong in the active inventory, smoke inventory, or closeout wording

This document intentionally stops there. External resource gates, pilot sign-off, and production-launch questions are out of scope for this Stage 1 truth closeout.
