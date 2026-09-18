# REL-REF-EMBED-002 Unblock Planning Decision

## Scope

- Task: `REL-REF-EMBED-002-UNBLOCK-PLANNING-DECISION`
- Parent: `REL-REF-EMBED-002`
- Owner: `Codex`
- Reviewer: `Codex2`
- Decision date: `2026-08-02`

## Diagnosis

`REL-REF-EMBED-002` was routed as though the remaining blocker were a missing
product or contract decision for the Yuhe Referral Embed live proof. The
canonical repo state is narrower:

1. The formal dev acceptance entry is already fixed to
   `https://refer.smarttransport.tw/embed/yuhe-residence`, with
   `entryHost=app.yuhe-living.com.tw`. This is documented in
   `apps/referral-embed-web/README.md`,
   `docs/03-runbooks/smarttransport-tw-custom-domains.md`, and
   `docs/02-architecture/app-entry-url-index-20260616.md`.
2. Those same artifacts already distinguish the formal dev URL from production
   cutover and explicitly say that dev acceptance keeps
   `REFERRAL_EMBED_DEMO=true` until a separately delivered host-backend
   credential flow exists.
3. The accepted UI/lifecycle/security surfaces are already covered by
   `support/sidecars/E2E-REF-EMBED-001/E2E-REF-EMBED-001-SIDECAR-ACCEPTANCE.md`
   plus the deployed smoke sources
   `playwright.referral-embed.config.ts` and
   `tests/e2e/referral-embed-surfaces.spec.ts`. Those artifacts already verify
   the formal `yuhe-residence` entry, frame/CSP fail-closed behavior, and the
   handoff / reauth / consent / fallback route inventory.
4. The remaining gap is live session issuance, not product semantics. Repo code
   already fixes that contract:
   - `apps/referral-embed-web/lib/embed-api.ts` sends server-only authority
     requests with `x-drts-internal-key` when configured.
   - `apps/referral-embed-web/app/api/referral/session/route.ts` only creates a
     real referral session by consuming a referral handoff artifact and then
     writing the secure cookie.
   - `apps/api/src/modules/tenant-partner/tenant-partner.service.ts` requires
     the exact `entryHost` match when issuing the referral embed handoff.

The parent therefore is not blocked on a missing product/contract choice. It is
blocked on external live-integration inputs: a mounted service secret/internal
key, partner-scoped handoff credentials, and a real Yuhe host-app/backend path
that mints the handoff artifact for the formal entry.

## Canonical Sources Consulted

1. `apps/referral-embed-web/README.md`
2. `docs/03-runbooks/smarttransport-tw-custom-domains.md`
3. `docs/02-architecture/app-entry-url-index-20260616.md`
4. `support/sidecars/E2E-REF-EMBED-001/E2E-REF-EMBED-001-SIDECAR-ACCEPTANCE.md`
5. `playwright.referral-embed.config.ts`
6. `tests/e2e/referral-embed-surfaces.spec.ts`
7. `apps/referral-embed-web/lib/embed-context.ts`
8. `apps/referral-embed-web/app/api/referral/session/route.ts`
9. `apps/referral-embed-web/lib/embed-api.ts`
10. `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`

## Decision

`REL-REF-EMBED-002` is unblocked on the product/contract interpretation.

The binding decisions are:

1. The formal dev acceptance URL, entry slug, and allowed host are already
   fixed. They do not need reopening.
2. The accepted Referral Embed UI/lifecycle/security contract is already
   reviewable without a new planning decision. Existing sidecar and Playwright
   evidence already cover the `handoff`, `reauth`, `consent`, `fallback`, and
   fail-closed iframe/CSP states.
3. The repo does not claim that the formal dev URL alone proves a real Yuhe
   host-app/backend handoff. The accepted README and runbook text explicitly
   separate formal dev URL publication from the later credential-backed host
   integration.
4. A real live session on `yuhe-residence` depends on external inputs that the
   parent task itself cannot mint from repo-only state:
   - `DRTS_INTERNAL_KEY` or `REFERRAL_EMBED_SESSION_SECRET` mounted in the
     deployed path that performs session exchange/signing
   - partner-scoped credential input for the Yuhe referral handoff
   - a real host-app/backend flow that posts the referral handoff artifact for
     `entrySlug=yuhe-residence` and exact `entryHost=app.yuhe-living.com.tw`

## Scope Cut And Routing

This helper task does **not** change the parent's live-proof target and does
**not** introduce a product scope cut.

Out of scope for this helper:

1. Provisioning Yuhe partner credentials or host-app/backend access.
2. Mounting `DRTS_INTERNAL_KEY` / `REFERRAL_EMBED_SESSION_SECRET` in the live
   deploy path.
3. Minting a real referral embed handoff artifact.
4. Re-running the live Yuhe authorized-flow proof after those inputs arrive.

The routing change is classification only:

- stop describing the blocker as a missing product/contract decision
- keep the already accepted formal URL, CSP, deny-path, and UI-state evidence
- route the remaining work to external live session issuance and verification

If the project later wants to downscope the parent away from real live handoff
proof, that would be a separate acceptance/scope decision. This helper does not
make that cut.

## Parent Unblocked Next Step

The parent task should replace any vague planning-blocker wording with this
concrete next step:

1. Keep `REL-REF-EMBED-002` classified as release/live-proof work, not planning
   work.
2. Reuse the already accepted evidence for:
   - formal dev URL / canonical entry publication
   - iframe allowlist and CSP fail-closed behavior
   - handoff / reauth / consent / fallback surface parity
3. Treat the only remaining gap as external live handoff readiness:
   - mount `DRTS_INTERNAL_KEY` or `REFERRAL_EMBED_SESSION_SECRET`
   - obtain the Yuhe partner-scoped credential + host-app/backend handoff path
   - mint a real referral handoff for `yuhe-residence` with exact
     `entryHost=app.yuhe-living.com.tw`
   - exchange it through `/api/referral/session`, then capture the formal URL's
     real authorized-session proof and its denial/replay/cross-entry negatives
4. Until those external inputs exist, do not relabel the parent as a planning
   task and do not reopen product semantics.

Recommended parent status after this helper closes: still `blocked`, but on the
external live-handoff dependency rather than on a missing product decision.

## Machine-Truth Note

`ai-status` can only encode agent identities in `waiting_for`. The true blocker
here is an external host/backend/credential dependency, so the parent task's
`next` field must carry the concrete live-handoff step above even if the
`waiting_for` field cannot represent that dependency perfectly.

## Acceptance Mapping

| Acceptance item | Result |
| --- | --- |
| Resolve or route the missing product/contract decision through canonical planning artifacts | Resolved as routing-only: canonical repo docs already define the formal dev Referral Embed URL, host allowlist, and demo-vs-live distinction. |
| Record the decision | Recorded here: no new product or contract decision is needed for `REL-REF-EMBED-002`. |
| scope cut | No product scope cut introduced. This helper only reclassifies the remaining blocker as external live-handoff work. |
| or explicit follow-up needed by the parent task | Recorded in `Parent Unblocked Next Step`: external secret/credential/handoff issuance plus live proof replay. |
| Produce task-scoped commit/push/PR evidence for any canonical change | To be attached on this task branch with this unblock artifact. |
| Update the parent task with the concrete unblocked next step | The parent should now point at the external live-handoff checklist above instead of a planning blocker. |
