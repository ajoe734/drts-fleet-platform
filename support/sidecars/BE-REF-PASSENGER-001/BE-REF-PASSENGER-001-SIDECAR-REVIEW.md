# BE-REF-PASSENGER-001 Review Packet

Last updated: 2026-08-01
Prepared by: Codex
Assigned reviewer: Gemini2
Parent task: `BE-REF-PASSENGER-001`
Dependency covered here: `BE-REF-HANDOFF-001`

## Scope

This sidecar packet is support-only. It does not change canonical truth or runtime behavior.

Purpose:

- summarize the already-landed handoff/session hardening that `BE-REF-PASSENGER-001` depends on
- give the reviewer a compact evidence map instead of requiring a full repo rediscovery
- highlight the highest-value follow-up checks for the parent passenger flow review

## Machine-truth snapshot

- Dependency task: `BE-REF-HANDOFF-001`
- Status: `done`
- Recorded commit: `6ea50dd2b3e5d7137b728672a8a160ff26bff925`
- Commit subject: `BE-REF-HANDOFF-001: durable S2S handoff and referral session hardening (#1219)`
- Recorded remote: `origin/dev`
- Recorded reviewer: `Gemini2`

## What the dependency delivered

From task metadata plus current source inspection, the dependency established the referral-embed handoff/session baseline required by the passenger booking slice:

1. A versioned contract for single-use referral embed handoff artifacts, consent bundles, and session identity.
2. Durable storage for handoff issuance and consent ledger records.
3. Internal-key protected consume/consent server endpoints for the embed handoff flow.
4. Secure `HttpOnly` browser session persistence for the referral embed surface.
5. Fail-closed host/entry binding in middleware to block cross-entry or wrong-host session reuse.

## Evidence map

### 1. Contract and invariants

- `packages/contracts/src/referral-channel.ts`
- `CreateReferralEmbedHandoffArtifactCommand` binds `entrySlug`, `entryHost`, and `partnerUserRef`.
- `ReferralEmbedHandoffArtifact` is explicitly `tokenType: "SingleUse"` and `expiresIn: "120s"`.
- `REFERRAL_EMBED_REQUIRED_CONSENT_SCOPES` is fixed to:
  - `trip.manage`
  - `pii.trip`
  - `identity.bind`
- `ReferralEmbedSession` carries `handoffId`, `partnerEntrySlug`, `entryHost`, `drtsPassengerId`, consent state, and downstream identity fields required by passenger APIs.

### 2. Durable handoff and consent persistence

- `apps/api/src/modules/tenant-partner/referral-embed-handoff.repository.ts`
- `issue()` hashes the artifact before persistence and stores `entry_slug`, `entry_host`, passenger identity, consent metadata, issuance time, expiry, and consumption state.
- `consume()` atomically updates `consumed_at` only when artifact hash, entry slug, entry host, and expiry are all valid; result codes distinguish `consumed`, `replayed`, `expired`, `wrong_host`, and `missing`.
- `recordConsent()` stores versioned consent ledger records keyed by `handoff_id + bundle_version`, preventing duplicate logical grants while preserving replay semantics.

### 3. Database backing

- `infra/migrations/V0067__referral_embed_handoff_and_consent_ledger.sql`
- Adds `admin.phase1_referral_embed_handoffs`.
- Adds `admin.phase1_referral_embed_consent_ledger`.
- Adds a unique index on `(handoff_id, bundle_version)` for the consent ledger.
- Adds lookup indexes by `(entry_slug, entry_host, expires_at)` and passenger id for reviewability and consumption lookups.

### 4. API surface and host-binding enforcement

- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
- Open-route issue endpoint: `POST partner/ingress/referral-embed-handoff`
- Internal-key protected consume endpoint: `POST partner/ingress/referral-embed-handoff/consume`
- Internal-key protected consent endpoint: `POST partner/ingress/referral-embed-handoff/consent`

- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`
- `issueReferralEmbedHandoffArtifact()` returns a 120-second single-use artifact.
- `resolveReferralEmbedHandoff()` rejects issuance if requested `entryHost` does not exactly match the configured partner entry host.
- `consumeReferralEmbedHandoffArtifact()` maps repository outcomes to stable HTTP failures:
  - replay -> `409 REFERRAL_HANDOFF_REPLAYED`
  - expired -> `410 REFERRAL_HANDOFF_EXPIRED`
  - wrong host -> `403 REFERRAL_HANDOFF_HOST_MISMATCH`
  - missing -> `404 REFERRAL_HANDOFF_NOT_FOUND`
- `recordReferralEmbedConsent()` requires the exact consent bundle and rejects wrong-host writes.
- `assertExactReferralEmbedConsentBundle()` enforces exact-scope matching and non-empty bundle version.

### 5. Web session behavior

- `apps/referral-embed-web/app/api/referral/session/route.ts`
- Handles two actions only:
  - `exchange`
  - `grant-consent`
- On either path, success writes the referral embed session cookie; failure clears it and returns `400`.

- `apps/referral-embed-web/lib/embed-partner-session.ts`
- Session cookie name: `drts_referral_embed_session`
- Cookie settings:
  - `httpOnly: true`
  - `sameSite: "lax"`
  - `secure` in production
  - `maxAge: 8h`
- Consent grant helper always sends the exact required scope set and a versioned bundle id: `referral-embed-consent-v1-2026-08-01`

### 6. Middleware fail-closed checks

- `apps/referral-embed-web/middleware.ts`
- Blocks embed rendering with `403` when:
  - session `partnerEntrySlug` does not match the requested `/embed/[entrySlug]`
  - session `entryHost` does not match the currently requested entry host
  - embed-security host/origin policy itself denies the request
- Uses explicit block reasons:
  - `cross_entry_session_forbidden`
  - `entry_host_session_forbidden`

### 7. Visible test evidence in this worktree

- `tests/unit/referral-embed-security.test.ts`
- Confirms:
  - allowlist normalization/deduplication
  - CSP/postMessage narrowing to the authorized `entryHost`
  - unauthorized host and origin rejection
  - localhost handling for local verification
  - cross-entry session reuse blocked with `403 cross_entry_session_forbidden`

## Recorded verification from dependency task metadata

The dependency task was recorded as verified with:

`pnpm --filter @drts/contracts lint && pnpm --filter @drts/api lint && pnpm --filter @drts/referral-embed-web lint && pnpm --filter @drts/contracts typecheck && pnpm --filter @drts/api typecheck && pnpm --filter @drts/referral-embed-web typecheck && pnpm --filter @drts/contracts build && pnpm --filter @drts/api build && pnpm --filter @drts/referral-embed-web build && pnpm vitest tests/contracts/referral-partner-session-contract.spec.ts tests/api/tenant-partner/referral-partner-session.service.spec.ts tests/referral-embed/security/referral-session-route.spec.ts tests/referral-embed/security/referral-middleware.spec.ts && pnpm playwright test tests/referral-embed/security/referral-embed-security.spec.ts`

Note: those exact paths are not all present in the current isolated worktree snapshot, so this packet treats the verification command as machine-truth evidence from the recorded dependency task, not as a rerun performed in this sidecar slice.

## Reviewer focus for `BE-REF-PASSENGER-001`

When reviewing the parent passenger flow, the highest-value dependency checks are:

1. Passenger endpoints must consume only the referral embed session identity derived from this handoff flow, not any looser browser-provided identity.
2. Any create/history/receipt/cancel/rating route must preserve the same `tenantId`, `partnerId`, `partnerProgramId`, `partnerEntrySlug`, and `drtsPassengerId` authority chain carried in the handoff session.
3. Error propagation should preserve the dependency's explicit host/entry mismatch semantics instead of collapsing them into generic `400/500`.
4. No route should reintroduce browser credential URLs or fixture-backed success paths that bypass the handoff/session gate.

## Handoff summary for Gemini2

Recommended review posture:

- treat `BE-REF-HANDOFF-001` as the accepted security/session foundation
- focus parent-task review effort on whether passenger lifecycle routes honor that foundation end to end
- if you find a regression, cite whether it breaks contract invariants, host binding, or passenger authority isolation

## Owner closeout note

- `2026-08-01`: `Gemini2` approved this support packet for owner finalization.
- This sidecar remains support-only and introduces no canonical truth changes.
- Closeout expectation: push the task branch and mark machine truth `done` with `INTEGRATION_STATUS=branch_pushed`.
