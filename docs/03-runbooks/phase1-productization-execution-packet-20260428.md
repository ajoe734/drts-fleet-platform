# Phase 1 Productization Execution Packet — 2026-04-28

Status: ready for supervisor-managed execution dispatch

Owner: Supervisor

Scope: `drts-fleet-platform` plus `tenant-commute-hub`

## Purpose

This packet turns the remaining Phase 1 blueprint gaps into execution tasks that
can be assigned to auto workers without reopening the closed control-plane
auth, tenant cutover, or passenger-surface decisions.

The current code baseline already has:

- protected control-plane staging deployment and IAP/OIDC cutover closed
- `tenant-commute-hub` as the production tenant UI
- `apps/driver-app` as a native-capable Expo driver app baseline
- backend and frontend baseline support for partner entries and eligibility

The remaining work is therefore productization, not first implementation.

## Dispatch Guardrails

- Do not reopen first-party passenger app/web or passenger receipt UI work.
- Do not treat `apps/tenant-portal-web` as a production tenant UI.
- Do not put tenant, driver, partner, adapter, or webhook paths behind the
  internal control-plane IAP target by default.
- Do not revert unrelated local or remote-main changes in either repo.
- Each auto worker owns only the files listed in its write scope.
- If a worker needs to cross a listed write boundary, it must stop and ask the
  supervisor to re-slice the task.
- All user-facing UI touched by this wave must be Traditional Chinese ready.
- Any real bank, issuer, or partner API integration remains blocked until
  credentials, sandbox, contract, and test evidence are provided.

## Execution Order

1. `P1PX-BE-001` — contracts, migrations, repository persistence
2. `P1PX-BE-002` — partner-authenticated ingress and security policy
3. `P1PX-FE-001` — partner-only tenant UI shell and bank-specific entry branding
4. `P1PX-BE-003` — booking, audit, settlement, and reporting carry-through review
5. `P1PX-DRV-001` — driver app production identity and device-binding plan
6. `P1PX-DRV-002` — EAS internal build evidence and native release runbook
7. `P1PX-DOC-001` — closeout / gap matrix / current-work truth sync

`P1PX-BE-001` and `P1PX-FE-001` may run in parallel only if the frontend worker
uses the existing public partner-entry API and does not require new persisted
fields. `P1PX-BE-002` must run after or alongside backend contracts with a
stable auth contract.

## Task Board

| Task ID        | Repo                  | Suggested Owner               | Reviewer | Status                  | Depends On     |
| -------------- | --------------------- | ----------------------------- | -------- | ----------------------- | -------------- |
| `P1PX-BE-001`  | `drts-fleet-platform` | Codex / auto-worker-backend   | Claude   | ready                   | —              |
| `P1PX-BE-002`  | `drts-fleet-platform` | Qwen / auto-worker-api        | Codex    | ready-after-contract    | `P1PX-BE-001`  |
| `P1PX-FE-001`  | `tenant-commute-hub`  | Codex2 / auto-worker-frontend | Claude   | ready                   | —              |
| `P1PX-BE-003`  | `drts-fleet-platform` | Codex / auto-worker-backend   | Claude   | ready-after-persistence | `P1PX-BE-001`  |
| `P1PX-DRV-001` | `drts-fleet-platform` | Codex2 / auto-worker-mobile   | Codex    | ready                   | —              |
| `P1PX-DRV-002` | `drts-fleet-platform` | Gemini / auto-worker-infra    | Codex    | evidence-gated          | `P1PX-DRV-001` |
| `P1PX-DOC-001` | `drts-fleet-platform` | Claude / auto-worker-docs     | Codex    | ready-last              | all above      |

## `P1PX-BE-001` — Partner Registry And Eligibility Persistence

### Objective

Move partner channel entries and eligibility verification records from
seed/in-memory runtime posture to durable authority-owned persistence.

### Write Scope

- `packages/contracts/src/index.ts`
- `apps/api/src/modules/tenant-partner/tenant-partner.repository.ts`
- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`
- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
- `infra/migrations/`
- `tests/unit/tenant-partner-foundation.test.ts`
- related API-client generated or shared contract files if the repo requires
  them

### Required Work

- Add durable schema for partner channel entries.
- Add durable schema for partner eligibility verifications.
- Persist at minimum partner ID, program ID, entry slug, tenant ID, bank code,
  program code, eligibility mode, branding metadata, status, created/updated
  timestamps, and audit metadata.
- Persist eligibility verification ID, partner entry slug, partner ID, program
  ID, bank code, card program code or reference token hash where applicable,
  verification status, reason code, benefit reference, issuer authorization
  reference, expiry, created/updated timestamps, and request/audit metadata.
- Keep seed demo entries only as dev bootstrap data, not as the only authority
  source.
- Preserve existing public list/get behavior unless `P1PX-BE-002` has already
  introduced authenticated alternatives.

### Acceptance

- Unit tests prove partner entries survive repository reload.
- Unit tests prove eligibility verification survives repository reload and can
  be reused by booking creation before expiry.
- Existing owned-mobility partner booking tests still pass.
- No test depends on process-local in-memory maps as the authority record.

### Verification

```bash
pnpm --filter @drts/api typecheck
pnpm test:unit -- tenant-partner-foundation
pnpm test:unit -- owned-mobility
```

## `P1PX-BE-002` — Partner-Authenticated Ingress

### Objective

Make partner callers a first-class authenticated ingress class instead of
leaving partner entry and eligibility verification as open unauthenticated
routes.

### Write Scope

- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`
- `apps/api/src/modules/tenant-partner/tenant-partner.repository.ts`
- `apps/api/src/modules/auth/` or existing auth/guard utilities if present
- `packages/contracts/src/index.ts`
- `packages/api-client/src/index.ts`
- `tests/unit/tenant-partner-foundation.test.ts`
- API smoke or e2e scripts if present

### Required Work

- Define partner ingress auth contract: API key, HMAC signature, mTLS-bound
  identity, or an explicitly documented equivalent.
- Add guard/service logic that authenticates partner callers and binds
  `partnerId`, `programId`, `entrySlug`, and tenant scope server-side.
- Keep a safe public route only for non-sensitive entry bootstrap data if the
  frontend needs it.
- Move eligibility verification command paths behind partner-authenticated
  identity or a signed bootstrap token.
- Add audit events for accepted and rejected partner ingress attempts.
- Add negative tests for missing credentials, wrong partner, wrong tenant,
  inactive entry, and invalid signature/token.

### Acceptance

- Partner eligibility verification can no longer be performed by an anonymous
  caller unless using a short-lived signed bootstrap token that is validated
  server-side.
- Authenticated partner identity cannot submit bookings or eligibility checks
  against another partner's entry.
- Existing tenant-admin bearer paths continue to work for tenant management
  surfaces.

### Verification

```bash
pnpm --filter @drts/api typecheck
pnpm test:unit -- tenant-partner-foundation
pnpm test:unit -- audit-notification
```

## `P1PX-FE-001` — Partner-Only Tenant UI Shell And Bank Entry Branding

### Objective

Turn the existing `/partner/:entrySlug` baseline into a clean partner-only
booking funnel for cooperating banks and direct partners.

### Write Scope

- `/home/edna/workspace/tenant-commute-hub/src/App.tsx`
- `/home/edna/workspace/tenant-commute-hub/src/contexts/AuthContext.tsx`
- `/home/edna/workspace/tenant-commute-hub/src/components/DashboardLayout.tsx`
- `/home/edna/workspace/tenant-commute-hub/src/pages/Login.tsx`
- `/home/edna/workspace/tenant-commute-hub/src/pages/NewBooking.tsx`
- `/home/edna/workspace/tenant-commute-hub/src/lib/drtsApi.ts`
- tenant-hub tests or scripts if present

### Required Work

- Detect partner mode from route/session context and expose only booking funnel
  navigation, not full tenant administration.
- Hide unrelated tenant-management pages in partner mode: API keys, webhooks,
  billing, SLA, users, audit, passenger/address management unless explicitly
  needed for the booking funnel.
- Render partner display name, bank code, program code, eligibility mode,
  support copy, and theme accent where available.
- Keep one shared frontend codebase; do not fork per bank.
- Support both path-based entries (`/partner/:entrySlug`) and a future host or
  signed-bootstrap resolver without hard-coding one bank.
- Translate visible partner flow copy to Traditional Chinese.
- Preserve normal tenant-admin shell for non-partner login.

### Acceptance

- `/partner/bank-demo-alpha-airport/login` lands in partner booking mode after
  login and does not expose tenant admin navigation.
- `/partner/bank-demo-beta-airport/login` uses the same app but displays the
  correct entry context and eligibility mode.
- Normal `/login` still enters the full tenant administration shell.
- Booking submission carries `partnerEntrySlug` and
  `eligibilityVerificationId` when eligibility is required.
- No visible English remains in the partner booking funnel except immutable
  product names, IDs, URLs, enum/debug values, and email/API technical fields.

### Verification

```bash
npm run typecheck
npm run build
```

## `P1PX-BE-003` — Partner Truth Carry-Through Review

### Objective

Verify and close the gap between partner eligibility truth and downstream audit,
settlement, finance, reporting, and operator review surfaces.

### Write Scope

- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
- `apps/api/src/modules/owned-mobility/owned-mobility.repository.ts`
- `apps/api/src/modules/reporting-filing/`
- `apps/api/src/modules/billing-settlement/`
- `apps/ops-console-web/app/reports/`
- `apps/ops-console-web/app/revenue/`
- `tests/unit/owned-mobility.test.ts`
- reporting / billing tests if present

### Required Work

- Confirm partner fields persist into owned order records and are readable in
  downstream reports.
- Add or adjust report rows to expose partner ID, program ID, entry slug,
  eligibility verification ID, benefit reference, and issuer authorization
  reference where relevant.
- Add finance/revenue review hints for bank-card airport transfer benefits.
- Avoid creating a passenger receipt UI; that remains deferred under the
  current Phase 1 decision.

### Acceptance

- A `credit_card_airport_transfer` booking with valid eligibility can be traced
  from partner entry to order, audit, and at least one reporting/finance review
  artifact.
- A booking without required eligibility remains rejected.
- Operator review can distinguish enterprise dispatch from bank-card airport
  transfer.

### Verification

```bash
pnpm --filter @drts/api typecheck
pnpm test:unit -- owned-mobility
pnpm test:unit -- reporting
pnpm --filter @drts/ops-console-web typecheck
```

## `P1PX-DRV-001` — Driver App Production Identity And Device Binding

### Objective

Move the driver app from demo-driver staging posture toward production-ready
identity, driver binding, and device-safe runtime configuration.

### Write Scope

- `apps/driver-app/app.json`
- `apps/driver-app/eas.json`
- `apps/driver-app/lib/api-client.ts`
- `apps/driver-app/app/onboarding.tsx`
- `apps/driver-app/app/settings.tsx`
- `apps/driver-app/app/platform-presence.tsx`
- `apps/driver-app/README.md`
- `docs/03-runbooks/driver-app-native-dev-runbook.md`
- backend identity/device files only if required and explicitly scoped by
  supervisor

### Required Work

- Remove demo driver ID as a silent production default.
- Add explicit dev/staging/prod environment requirements for
  `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_DRIVER_ID` or replacement auth tokens.
- Add a visible degraded state when driver identity is not provisioned.
- Define mobile auth/device-binding handoff with backend identity instead of
  relying on hard-coded actor IDs.
- Keep driver app on direct app-auth path, not internal IAP.
- Localize visible driver-app runtime copy to Traditional Chinese where touched.

### Acceptance

- A build without driver identity fails safe or shows a provisioning screen,
  not a silently demo-bound driver workspace.
- Existing jobs, trip, proof, earnings, and platform presence flows still
  typecheck.
- Runbook clearly separates local dev, internal test, staging, and production
  configuration.

### Verification

```bash
pnpm --filter @drts/driver-app typecheck
pnpm --filter @drts/driver-app test
```

## `P1PX-DRV-002` — EAS Internal Build Evidence

### Objective

Produce repeatable Android/iOS internal build evidence for the native driver
app baseline.

### Write Scope

- `apps/driver-app/eas.json`
- `apps/driver-app/app.json`
- `apps/driver-app/README.md`
- `docs/03-runbooks/driver-app-native-dev-runbook.md`
- evidence files under `support/sidecars/` or a new runbook evidence folder if
  the repo convention requires it

### Required Work

- Confirm Android development or preview build command.
- Confirm iOS simulator or internal development build command.
- Document required secrets and credentials without committing secrets.
- Capture build IDs, artifact URLs, or screenshots when available.
- If EAS credentials are unavailable, mark the exact missing credential and keep
  the task evidence-gated instead of pretending it passed.

### Acceptance

- Supervisor can reproduce the exact internal build command.
- The runbook states which build profile is used for Android and iOS.
- Missing external credentials are explicit and not hidden as code failure.

### Verification

```bash
cd apps/driver-app
eas build --platform android --profile preview
eas build --platform ios --profile development-simulator
```

## `P1PX-DOC-001` — Blueprint Truth Sync

### Objective

Update planning truth so future workers do not read stale split-state or
"not materialized" language after the partner and driver baselines landed.

### Write Scope

- `current-work.md`
- `docs/03-runbooks/cross-repo-gap-matrix-20260424.md`
- `docs/03-runbooks/execution-next-wave-task-board.md`
- `docs/03-runbooks/execution-mode-candidate-backlog.md`
- `docs/03-runbooks/master-system-closeout-checklist.md`
- relevant architecture annex files only if their historical wording is
  misleading as current truth

### Required Work

- Update repo hashes and status dates.
- Mark partner channel as "baseline landed; productization remains" instead of
  "not materialized" where that wording is still used as current truth.
- Mark driver app as native-capable baseline with production-release gaps.
- Preserve external-gated labels for Grab real adapter and real bank/issuer
  integrations.
- Preserve explicit deferral for first-party passenger app/web, passenger
  receipt UI, call point/concierge, AV/ODD, and live board.

### Acceptance

- A new worker can tell which gaps are done, productization gaps, external-gated
  gaps, and intentionally deferred scope without reading old consensus packets.
- The two-repo baseline points to current remote `main` commits.
- No document reopens closed IAP/OIDC or tenant-cutover work as active blockers.

### Verification

```bash
rg -n "not yet materialized|Supabase-first|bootstrap-header-first|final blocker|split-state" current-work.md docs/03-runbooks docs/02-architecture/authority
git status -sb
```

## Supervisor Dispatch Prompts

### Backend Persistence Worker

You are not alone in the codebase. Do not revert edits made by others. Own
`P1PX-BE-001` only. Implement durable partner channel entry and eligibility
verification persistence in `drts-fleet-platform` using the write scope and
acceptance criteria in this packet. Do not modify tenant frontend files. Report
changed paths and verification results.

### Backend Ingress Worker

You are not alone in the codebase. Do not revert edits made by others. Own
`P1PX-BE-002` only. Implement partner-authenticated ingress and negative tests
after the backend persistence contract is stable. Do not change driver app or
tenant hub UI. Report changed paths, auth contract, and verification results.

### Tenant Frontend Worker

You are not alone in the codebase. Do not revert edits made by others. Own
`P1PX-FE-001` only in `/home/edna/workspace/tenant-commute-hub`. Implement the
partner-only UI shell, bank-specific entry context, and Traditional Chinese
partner booking funnel. Do not edit backend code unless the supervisor expands
the task. Report changed paths and verification results.

### Partner Carry-Through Worker

You are not alone in the codebase. Do not revert edits made by others. Own
`P1PX-BE-003` only. Verify partner truth carry-through into audit, reporting,
finance, and operator review surfaces. Do not introduce passenger receipt UI.
Report changed paths and verification results.

### Driver Mobile Worker

You are not alone in the codebase. Do not revert edits made by others. Own
`P1PX-DRV-001` only. Harden driver app identity/device-binding configuration
and degraded provisioning states. Do not put the driver app behind IAP. Report
changed paths and verification results.

### Driver Build Evidence Worker

You are not alone in the codebase. Do not revert edits made by others. Own
`P1PX-DRV-002` only. Produce EAS internal build evidence or identify exact
external credentials blocking the build. Do not commit secrets. Report changed
paths, build commands, and evidence.

### Documentation Worker

You are not alone in the codebase. Do not revert edits made by others. Own
`P1PX-DOC-001` only after implementation workers finish. Update current truth
and remove stale current-state claims while preserving historical records.
Report changed paths and verification results.

## Human / External Inputs Needed

- Real bank or issuer eligibility contract, sandbox credentials, allowed test
  cards, and error taxonomy.
- Partner channel auth choice: HMAC API key, mTLS, OAuth client credentials, or
  signed bootstrap token.
- Bank-specific entry requirements: host/subdomain strategy, branding assets,
  legal/support copy, program names, and eligibility modes.
- Mobile distribution inputs: Expo account access, Apple team, Android keystore
  policy, and internal tester groups.

## Explicit Non-Tasks

- Do not build first-party passenger app/web in this wave.
- Do not build passenger receipt UI in this wave.
- Do not replace `tenant-commute-hub` with `apps/tenant-portal-web`.
- Do not implement the real Grab Taiwan adapter until partner contract and
  credentials exist.
- Do not treat demo bank last-four logic as production eligibility.
