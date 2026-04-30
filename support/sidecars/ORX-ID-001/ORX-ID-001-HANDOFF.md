# ORX-ID-001 Owner Handoff

Owner: `Codex`  
Reviewer: `Codex2`  
Date: `2026-04-30`  
Observed task status: `in_progress`

## Result

`ORX-ID-001` is ready for re-review on the current repo state.

The remaining review gap is closed: root-level driver-session revalidation now
routes revoked or suspended identities back to `/onboarding`, clears any active
heartbeat assignment, and preserves the driver-facing provisioning error on the
onboarding screen.

## Acceptance Anchors

### 1. Background and foreground revalidation now force invalid sessions back to onboarding

- The driver app root layout now routes all foreground and interval
  revalidation through the extracted bootstrap helper in
  [apps/driver-app/app/\_layout.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/_layout.tsx:26)
  and
  [driver-identity-bootstrap.ts](/home/edna/workspace/drts-fleet-platform/apps/driver-app/lib/driver-identity-bootstrap.ts:28).
- When `initializeDriverIdentity()` leaves the app unprovisioned while an
  identity issue exists, the helper first clears the active heartbeat
  assignment and then resets the router stack back to `/onboarding` in
  [driver-identity-bootstrap.ts](/home/edna/workspace/drts-fleet-platform/apps/driver-app/lib/driver-identity-bootstrap.ts:31)
  and
  [driver-identity-routing.ts](/home/edna/workspace/drts-fleet-platform/apps/driver-app/lib/driver-identity-routing.ts:7).

### 2. Revoked-binding and suspended-driver cases now have explicit proof tests

- Revoked binding revalidation is covered in
  [apps/driver-app/tests/unit/driver-identity-bootstrap.test.ts](/home/edna/workspace/drts-fleet-platform/apps/driver-app/tests/unit/driver-identity-bootstrap.test.ts:14),
  which proves the bootstrap path calls `syncDriverLocationHeartbeat(null)` and
  `resetDriverAppToOnboarding(...)` instead of trying to keep the old route
  alive.
- Suspended driver revalidation is covered in
  [driver-identity-bootstrap.test.ts](/home/edna/workspace/drts-fleet-platform/apps/driver-app/tests/unit/driver-identity-bootstrap.test.ts:36),
  which proves the same forced onboarding transition after a failed refresh.

### 3. The provisioning screen still surfaces the identity error after redirect

- Onboarding still reads `getDriverIdentityIssue()` after initialization and
  exposes that message in the provisioning UI in
  [apps/driver-app/app/onboarding.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/onboarding.tsx:34),
  so the redirect path returns the driver to the registration form with the
  same explanation required by the runbook.

## Verification

Executed on current `HEAD`:

```sh
pnpm --filter @drts/driver-app test
pnpm --filter @drts/driver-app typecheck
pnpm --filter @drts/api exec vitest run tests/unit/auth-bootstrap.test.ts tests/unit/driver-profile.service.test.ts
```

Observed result:

- `@drts/driver-app` tests passed: `3 files`, `7 tests`
- `@drts/driver-app` typecheck passed
- targeted `@drts/api` auth/profile suite passed: `2 files`, `60 tests`

## Review Ask

Please review against current `HEAD` and, if accepted, advance `ORX-ID-001`
from `review` to `review_approved`.
