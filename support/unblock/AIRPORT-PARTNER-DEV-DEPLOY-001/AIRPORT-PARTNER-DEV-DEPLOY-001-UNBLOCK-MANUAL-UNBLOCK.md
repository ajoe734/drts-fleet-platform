# AIRPORT-PARTNER-DEV-DEPLOY-001 unblock note

Last updated: 2026-07-28
Task: `AIRPORT-PARTNER-DEV-DEPLOY-001-UNBLOCK-MANUAL-UNBLOCK`
Parent task: `AIRPORT-PARTNER-DEV-DEPLOY-001`
Owner: `Codex2`
Reviewer: `Codex`

## Summary

The remaining blocker on `AIRPORT-PARTNER-DEV-DEPLOY-001` is a repo-local code
bug in the airport partner embed flow, not a mystery runtime-only failure.

The deployed dev smoke uses:

- `https://drts-dev-partner-booking-web-ne55h7sy3a-uc.a.run.app/ctbc/program/embed?apiKey=pk_live_embed&partnerUserRef=user-001&referenceToken=token-001&cardLast4=1234&cardholderName=%E7%8E%8B%E5%B0%8F%E6%98%8E&benefitReference=benefit-001&flightNo=CI100`

But `apps/partner-booking-web/app/[tenantSlug]/program/embed/page.tsx` did not
read or forward the `apiKey` query parameter into the submit path. As a result,
the final booking submit incorrectly fell back to the internal-bootstrap branch
instead of using the partner ingress API-key branch that the embed URL was
supplying.

## Diagnosis

The failure is reproducible against the currently deployed dev site:

- local repro date: 2026-07-28
- failing response: submit POST back to the embed page returned `HTTP 500`
- observed Next digest: `2836643380`
- visible UI symptom: the confirmation step stays on screen and renders the
  generic production message:
  `An error occurred in the Server Components render...`

The repo-local root cause is:

1. `tests/e2e/partner-booking-surfaces.spec.ts` navigates to the embed flow
   with `apiKey=pk_live_embed`
2. `app/[tenantSlug]/program/embed/page.tsx` ignored `apiKey`
3. `lib/embed-airport-booking.ts` therefore called
   `createPartnerIngressHandoff({ entrySlug, partnerUserRef })`
   instead of forwarding the supplied API key
4. the deployed dev flow then failed inside the server action path during final
   submit, producing the digest above

## Task-scoped fix

The canonical fix is now staged in code:

- `apps/partner-booking-web/app/[tenantSlug]/program/embed/page.tsx`
  now reads `apiKey` from `searchParams` and forwards it to the submit helper
- `apps/partner-booking-web/lib/embed-airport-booking.ts`
  now includes `apiKey` when creating the partner ingress handoff
- `apps/partner-booking-web/tests/integration/embed-airport-booking.test.ts`
  now asserts that an embed-supplied API key is forwarded to the handoff call

## Verification

Verified on 2026-07-28:

- `pnpm exec playwright test --config playwright.partner-booking-surfaces.config.ts --grep "creates a real booking from the airport embed flow"`
  against local mock-backed app: `PASS`

Historical deployed-dev repro before redeploy:

- `DRTS_DEV_PARTNER_BOOKING_BASE_URL='https://drts-dev-partner-booking-web-ne55h7sy3a-uc.a.run.app' PARTNER_BOOKING_SKIP_WEBSERVER=1 pnpm exec playwright test --config playwright.partner-booking-surfaces.config.ts --grep "creates a real booking from the airport embed flow"`
  reproduced the current dev failure before this fix is redeployed: `FAIL`

Verification limitation:

- package-level vitest execution in this isolated worktree currently fails
  because `node_modules/vitest` is symlinked to another worker worktree:
  `.artifacts/worktrees/auto/codex2-airport-partner-ui-smoke-fix-001/...`
  so `vitest.mjs` is not resolvable from this worktree

## Concrete next step for the parent

`AIRPORT-PARTNER-DEV-DEPLOY-001` should now proceed with the patched branch:

1. commit and push the `apiKey` forwarding fix
2. rerun the dev deploy workflow so `partner-booking-web` picks up the patch
3. rerun the real airport embed smoke on deployed dev
4. if the smoke passes, continue the parent closeout evidence chain
5. if it still fails, capture the new digest / API error because the original
   blocker (`apiKey` being dropped) has already been removed from source
