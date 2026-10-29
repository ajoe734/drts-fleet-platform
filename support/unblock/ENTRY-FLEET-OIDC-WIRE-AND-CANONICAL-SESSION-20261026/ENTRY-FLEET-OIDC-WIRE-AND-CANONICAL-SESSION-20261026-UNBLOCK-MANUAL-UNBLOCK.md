# Fleet OIDC remaining-blocker diagnosis

Task: `ENTRY-FLEET-OIDC-WIRE-AND-CANONICAL-SESSION-20261026-UNBLOCK-MANUAL-UNBLOCK`  
Owner / reviewer: Codex / Claude  
Observed: 2026-10-29 UTC

The parent has delivered its source repair. Its remaining requirement is
`same_release_legitimate_fleet_oidc_session_readback`, which has no recorded
acceptance evidence. Empty `depends_on` does not supply a legitimate IdP account,
an active Fleet entry, or a real callback/session observation. This helper changes
only this diagnosis document; it supplies no new product candidate or live
acceptance credit for the parent.

The parent remains **blocked**. The Supervisor must update its next action and
persist the helper's blocked-parent disposition before this helper can merge.
The dispatched owner cannot perform those cross-task/metadata transactions.
Keep this helper's PR draft until that coordination is recorded; reviewer may
review the document, but approval/merge must wait for that machine-truth update.

## Evidence and diagnosis

1. The parent's frozen source candidate is
   `029380eac03e5d7cb121f30c1e4ad87cbfe8254b`, generation
   `051e9f1e4bed42679b987fb3afa9b1b8`.
   [PR #3042](https://github.com/ajoe734/drts-fleet-platform/pull/3042) is merged
   as `50387a6ad8d3f4f3186d590b02bde571d062c158`.
   Both exact-candidate runs
   [40271136478](https://github.com/ajoe734/drts-fleet-platform/actions/runs/40271136478)
   and
   [40271136486](https://github.com/ajoe734/drts-fleet-platform/actions/runs/40271136486)
   are completed/success. These facts were reread from GitHub, rather than
   inferred from an old handoff.
2. The original Source evidence records independent 8-file/87-test verification
   and all five merge blobs matching the candidate. Those are historical
   source checks, **not checks rerun by this helper**. The parent already records
   `reviewed_existing_fleet_oidc_wire_and_canonical_issuance`. No accepted source
   finding needs another implementation here.
3. The parent's next text still describes a future combined-CI/Nightly/deploy
   after merge `50387a6…`. Subsequent
   [deployment 40662565606](https://github.com/ajoe734/drts-fleet-platform/actions/runs/40662565606)
   uses `1a3fbf8bca9e607085eb0c2e670b46763331f1da`, which contains that merge
   (`git merge-base --is-ancestor`, exit 0). Build, migration, Deploy services
   and Dev health check jobs succeeded. The overall run failed: operational
   acceptance job `122737209282` and quote-expiry job `122737209316` failed.
   Deployment and health success do not establish human OIDC acceptance. This
   metadata observation does not claim the current live traffic is still on
   that release.
4. [FULL run 40681440811](https://github.com/ajoe734/drts-fleet-platform/actions/runs/40681440811)
   is completed/success; its workflow-definition head is
   `ad13694ccfc868aaa59b967200ac443029b9787a`, not a substitute runtime SHA.
   Its existing Fleet setup is `prepareOperationalFleetSession` in
   `tests/e2e/operational-document-upload.ts`, called from
   `tests/e2e/owned-referral-business-journey/owned-business.spec.ts`.
   The setup POSTs `/api/auth/partner/bootstrap-session` with its own API key
   and reads `/api/auth/session`. That is valid evidence for its own journey;
   it does not traverse the human IdP callback or prove this parent's second
   acceptance key. The bootstrap path was also checked at that immutable
   workflow-definition head.
5. `SR-LIVE-ENTRY-001` remains the existing operator/account handoff, with
   `external_gate=true` and its original four acceptance keys. Its integration
   notes require a legitimate browser login and captured events, not injected
   identity. The existing `entry-acceptance-runner.ts` consumes an already
   issued role token and checks tenant OIDC initiation; it cannot itself supply
   a human Fleet callback receipt. No alternate runner is introduced here.
6. Fresh repository variable reads returned `drts-dev-devcc-20260825` /
   `us-central1`. No cloud authentication, secret access, provider probe,
   workflow dispatch, deployment or DNS change was performed.

## Concrete original-operator next step

The original unique `SR-LIVE-ENTRY-001` / shared-dev operator (currently Codex in
the task slice) should first join the existing recovery handle and respect the
seven-owned-order custody HOLD described in `SR-ACCEPT-001`. This helper does not
authorize another FULL, deployment, booking, supply setup or recovery writer.

Using the already authorized environment/account handoff:

1. Read the actually served Fleet and API revisions/traffic and pin one common
   immutable source SHA containing `50387a6…`. Existing deployment metadata is
   preparation evidence; it is not a fresh traffic readback. If that release is
   unavailable, report the exact mismatch through the original delivery task.
2. Use a legitimate human IdP account and the intended active Fleet entry with
   its existing callback registration. Follow the existing Fleet
   `GET /api/auth/login?partner_id=<entry>` route into the real provider and back
   to `/api/auth/callback`; do not inject a token or use API-key bootstrap.
3. Observe the callback-created `drts_session` cookie (`Secure`, `HttpOnly`,
   `SameSite=Lax`, path `/`, eight-hour lifetime) and removal of
   `drts_oidc_state`. Then call the existing Fleet `GET /api/auth/session` with
   that cookie, which forwards to the API's canonical `/api/auth/session`.
   Preserve redacted evidence of `active=true`, the expected `partner_user`
   identity, tenant/partner/entry binding, canonical principal/session identity
   and source/revision pins. Do not put bearer, authorization code, state-cookie
   value or personal IdP identifiers in the public artifact.
4. Return the retrievable run/event/readback evidence to the original task's
   owner/reviewer and record only the existing second acceptance key through
   the authorized lifecycle. If the legitimate account, entry, registration or
   hosted browser path is unavailable, name the specific missing resource in
   the parent's blocker; this helper did not test their availability.

The production chain was read in
`apps/fleet-partner-portal-web/app/api/auth/[...auth]/route.ts` (`GET` login,
callback and session), `apps/api/src/modules/auth/oidc-pkce.service.ts`
(`exchangePartnerCallbackSession`, existing `issueSessionToken` call), and
`apps/api/src/modules/auth/auth.controller.ts` (`getAuthSession`). The separate
`resolveFleetPrincipal` consumer continues to require canonical backend identity
and its existing Fleet scopes. A restricted human session need not have broad
billing permissions to prove login/session readback; managed business-role
acceptance remains in its original task. No role grant or policy change is
justified by this diagnosis.

## Supervisor transaction required before helper merge

The active release's `TaskBoardCommandExecutor._guard_worker_command` permits
this dispatch to mutate only this helper via lifecycle commands. A normal
`AI_NAME=Codex .../ai-status.sh note <parent> <next>` attempt returned exit 1:
`Dispatched worker cannot mutate a different task`. A before/after `show` proved
the parent's status, next, last update, frozen candidate, review, CI, merge and
acceptance evidence unchanged. No fence was removed or identity impersonated.

Through the **Supervisor's own context**, use the supplied release CLI to:

1. `note` the parent with the concrete next action above. The exact prepared
   text is in the local evidence directory's `parent-next.txt`.
2. Persist these helper metadata fields using the existing `assign` transaction
   with `TASK_METADATA_JSON`, preserving Codex / Claude and all other metadata:

   ```json
   {
     "resolved_parent_status": "blocked",
     "resolved_parent_waiting_for": "Codex",
     "resolved_parent_next": "<the concrete parent-next.txt text>"
   }
   ```

3. Reread both task slices, then release the draft PR for ordinary candidate
   review/CI/merge. `apply_unblock_parent_resolution` will preserve `blocked`
   when the helper completes. Without these fields its default is `todo`,
   which would incorrectly redispatch source work. `PARENT_STATUS` set only in
   an owner's `handoff` environment does not persist this disposition.

The active release also has a Supervisor-only
`resume-blocked ... acceptance` route with basis
`merged_runtime_acceptance_ready`. It cannot bypass an unfinished helper and
requires a fresh exact identity/dependency/blocker snapshot. This helper neither
invokes that route nor claims its admission conditions are satisfied. If the
remaining runtime resources become available, the Supervisor can assess that
existing route without reopening accepted source or defaulting to `todo`.

## Finding / acceptance verification

| Finding / acceptance                     | Source and change                                                          | Old → current result                                                 | Command / evidence                                                               | Remaining limit                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Diagnose dependency-ready blocked parent | Parent required keys; existing Fleet callback / issuer / session consumers | Source key recorded; human callback/session key absent               | Active-release `show`; `gh pr view 3042`; exact-candidate `gh run view`, exit 0  | No real IdP/PG/browser acceptance performed                                       |
| Make only the scoped unblock change      | This document only                                                         | Documents stale deployment next and unmet second key                 | `git diff --check` and content/reference checks in delivery receipt              | Parent remains blocked; no product fix needed by current evidence                 |
| Canonical commit / push / PR             | This task branch and document                                              | Candidate is the full pushed head supplied at handoff                | Delivery receipt and machine handoff record exact SHA, remote head and draft PR  | Review/CI/merge are separate and pending at owner handoff                         |
| Update parent with next step             | Parent note; helper disposition via release CLI                            | Parent-note attempt rejected by worker fence; before/after unchanged | `diagnosis-20261029.json`, command `requested-parent-note-fenced`, exit 1        | Supervisor must apply note and metadata before helper merge; not claimed complete |
| Preserve first parent required key       | Existing exact candidate / review / own CI / protected merge               | Existing accepted Source evidence retained unchanged                 | Original Source packet and hashes below                                          | Historical tests are not rerun or relabeled live                                  |
| Second parent required key               | Real Fleet login → cookie → canonical self readback                        | UNMET → UNMET                                                        | No evidence registered for `same_release_legitimate_fleet_oidc_session_readback` | Original operator / legitimate account / hosted same-release observation          |

This documentation-only change uses content, source and metadata checks; there
is no new behavioral regression to test. Unit/typecheck suites were not rerun.
Product, preview, browser/E2E, PG and Compose servers were not started on this VM.
No synthetic/mock result is presented as external acceptance. Original parent
keys, broader role inventory and production HOLD remain unchanged.

Machine-specific evidence directory:
`/home/lupin/workspace/drts-fleet-platform/.local/unblock/ENTRY-FLEET-OIDC-WIRE-AND-CANONICAL-SESSION-20261026-UNBLOCK-MANUAL-UNBLOCK/`.
`diagnosis-20261029.json` contains command arguments, exit codes, metadata
responses, the rejected parent note, unchanged-parent comparison, and hashes of
the original source/approval/preflight packets. `delivery-20261029.json` records
document checks and publication identity after commit/push/PR.

Original Source packet:
`/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T-current-frontier/Root-Fleet029-own-two-CI-success-protected503-and-Source-key-only-20261026.json`,
SHA256 `1c3cf1b2a458c30ee51195a34711edb431c7c1fdf050f2d63053489b34411403`.
