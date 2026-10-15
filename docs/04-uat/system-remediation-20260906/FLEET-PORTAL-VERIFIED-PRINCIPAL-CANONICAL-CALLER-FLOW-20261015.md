# Fleet portal verified principal and canonical caller flow

Task: `FLEET-PORTAL-VERIFIED-PRINCIPAL-CANONICAL-CALLER-FLOW-20261015`  
Owner: Codex · Reviewer: Codex2  
Status: **Source checkpoint; incomplete, no candidate handoff or acceptance claim.**

Base: `6dfff99fcc8f54d10fc18c1f19c5bcfabeb57add`. Tested source checkpoint:
`9d70dae0d6ea7ca95e041ecc63f3733fc4df12a3`. Branch:
`codex/fleet-portal-verified-principal-canonical-caller-flow-20261015`.
Later documentation commits do not replace that tested source identity.

## Source changes and authority

- `lib/fleet-principal.server.ts::resolveFleetPrincipal` forwards the existing
  `x-drts-authorization`/Authorization bearer or existing application session
  cookie to the real `/api/auth/session`. Only the backend-verified active
  partner principal with `billing:read`, actorId and canonical partnerId can
  bind the requested/configured single-fleet selector. Both selector sources
  are checked independently; neither creates authority. No JWT claim decoding,
  email-to-role mapping, new issuer or Academy tenant-to-partner conversion.
- `lib/api-client.server.ts::FleetPortalApiClient` inherits the existing SDK's
  endpoint/list methods while dispatching through an app-local no-store
  transport. It avoids the legacy factory's generated `x-realm`; JSON success
  wire normalization matches the SDK and error business metadata stays intact.
  Endpoint options cannot replace the verified bearer or fleet. Invocation
  proof is separately minted into `x-serverless-authorization`.
- `app/control-plane-proxy/[...path]/route.ts::forward` shares the session
  authority, strips browser identity headers, rejects mismatched selectors and
  cross-origin requests, preserves raw request bytes, response streaming,
  status, content headers and upstream error bodies. It does not create a
  bootstrap identity. Invocation/session failures have explicit error codes.
- `FleetPartnerController` Supply create/update/submit/withdraw/document,
  statement decisions, case reply and attachment attribution use
  `CurrentIdentity.actorId`. The old second actor argument remains undecorated
  solely for direct TypeScript caller compatibility; HTTP cannot populate it.
  There is no header/fallback attribution. Existing documentPartner checks
  bind writes to canonical partnerId. Platform/ops reviewer methods and Supply
  transaction/revision/maker-checker logic are unchanged.

The backend guard and original route policy remain authoritative for required
capabilities on every API request, including revocation after client creation.
No roles/scopes or new authentication policies are granted by this change.

## Findings and required acceptance

| Finding / acceptance key                                                                                 | Production basis / change                                                                                   | Before → after                                                                                                                                                                                                                                           | Evidence                                                                                                                                          | Remaining limitation                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 generated bootstrap identity / `fleet-portal_existing-verified-principal-and-canonical-fleet-binding` | Actual server client, proxy, `/api/auth/session`, BootstrapAuthGuard, JwtAuthService and IdentityRepository | Immutable base fails lawful mounted bearer and missing-principal cases; fixed source forwards real bearer and rejects missing/expired/revoked/wrong realm/scope/binding/fleet                                                                            | `principal.test.ts`, `mounted-flow.test.ts`; before replay 5 failed / 1 legacy trap passed; current task suite 32 passed                          | Target deployment's lawful partner credential/issuer binding has not been supplied or demonstrated; no live end-to-end claim                                                                      |
| F2 header/fallback command actor / `fleet-portal_strict-transport-and-actual-command-actor`              | Actual controller CurrentIdentity decorator and real Supply/Case services                                   | Base direct controller passes spoofed actor; fixed command/receipt/document/readback actor equals verified principal                                                                                                                                     | Same immutable before replay; actual Nest route/argument metadata dispatcher; original controller scenarios 10 passed within task suite           | Existing direct-caller fixture expectations need the exact adaptations below; platform reviewer identity is preserved                                                                             |
| F3 original mounted flows / `fleet-portal_original-mounted-flow-and-denial-regressions`                  | Actual SDK endpoint methods → local proxy → real guard/controller → real Supply/document/Case service       | Server/proxy dashboard and real lists agree; true empty Supply list and real 404/error remain honest; driver/vehicle draft/update/document request→content→confirm→submit→withdraw and byte download succeed; case receipt/timeline carry verified actor | `mounted-flow.test.ts`; SDK list casing, no-store, independent IAM proof, streamed 206 bytes/disposition, 409 details and late revocation covered | **Incomplete:** existing cookie-based browser mutation callers omit the original CSRF header; real middleware rejects them before proxy. Actual form submission through middleware is not claimed |
| F4 exact validation / `fleet-portal_exact-candidate-validation`                                          | Same immutable source loaded by Vite pre-load plugin; no active-tree reset                                  | 5 meaningful old-source failures → 6 principal tests pass; full task suite 32 passed                                                                                                                                                                     | Commands below and local logs                                                                                                                     | Retained suites have two stale assertions plus two suite-load errors; exact scope coordination pending. Independent review, mandatory CI/protected merge and acceptance have not run              |

## Reproducible checks

All commands run in the assigned isolated worktree, Node 22.23.2,
Vitest 4.1.4. No server, browser/E2E server, Docker or deployment was started.
Machine-specific logs are under `.local/fleet-portal-principal/` in this worker.

| Command                                                                                                                                                                                                                 | Exit / result                                                                                                                                                               | Log                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `pnpm exec vitest run -c tests/unit/fleet-portal-verified-principal-canonical-caller-flow-20261015/before.vitest.config.ts tests/unit/fleet-portal-verified-principal-canonical-caller-flow-20261015/principal.test.ts` | 1, expected defect reproduction: 5 failed / 1 legacy SDK trap passed; immutable base `6dfff99…` production client/proxy/controller loaded with `git show`                   | `before-final.log`           |
| `pnpm exec vitest run -c tests/unit/fleet-portal-verified-principal-canonical-caller-flow-20261015/vitest.config.ts`                                                                                                    | 0, 4 files / 32 tests passed; includes 10 original controller tests and 2 explicit CSRF boundary tests, which do not claim browser integration                              | `after-final.log`            |
| `pnpm exec tsc -p tests/unit/fleet-portal-verified-principal-canonical-caller-flow-20261015/tsconfig.json --noEmit`                                                                                                     | 0, source-mapped task types                                                                                                                                                 | `scoped-typecheck-final.log` |
| ESLint `--max-warnings=0` on all changed TS source/controller tests and the task test directory                                                                                                                         | 0                                                                                                                                                                           | `lint-final.log`             |
| `pnpm --filter @drts/fleet-partner-portal-web typecheck`                                                                                                                                                                | 0, Next route typegen plus TypeScript; generated next-env change restored                                                                                                   | `portal-typecheck.log`       |
| `pnpm exec vitest run` with retained filter/paging, overview, statement, document, form, case and training paths listed in local command evidence                                                                       | 1: 14 files passed / 3 failed; 216 tests passed / 2 failed, plus one suite-load error                                                                                       | `retained-regressions.log`   |
| `pnpm exec vitest run -c tests/unit/fleet-portal-verified-principal-canonical-caller-flow-20261015/retained.vitest.config.ts`                                                                                           | 1: 32 passed / 2 failed, two suite-load errors, all four stale leaves identified below                                                                                      | `stale-retained.log`         |
| `pnpm exec tsc -p tsconfig.json --noEmit`                                                                                                                                                                               | 2, repository root resolves shared canonical node_modules and stale aliases; missing tenant-auth/passenger-client and cross-tree ApiClient types. This is not a scoped pass | `root-typecheck.log`         |

Initial API typecheck resolved stale/missing local contracts output and failed.
Building the existing contracts package succeeded and removed those diagnostics;
control-plane-auth was then built to resolve its stale declaration output.
The final API typecheck result is recorded in the closeout update below. A
failed attempted Vitest `--include` invocation was a CLI option error, not a
product regression; the retained config above is the corrected executed probe.

## Exact remaining repair boundary (Supervisor scope coordination)

Current assigned write scopes are the original seven leaves/directories. No
out-of-scope file has been changed. The following exact additional leaves need
ordinary Supervisor conflict/scope coordination, not a new product policy:

1. `apps/fleet-partner-portal-web/components/fleet-supply-workspace.tsx::apiRequest`
   sends JSON mutations without `x-csrf-token`.
2. `apps/fleet-partner-portal-web/app/cases/[caseId]/case-reply-composer.tsx::handleSubmit`
   sends the case reply without that header.
3. `apps/fleet-partner-portal-web/lib/fleet-document-upload.ts::fleetDocumentRequest/putFleetDocument`
   likewise omits the header for request/content/confirm mutations.
   Existing middleware checks `drts_session` plus `drts_csrf` cookie equality
   against `x-csrf-token`. `known-boundaries.test.ts` imports that actual
   middleware and proves omission → 403, correct header → next. Repair the
   callers using the existing cookie/header contract; do not relax middleware.
4. `apps/fleet-partner-portal-web/lib/api-client.server.test.ts` still expects
   unauthenticated environment/header selectors to create an authorized client;
   it also lacks a server-only boundary mock in this test environment.
5. `tests/unit/fleet-document-proxy.test.ts` still expects synthetic
   `x-partner-id` with no end-user credential; its new server-only import also
   needs the normal test boundary mock.
6. `tests/unit/system-remediation/sr-fleet-case-001/sr-fleet-case-001.test.ts`
   passes a verified fixture actor `owner`, yet expects untrusted header actor
   `陳家豪`. Preserve that expected historical scenario by explicitly giving
   its verified fixture the intended actor; do not restore header authority.
7. `tests/unit/fleet-training-authorized-caller-20261015/fleet-training-authorized-caller.test.ts`
   case 1.1 uses the mounted general client without any principal to reproduce
   the historical billing-only training failure. Retain that original narrow
   historical proof via an explicit legacy test client, and keep the other
   Academy tenant/ops tests intact; do not promote Academy identities.

Source checkpoint and all fixes remain on the published task branch. No
handoff/candidate is locked while these internal repairs remain unresolved.

## Credit and unexecuted evidence

Preserve the original adopted audit
`C063-C067-current-accepted-fleet-supply-cases-readonly-audit.json` and its
immutable original requirements/credits (audit base `431966bdf…`, task base
`6dfff99fc…`). Existing KPI/date/filter/paging/CSV, Academy Training, statement,
case, storage/scanning/bytes/revision and reviewer/registry credits are not
withdrawn by this narrow change. The 216 retained passing tests are additional
bounded regression evidence, not a replacement for their original acceptance.

The socket-free dispatcher replaces only HTTP/network transport and provider
boundaries. It discovers real Nest route/argument decorators, executes the real
guard/session contract and controller, and uses the production services and
existing in-memory repositories. The existing storage/scanner fixture replaces
artifact persistence and cloud scanner HTTP/identity; it still exercises real
byte hashing, scanner correlation and document state. No fixture list is
returned in place of dashboard/list service logic. This is Source/controlled
credit, not real PostgreSQL, provider storage/scanner or deployed-browser proof.

Ordinary CRM ACK persistence remains owned by
`COMPLAINT-CANONICAL-LIFECYCLE-AND-ACK-20261015`. The case test verifies the
existing service's request/actor/local readback only. No CRM persistence fix,
true container/provider/storage/device acceptance, protected merge, dev deploy,
whole C063-C067 or full-goal completion is claimed. Missing target authority is
reported separately by `FLEET_PRINCIPAL_REQUIRED`,
`FLEET_PARTNER_AUTHORITY_REQUIRED` or `FLEET_PARTNER_BINDING_REQUIRED`; it is not
used to label the remaining CSRF/caller fixes external-only.
