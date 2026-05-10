# TEN-UI-008-SIDECAR-REVIEW: Review Packet

## Scope

This sidecar packet supports parent task `TEN-UI-008` without changing canonical truth. It summarizes the machine-truth closeout evidence already recorded in `ai-status.json` and gives the assigned reviewer a concrete checklist with file anchors for the tenant identity and RBAC cutover.

## Parent Machine-Truth Closeout

- Parent task: `TEN-UI-008` - `Real Tenant Identity And RBAC Cutover`
- Parent status: `done`
- Owner: `Codex2`
- Reviewer: `Claude`
- Recorded closeout timestamp: `2026-05-09T15:14:40Z`
- Commit hash: `9b5fb12aa2c1c9dd0d0576449977494e44deb71c`
- Commit subject: `TEN-UI-008 Cut over tenant identity and RBAC`
- Push target: `origin/codex/dev-deploy-backend-android`
- Verification recorded in machine truth: `pnpm --filter @drts/tenant-portal-web typecheck`
- Latest sidecar handoff timestamp: `2026-05-09T15:48:22Z`

## Parent Intent Summary

`TEN-UI-008` removed demo/transitional tenant auth assumptions from `apps/tenant-portal-web` and replaced them with backend-issued tenant bootstrap session handling, scope-derived capabilities, and role-gated navigation and mutations. The cutover also bundled the tenant integration governance surfaces that ride on the new capability model, especially API key and webhook management.

## Commit Surface Summary

`git show --stat 9b5fb12aa2c1c9dd0d0576449977494e44deb71c` records a broad tenant-portal cutover:

- `31 files changed, 2398 insertions(+), 511 deletions(-)`
- New auth/UI entry points were added:
  - `apps/tenant-portal-web/app/login/page.tsx`
  - `apps/tenant-portal-web/app/login/actions.ts`
  - `apps/tenant-portal-web/app/api-keys/reveal/route.ts`
  - `apps/tenant-portal-web/components/tenant-portal-chrome.tsx`
- Core authority wiring changed in:
  - `apps/tenant-portal-web/lib/api-client.ts`
  - `apps/tenant-portal-web/lib/rbac.ts`
  - `apps/tenant-portal-web/app/layout.tsx`
  - `apps/tenant-portal-web/app/api/bookings/[orderId]/update/route.ts`
  - `apps/tenant-portal-web/app/api/bookings/[orderId]/cancel/route.ts`
  - `apps/tenant-portal-web/app/api-keys/page.tsx`
  - `apps/tenant-portal-web/app/webhooks/page.tsx`

## Reviewer Checkpoints

### 1. Login and session bootstrap

- [lib/api-client.ts](/home/edna/workspace/drts-fleet-platform/apps/tenant-portal-web/lib/api-client.ts:15) defines `/login`, stores `tenant-portal-session` in an `httpOnly` cookie, and builds tenant API clients from backend-issued bearer session data.
- [login/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/tenant-portal-web/app/login/page.tsx:16) routes anonymous users through a backend bootstrap session flow instead of fabricating local demo roles.
- [layout.tsx](/home/edna/workspace/drts-fleet-platform/apps/tenant-portal-web/app/layout.tsx:24) exposes a server-side sign-out action that clears the session cookie and returns the user to `/login`.

Reviewer expectation: tenant identity is now authority-backed, session state is cookie-based, and the app no longer depends on hard-coded demo tenant context.

### 2. Capability-derived navigation and role framing

- [rbac.ts](/home/edna/workspace/drts-fleet-platform/apps/tenant-portal-web/lib/rbac.ts:45) defines the tenant capability matrix.
- [rbac.ts](/home/edna/workspace/drts-fleet-platform/apps/tenant-portal-web/lib/rbac.ts:99) derives capabilities from backend roles and scopes rather than local UI assumptions.
- [rbac.ts](/home/edna/workspace/drts-fleet-platform/apps/tenant-portal-web/lib/rbac.ts:222) filters sidebar navigation from those capabilities.
- [layout.tsx](/home/edna/workspace/drts-fleet-platform/apps/tenant-portal-web/app/layout.tsx:56) resolves the role snapshot server-side before rendering chrome/footer identity context.

Reviewer expectation: tenant surfaces only appear when the resolved scope/role model allows them; RBAC is centralized in `lib/rbac.ts`.

### 3. Capability-gated integration surfaces

- [api-keys/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/tenant-portal-web/app/api-keys/page.tsx:283) renders read-only vs admin descriptions from `canManageApiKeys`.
- [api-keys/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/tenant-portal-web/app/api-keys/page.tsx:368) shows the governed scope catalog and expiry policy sourced from the backend governance package.
- [api-keys/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/tenant-portal-web/app/api-keys/page.tsx:402) hides issue/rotate UI behind `canManageApiKeys`.
- [api-keys/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/tenant-portal-web/app/api-keys/page.tsx:732) server-actions `issueApiKey`, `rotateApiKey`, and `revokeApiKey` all call `requireCapability(...)` before mutating.
- [webhooks/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/tenant-portal-web/app/webhooks/page.tsx:209) renders read-only vs writable webhook messaging from `canWriteWebhooks`.
- [webhooks/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/tenant-portal-web/app/webhooks/page.tsx:312) exposes baseline events, retry contract, validation rules, and failure notice channel as an authority policy snapshot.
- [webhooks/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/tenant-portal-web/app/webhooks/page.tsx:935) server-actions `createWebhook`, `updateWebhook`, and `deleteWebhook` all call `requireCapability(...)` before mutating.

Reviewer expectation: non-admin or read-only identities can audit inventory/health, but issuance, rotation, endpoint writes, and destructive actions stay blocked server-side.

### 4. Route-handler auth boundary

- [lib/api-client.ts](/home/edna/workspace/drts-fleet-platform/apps/tenant-portal-web/lib/api-client.ts:86) provides `getTenantClientForRouteHandler()` so handlers can reject anonymous traffic without redirect semantics.
- [update route](/home/edna/workspace/drts-fleet-platform/apps/tenant-portal-web/app/api/bookings/[orderId]/update/route.ts:11) returns `401` with `Tenant portal session required.` when no session cookie exists.
- [cancel route](/home/edna/workspace/drts-fleet-platform/apps/tenant-portal-web/app/api/bookings/[orderId]/cancel/route.ts:10) uses the same boundary for cancellation.

Reviewer expectation: route handlers no longer reach the backend on anonymous requests and express session failure as HTTP `401`, not as silent local fallback.

### 5. One-time API key reveal flow

- [api-keys/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/tenant-portal-web/app/api-keys/page.tsx:263) detects the flash cookie and redirects to `/api-keys/reveal`.
- [api-keys/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/tenant-portal-web/app/api-keys/page.tsx:775) writes the one-time flash cookie after successful issue/rotate.
- [reveal/route.ts](/home/edna/workspace/drts-fleet-platform/apps/tenant-portal-web/app/api-keys/reveal/route.ts:38) consumes the flash cookie, serves the plaintext once, sends `cache-control: no-store`, and clears the cookie before returning.
- [reveal/route.ts](/home/edna/workspace/drts-fleet-platform/apps/tenant-portal-web/app/api-keys/reveal/route.ts:43) redirects back to `/api-keys` with an error when no pending flash payload exists.

Reviewer expectation: plaintext credentials are only exposed through the one-time reveal route, never persisted in the normal index view.

## Dependency Context

The parent task records these dependencies as satisfied in machine truth:

- `TEN-UI-001`
- `TEN-UI-007`
- `XS-UI-003`
- `TEN-MP-001`

This packet does not restate their implementation details; it only relies on the recorded fact that parent closeout already passed with those dependencies resolved.

## Reviewer Handoff

This packet is ready for reviewer confirmation against the existing machine-truth parent closeout. If approved, the sidecar task should be marked via `AI_NAME=Codex2 scripts/ai-status.sh approve TEN-UI-008-SIDECAR-REVIEW "<review conclusion>"`.
