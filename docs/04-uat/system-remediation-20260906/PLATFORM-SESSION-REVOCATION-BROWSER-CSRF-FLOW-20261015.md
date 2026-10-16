# Platform session revocation browser CSRF flow

Task: `PLATFORM-SESSION-REVOCATION-BROWSER-CSRF-FLOW-20261015`.
Owner: Codex. Independent reviewer: Claude2. Evidence version: v1.

## Delivery state

R6 history-preserving delivery continues on the registered r3 branch from accepted
`b726c5cd08c932502d768e5766bbdf4753e4a1f4`. The preserved R4 candidate
`a967ddcab875fdaa29f7b024d01020b72a1ac51a` / PR #2719 failed the published
commit subject gate; its objects, authors, refs, PR and dated evidence remain
unchanged. R5 author/committer mismatch is resolved by the explicit R6 process-only
Codex Git invocation; shared identity settings are unchanged. Current checks and the
full per-hunk lineage are recorded below. Earlier passing results are historical;
new candidate review, hosted CI, protected merge and all four acceptance records
remain required. No runtime or live provider success is claimed.

## Source and historical lineage

- Clean assigned worktree and branch verified before editing:
  `codex/platform-session-revocation-browser-csrf-flow-20261015-delivery-r2-20261015`.
- Freshly fetched accepted `origin/dev` and initial HEAD:
  `11ed91ba151b04519670d11316d5f30f1fdc0d74`.
- Original preserved branch
  `gemini/platform-session-revocation-browser-csrf-flow-20261015` still points to
  `dc2775838f2d058dc1edaea7b21ba65dbe27414a`. Its task-owned tracked diff is empty;
  the two changed production surfaces in this task also have no intervening diff
  between that original ref and the fresh accepted base. No old branch was rebuilt,
  reset, copied, rebased or deleted.
- The original locator at
  `.local/goal-continuation-20261015T2342-remaining-original-frontier-root/four-original-quota-lanes-terminal-WIP-and-same-task-routing-readonly-locator.json`
  records the missing exact old automatic worktree, no candidate, and the same
  preserved original ref. Bounded checks of the exact new-helper/UAT paths at the
  canonical root found no prior files to adapt. This does not assert that every
  historical local artifact is absent.
- Read the original independent static audit at
  `.local/goal-continuation-20261015T1759-original-entry-quality-registry-root/independent-C007-browser-session-revocation-CSRF-audit-and-draft-static-review.json`:
  approved Origin or validated same-origin Referer fallback, reuse permitted,
  API bearer exception retained, no remote exploit or provider-success claim.
- Checkpoints: `575d9f049` (original red regression), `0f221c1fe` (proof supply and
  boundary), `e0867d1ebcc44fe3f9fa3bfa19398c7dcbbea802` (mounted reproduction and
  failure paths). These are anchors, not reviewed candidates.

Accepted source blobs: proxy `221f76ceb652f10555baa0c0929a710cb8a3d6e8`;
IAM client `091137729fb335643471d43c6ae91d2508b151bb`;
IdentityController `d29ebaf25e74b029a52d560956f77bae1762b35a`.

## Implementation and policy boundary

`PlatformAdminIamClient.revokeSession` acquires proof from
`GET /api/identity-session-csrf` when using the existing `/control-plane-proxy`
base. It sends the returned nonce in `x-csrf-token`. Direct bearer API clients
keep their existing path. Acquisition has no automatic retry, uses same-origin
credentials and referrer policy, disallows redirects, and fails before the POST
on HTTP, network or malformed-response errors.

The app-local server implementation follows the existing tenant-auth technical
building blocks: 32 random bytes in base64url, constant-time equality, explicit
Origin comparison with validated same-origin Referer fallback. It additionally
MACs the nonce and request origin using a purpose-separated existing server
secret (`BFF_STATE_SECRET`, `AUTH_COOKIE_SECRET`, `DRTS_INTERNAL_KEY`, then
`JWT_SECRET`); no insecure default is introduced. Missing signing configuration
fails closed. Deployment must already supply one of those existing secrets.

The cookie is `__Host-platform-session-csrf`, HttpOnly, Secure, SameSite=Lax,
Path=/, no Domain. Its lifetime is a browser-session cookie, with no one-time
consumption or zero-TTL rule. A valid cookie is reused on subsequent issuance;
duplicate cookies, malformed cookies, invalid MACs, another origin's signed
cookie and attacker-chosen matching cookie/header pairs are denied. Proof supply
is no-store and rejects absent/foreign/unvalidated origin evidence. It grants no
identity or role authority; the proxy still performs its existing IAP checks.

The BFF checks proof **before** `applyUpstreamAuth` or any fetch. Its route match
uses the resulting upstream URL, including decoded catch-all normalization,
Express-style case insensitivity and optional trailing slash, for only the
original `POST /api/identity/sessions/:sid/revoke` family. Existing header
blocklist, cookie stripping, IAP verification, transport-token separation and all
other mutation families remain in place. No API guard, realm, role, scope,
step-up, tenant boundary, financial rule or repository transaction was changed.

## Findings and required acceptance

All local logs below are under the assigned worker's
`.local/platform-session-csrf/`; commands run from that worktree. Node, Vitest
4.1.4 and jsdom execute socket-free tests, with no product/browser/HTTP/PG server.

| Finding / original key                                                                      | Actual source and change                                                                                                                                              | Before → checkpoint result                                                                                                                                                    | Command / evidence                                                                                                                                                                                      | Remaining limitation                                                                                          |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Missing browser mutation proof; `platform-session_browser-csrf-issuance-and-boundary`       | Actual IAM client → new app-local GET route/server helpers → existing proxy `forward`                                                                                 | Accepted base: expected 403, actual 200 from controlled upstream; proof boundary after fix passes                                                                             | `pnpm exec vitest run tests/unit/platform-session-revocation-browser-csrf-flow-20261015/boundary.test.ts`; original exit 1, `before.log`; expanded checkpoint exit 0, 32 cases, `boundary-expanded.log` | Independent same-candidate review pending; local source evidence only                                         |
| `platform-session_mounted-lawful-revoke-and-canonical-readback`; HTTP includeRevoked defect | Mounted real `UserDetailDrawer.handleRevoke`, real IAM/ApiClient, real Next handlers, real BootstrapAuthGuard/IAPSubjectAdapter/IdentityController/IdentityRepository | Revoke reaches selected own test session; canonical repository state changes, but subsequent HTTP list excludes it; positive assertion remains FAIL                           | `pnpm exec vitest run tests/unit/platform-session-revocation-browser-csrf-flow-20261015/mounted-flow.test.ts -t 'mounted drawer'`; exit 1, `readback-reproduction.log`                                  | Exact controller scope grant and repair required; no fake ACK, query conversion or weakened assertion         |
| `platform-session_origin-token-denials-and-original-session-regressions`                    | Boundary tests plus unchanged auth/repository behavior; original R05 tests now supply proof for local BFF revoke                                                      | 155 scoped/regression cases pass; 4 mounted error/retry cases pass; expanded boundary covers signed-cookie host binding, IAP independence and Cloud Run credential separation | Regression command below; exit 0, `regressions.log`; mounted negative selection exit 0, `mounted-negatives-fixed.log`                                                                                   | Controlled signed IAP test fixture and in-memory production repository; no live IAP, PG or browser acceptance |
| `platform-session_exact-candidate-validation`                                               | Exact isolated branch; task-owned commits and normal pushes only                                                                                                      | App typecheck/lint pass; raw root typecheck fails on shared dependency resolution; local source-mapped root typecheck passes                                                  | Commands and distinctions below                                                                                                                                                                         | No final candidate, independent review, hosted required CI/protected merge or acceptance records yet          |

## Mounted harness and readback finding

The test mounts the actual drawer through the existing `createUiModuleLoader`.
It doubles context hooks and the socket boundary only. React, canvas components,
IAM client, shared API client, proof route, BFF, assertion verification,
registered-principal resolution, guard realm/scope/step-up invocation, controller,
snake-case wire envelope and production in-memory repository remain real.
A controlled signed IAP fixture and a pre-provisioned real repository workforce
principal/membership/role are used. The chosen own test session and refresh family
are created through production repository methods; responses are never invented.

HTTP queries are passed as `Object.fromEntries(url.searchParams)`, preserving
their real string values. `IdentityRepository.listSessions` currently evaluates
`query?.includeRevoked === true`; no global query transform exists in API
`main.ts`, and controller `listAdminSessions` passes the raw query through.
Thus `includeRevoked=true` does not include revoked rows. The mounted positive
test retains the expectation that the same session row remains and loses its
Revoke action after canonical revoked readback. This is the unresolved trigger.

Four mounted negative cases pass: inventory 403 ends loading and rerender does
not retry; write 403, proof supply 503 and repository 503 report failure, leave
the selected session active and perform no automatic retry. Error banners replace
the table in the existing drawer. Explicit Refresh recovers the inventory; it
does not resend the mutation. Production UI/useMemo logic is unchanged.

## Verification commands and results

Original controlled-before run on accepted production Source:

```text
pnpm exec vitest run tests/unit/platform-session-revocation-browser-csrf-flow-20261015/boundary.test.ts
exit 1; expected 403, received 200; before.log
sha256 4891b95d8037eedaa0ba47a5aba9f9d2e5091f73582c281eaccffa99dfcae6d3
```

Checkpoint regression command (exit 0, 10 files / 155 tests):

```sh
pnpm exec vitest run tests/unit/platform-session-revocation-browser-csrf-flow-20261015/boundary.test.ts tests/unit/system-remediation/sr-iam-001 tests/unit/control-plane-auth.test.ts tests/unit/iap-subject-adapter.test.ts tests/unit/step-up-iap-path.test.ts tests/unit/identity-session.test.ts tests/unit/identity-session-context.test.ts tests/unit/system-remediation/sr-qa-identity-001/c006-c007-c008-invitation-session-and-tenant-rbac.test.ts tests/unit/cross-app/sr-partner-notify-fix-admin-20260927.integration.test.ts
```

`regressions.log` SHA-256:
`d374e3f0a5de65ddb6420a75e807dc301d70378fb78e51e14066b9bc38bc7cd2`.
The 155 count predates the three additional boundary cases; do not add counts
from overlapping runs together.

Mounted negative selection (exit 0; 4 pass, positive case unselected):

```sh
pnpm exec vitest run tests/unit/platform-session-revocation-browser-csrf-flow-20261015/mounted-flow.test.ts -t 'mounted (403|writeDenied|proofDenied|repositoryFailure)'
```

`mounted-negatives-fixed.log` SHA-256:
`5feb8555376373efd75bc7b4fcb2dc04ece8b67364e4c2a0447572a866e289c2`.
This filtered pass is not a full mounted-flow pass.

- `pnpm --filter @drts/platform-admin-web typecheck`: exit 0. Next route type
  generation ran without a server. Its incidental `next-env.d.ts` addition was
  removed; it is outside the task scope and is not a product change.
- `pnpm --filter @drts/platform-admin-web lint`: exit 0.
- `pnpm typecheck:root`: exit 2. Shared node_modules resolves stale canonical-root
  `@drts/api-client` types (private baseUrl) and cannot resolve current tenant-auth
  and passenger-client exports, producing 80 diagnostics, including two genuine
  initial harness typing defects subsequently fixed. No shared dependency or
  canonical-root file was modified to hide this result.
- `pnpm exec tsc -p .local/platform-session-csrf/root-local-paths.tsconfig.json --noEmit`:
  exit 0 after fixing harness RequestInit/context types. It extends the normal
  root config and maps API client, passenger client, tenant-auth and its subpaths
  to this exact worktree, retaining contracts/control-plane aliases. This checks
  the full root include set against current Source, and is a separate result from
  the failing standard command. Overlay SHA-256:
  `28eca87f9a86e05dbbd0f562e7e6fee6a7770c186b645bea828c528eea0c2a31`.
- Initial `pnpm lint:root`: exit 1 (unused test context constant), fixed in the
  task-owned boundary test. Rerun exit 0, `root-lint-fixed.log`.

All launched checks must finish and be read before any handoff. The remaining
readback defect prevents a final candidate. After a scoped repair, rerun the
complete mounted flow and relevant checks, push normally, verify local/remote/PR
head equality, and use the release CLI's ordinary exact-SHA handoff to Claude2.

## Full checkpoint run

At pushed anchor `fd8db596bd552a3f71661f32573513dde7c9215a`, run the regression
command above with the **entire**
`tests/unit/platform-session-revocation-browser-csrf-flow-20261015` directory in
place of its single boundary test. Result: exit 1; **162 pass, 1 fail, 163 total,
11 files; no skipped cases**. The only failure is the original mounted
same-session readback assertion. Before reaching that assertion, the test now
also verifies the real canonical session is revoked by the registered principal,
its refresh family is revoked, the unselected own session remains active, and the
actual four calls are inventory GET → local proof GET → selected-session POST →
inventory GET. The missing revoked row remains a required failure.

Full log: `.local/platform-session-csrf/checkpoint-full.log`, SHA-256
`263bea8d60e15d55d5c1c4de5cc577f0367ac320c8ec801f2f54520a01980a41`.
Root lint rerun log SHA-256:
`eb3f3067067e4f6c5871ec40fbb6cce8a0708ea9265382afcafce9c10eafffdc`.
Do not describe the full run as green or hand off this checkpoint as a candidate.

Rechecks launched at that same anchor all completed and were read: app typecheck
exit 0 (`app-typecheck-checkpoint.log`), app lint exit 0
(`app-lint-checkpoint.log`), and complete root typecheck with the documented local
source mappings exit 0 (`root-local-paths-checkpoint.log`). Standard root
typecheck remains the separately recorded failed command. Only this evidence
document changes after these rechecks; the incidental generated next-env import
is again removed. No check is left running at the progress checkpoint.

## 2026-10-16 resumed dispatch: minimal controller reproduction

Resumed from clean, locally/remotely identical
`eaaa18a759416785c0320fb678efd96ee0aeb895`. Fetched origin and checked the exact
execution branch: no PR or candidate exists. The release CLI's single-task slice
still lists the original eight write scopes, excluding the controller. This is
ordinary Supervisor conflict/scope coordination under Collaboration Guide §0.7,
not a request for a new user authorization. No API source was changed.

Added `session-inventory-query.test.ts` at pushed anchor
`a0ddba225300b0421b0ca488ac68fdc0d1dca0f6`. It invokes the real
`IdentityController.listAdminSessions` and production noDB repository, creates
two actual sessions, revokes the selected one through `revokeSession`, then
checks both canonical statuses through the controller envelope. There is no
mocked repository, socket, server, browser or query conversion. This is a smaller
reproduction of the existing mounted failure, not a replacement for it.

| Finding / acceptance                                                                           | Source and repair boundary                                                                                                                                   | Before / resumed checkpoint result                                                                                                                                               | Command / version / evidence                                                                                                                                                      | Remaining work                                                                                   |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| HTTP revoked-session readback; `platform-session_mounted-lawful-revoke-and-canonical-readback` | Client `listSessions` serializes `true` as a string; controller `listAdminSessions` spreads the raw query; repository `listSessions` requires boolean `true` | `a0ddba225300b0421b0ca488ac68fdc0d1dca0f6`: HTTP `"true"` FAIL; HTTP `"false"`, omission and direct boolean true/false PASS; unselected session remains active in all five cases | `pnpm exec vitest run tests/unit/platform-session-revocation-browser-csrf-flow-20261015/session-inventory-query.test.ts`; exit 1; Vitest 4.1.4; `query-reproduction-dispatch.log` | Supervisor conflict check and exact controller write-scope grant; repair and green rerun pending |
| Same original mounted readback and proof/regression boundary                                   | Existing mounted flow and boundary suite unchanged                                                                                                           | Same anchor: 40 PASS, 2 FAIL, 42 total; the original mounted readback and its new minimal reproduction fail on the same missing revoked row                                      | `pnpm exec vitest run tests/unit/platform-session-revocation-browser-csrf-flow-20261015`; exit 1; `dispatch-scoped.log`                                                           | Neither failure is waived; no candidate, review, CI, merge or acceptance credit                  |

The next repair unit is limited to the controller's existing query boundary:
accept the runtime `includeRevoked` boolean or HTTP string, normalize only exact
boolean `true` or string `"true"` to true, and pass the normalized existing
contract to the unchanged repository. Preserve the false/default behavior, tenant
filtering, read authorization and wire envelope. Do not use truthiness (the string
`"false"` is truthy), change repository transaction/auth behavior, or substitute
`status=revoked` in the client to evade the original includeRevoked contract.
After the ordinary scope grant, retain both failing assertions, fix the production
boundary, rerun the full original regression command with the task directory,
then relevant app/root checks before any fresh exact-candidate handoff to Claude2.

New logs are under this worktree's `.local/platform-session-csrf/`. Their SHA-256:

- `query-reproduction-dispatch.log`:
  `fd6224e06192e4b795746710f851300b9b3c87965d3227784877b785157acf1c`.
- `dispatch-scoped.log`:
  `a962e78469c551cebc5ddede444c2ee4e838110fae8e9e459955abf573d028dc`.

Only the minimal regression and this evidence document change in this dispatch.
The earlier full regression/app checks remain historical checkpoint results;
they are not new same-candidate passes.

All checks launched in this dispatch completed and were read:

- `pnpm lint:root`: exit 0. Log `dispatch-root-lint.log`, SHA-256
  `eb3f3067067e4f6c5871ec40fbb6cce8a0708ea9265382afcafce9c10eafffdc`.
- `pnpm exec tsc -p .local/platform-session-csrf/root-local-paths.tsconfig.json --noEmit`:
  exit 0 with full root includes and local source mappings. The initial attempt
  exited 2 because this dispatch's reconstructed local overlay incorrectly mapped
  `@drts/tenant-auth` to nonexistent `src/index.ts` (two resolution errors and a
  downstream implicit-any error). Corrected that local-only mapping to the actual
  package export `src/route-handlers.ts`, then reran successfully. Initial log:
  `dispatch-root-local-paths-initial.log`; final log:
  `dispatch-root-local-paths.log`. This does not change the historical standard
  `pnpm typecheck:root` failure or claim that standard command passed.
- Scoped Vitest results remain exit 1 as recorded above. `git diff --check`
  passes; the API controller has no diff. No runtime was started and no check
  remains running.

These are progress checkpoints only. Retain the original task and reviewer, and
resume production repair after Supervisor records the precise additional scope.

### 2026-10-16 00:26 UTC scope-gated recheck

At clean published checkpoint `21056c9cca703196049e3c43e2c50d05e50ad3d7`,
the release CLI still reports the same eight scopes and excludes
`apps/api/src/modules/identity/identity.controller.ts`. Re-ran the exact minimal
controller/repository command above: Vitest 4.1.4, exit 1, **4 PASS / 1 FAIL**;
only HTTP string `"true"` fails with expected `revoked`, received `undefined`.
The command completed and its output was read. Log:
`.local/platform-session-csrf/resume-20261016-query-reproduction.log`, SHA-256
`6ff492f55c716a1099bc96d8481422c8c5e600a3317c7aa2b6a0e0ccc8fd9774`.
Local HEAD and the remote execution branch were identical; no product source
changed and `git diff --check` passed. This recheck confirms the existing repair
boundary; it adds no passing readback, candidate or acceptance credit. Ordinary
Supervisor conflict check and the exact controller scope grant remain necessary
before the original owner can perform the documented normalization and full
regression. No runtime was started.

## R4 delivery evidence v1 — 2026-10-16

The new dispatch's single-task machine-truth slice includes the controller as the
ninth write scope. Resumed the original clean execution branch at published
`22c8fc0ae96c2490e7a67e76356bc4f2ab8cc21a`; no candidate or PR existed. The
original owner/reviewer and all four required keys are retained. No old ref or
published history was rewritten. Current fetched `origin/dev` was
`2aed20cee7c80fca77aeb326ab6c8b8377fee0dd`; no intervening change to the three
existing production caller/controller surfaces required synchronization.

### Repair and execution identity

The only API production change is `IdentityController.listAdminSessions`:
represent the untrusted `includeRevoked` query member as `unknown`, then normalize
exact boolean `true` or exact string `"true"` into the existing repository query.
All other values become false. The repository, auth/roles/scopes, tenant filter,
masking, envelope, revoke transaction and bearer behavior remain unchanged.
The existing explicit `status` filter semantics are also unchanged.

- Before: exact published `22c8fc0ae96c2490e7a67e76356bc4f2ab8cc21a`, minimal
  production controller/repository test, exit 1, 4 PASS / 1 FAIL. HTTP `"true"`
  loses the canonical revoked row; the four controls pass (`r4-before.log`).
- Repair anchor: `1a9298947010726df7eac85c0418a34921a3b28c`; the same five
  assertions plus nine invalid/repeated-value controls pass, 14/14, exit 0
  (`r4-query-fixed.log`). The full original command also passes 177/177, exit 0,
  12 files, no skips (`r4-full.log`).
- Final production Source: `fea80c7f7e150d3cb8667ddb48511bcfa47f3273` removes an
  incidental formatter-only edit outside the authorized method. The retained
  controller blob is `8a6bcf9556bb6b43ffb38ee271d5fca32e5b92dd`; query regression
  blob is `d7786e057b4faf8ff268f68bcc20e5af1644ec54`. Re-ran the full original
  regression at this exact head: **177 PASS / 0 FAIL / 0 SKIP, 12 files**, exit 0,
  `r4-final-full.log`. Controller lint also passes at this head.
- The closeout commit only updates this evidence document. These production/test
  blobs are unchanged in the candidate; its full SHA and PR head are recorded by
  the normal handoff, avoiding a self-referential document commit hash.
- Tools: Node v22.23.2, pnpm 10.33.0, Vitest 4.1.4. All launched checks completed
  and their results were read. No server, browser, PG or Docker runtime started.

### Finding and original acceptance map

| Finding / required key                                                                                        | Production basis and retained behavior                                                                                                                              | Before → fixed result / command evidence                                                                                                                                                                                                                                                           | Remaining boundary                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platform-session_browser-csrf-issuance-and-boundary`                                                         | Real `PlatformAdminIamClient.revokeSession` → `identitySessionCsrfHeaders` → local GET route → signed host cookie / Origin check → proxy before upstream auth/fetch | Historical accepted-before missing-proof JSON request proceeds (expected 403, got 200); fixed boundary cases pass in `r4-final-full.log`, exit 0                                                                                                                                                   | Same-candidate independent review and hosted gates pending; no live provider or attack claim                                                             |
| HTTP `includeRevoked=true` loses revoked row; `platform-session_mounted-lawful-revoke-and-canonical-readback` | Exact controller query normalization before unchanged production repository; mounted real drawer/client/proof/proxy/IAP guard/controller/repository chain           | `r4-before.log`: 4 PASS / 1 FAIL, exit 1 → `r4-query-fixed.log`: 14 PASS, exit 0. Full mounted assertion now passes in `r4-final-full.log`: selected session and refresh family revoked, unselected session active, same selected row read back and Revoke action removed                          | Socket boundary and context hooks doubled; controlled signed IAP fixture and production noDB repository; no hosted browser/PG execution claimed          |
| `platform-session_origin-token-denials-and-original-session-regressions`                                      | Original r05, IAP/step-up, masking/session, CSRF negative boundary and mounted error/retry tests retained                                                           | Full original regression: 177 PASS, exit 0. Missing/mismatched/forged proof, wrong/missing Origin, unvalidated Referer, cross-origin form shape stop before upstream; valid Referer/reuse/bearer and IAP transport separation preserved; inventory 403 stops retry, failure states remain truthful | IAP cookie/provider cross-site behavior and live attacks were not executed in this audit                                                                 |
| `platform-session_exact-candidate-validation`                                                                 | Assigned isolated branch, scoped commits, ordinary non-force push, unchanged final Source/test blobs; full command and checks below                                 | Full regression, app typecheck/lint, root lint, controller lint, API typecheck after build prerequisites and full root Source-mapped typecheck PASS; standard root typecheck remains FAIL as separately recorded                                                                                   | Claude2 same-SHA review, required hosted CI, protected merge and all four normal v1 acceptance records pending; local passes do not supply these credits |

Full final regression command (exit 0):

```sh
pnpm exec vitest run tests/unit/platform-session-revocation-browser-csrf-flow-20261015 tests/unit/system-remediation/sr-iam-001 tests/unit/control-plane-auth.test.ts tests/unit/iap-subject-adapter.test.ts tests/unit/step-up-iap-path.test.ts tests/unit/identity-session.test.ts tests/unit/identity-session-context.test.ts tests/unit/system-remediation/sr-qa-identity-001/c006-c007-c008-invitation-session-and-tenant-rbac.test.ts tests/unit/cross-app/sr-partner-notify-fix-admin-20260927.integration.test.ts
```

### Completed check results

| Command                                                                                                                              | Result                                                                                                                                                               | Evidence log                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm --filter @drts/platform-admin-web typecheck`                                                                                   | PASS, exit 0; Next typegen only, generated next-env import removed                                                                                                   | `r4-app-typecheck.log`                                                               |
| `pnpm --filter @drts/platform-admin-web lint`                                                                                        | PASS, exit 0                                                                                                                                                         | `r4-app-lint.log`                                                                    |
| `pnpm lint:root`                                                                                                                     | PASS, exit 0                                                                                                                                                         | `r4-root-lint.log`                                                                   |
| `pnpm --filter @drts/api exec eslint src/modules/identity/identity.controller.ts --max-warnings=0`                                   | PASS, exit 0, including final controller-only scope                                                                                                                  | `r4-final-controller-lint.log`                                                       |
| `pnpm typecheck:root`                                                                                                                | FAIL, exit 2; 78 diagnostics from shared dependency resolution (stale private `ApiClient.baseUrl`, missing tenant-auth/passenger-client exports and cascading types) | `r4-root-typecheck.log`                                                              |
| `pnpm exec tsc -p .local/platform-session-csrf/root-local-paths.tsconfig.json --noEmit`                                              | PASS, exit 0, complete root include set, same documented local Source mappings; no includes excluded                                                                 | `r4-root-local-paths.log`                                                            |
| `pnpm --filter @drts/api typecheck` before package builds                                                                            | FAIL, exit 2; 371 diagnostics from missing local dist declarations / stale shared contracts, including missing `IdentitySessionContext` and old actor enums          | `r4-api-typecheck.log`                                                               |
| `pnpm --filter @drts/contracts build`, then `pnpm --filter @drts/control-plane-auth build`, then `pnpm --filter @drts/api typecheck` | All PASS, exit 0; normal existing build prerequisites create ignored worktree-local dist output; no shared/canonical dependency mutation                             | `r4-contracts-build.log`, `r4-control-plane-build.log`, `r4-api-typecheck-built.log` |
| `git diff --check`                                                                                                                   | PASS, exit 0                                                                                                                                                         | Checked before commit                                                                |

The Source-mapped root overlay extends `../../tsconfig.json`, retains its full
includes and contracts/control-plane aliases, and adds only current worktree
`@drts/api-client`, `@drts/passenger-client`, `@drts/tenant-auth` (actual export
`packages/tenant-auth/src/route-handlers.ts`) and `@drts/tenant-auth/*` paths.
It is a distinct check; standard root typecheck is not reported green.

Evidence logs and overlay are under the assigned owner worktree's absolute path
`/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-platform-session-revocation-browser-csrf-flow-20261015/.local/platform-session-csrf/`.
SHA-256 values:

```text
efb8278940ea21b39331eb55b50d2b87ca68b15bcefecf2d55d2aa669b7f0723  r4-before.log
80adc4f98e0f6b449d19040242c6f2e2c3a0462a78080f6fc7dcf81bccf156cb  r4-query-fixed.log
a4a5cf6ea37cfd9fe078828d580a99dd8261d7c2819f1a7d7825319eba387ed1  r4-full.log
55db3e728250e3b5fd88d22f2685f6b45b3e9c402d70879d8b1d00c1bb203708  r4-final-full.log
acecf8b14a55bc58f94005b923e064a70a2b98d317d0cdebde57302b089ad503  r4-app-typecheck.log
cba69d0d270537b1475641cf034ce04ac62a461a788e7a5117942390b22c7f01  r4-app-lint.log
eb3f3067067e4f6c5871ec40fbb6cce8a0708ea9265382afcafce9c10eafffdc  r4-root-lint.log
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  r4-final-controller-lint.log
4b660dd02ca0d92c35a2430e10c92ee3d5b983fa3b5ed712d09bf909aaccf204  r4-root-typecheck.log
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  r4-root-local-paths.log
b7b9a5b5f32150dd15075c2b6df58607b75c93eef51ecdeceb8d1429c58dce7b  root-local-paths.tsconfig.json
4a7f875b54ea7c3e064a3e5996505a909a024cec746bbdf6057310daf91ed16e  r4-api-typecheck.log
ec5d3157a4633f638f90715685f588bb9f7b08c59d5b011b67424665b4f6d74a  r4-contracts-build.log
3b9319b45828fab6ceac351ca08d784350eb93979ae614ad80c7a45134b79112  r4-control-plane-build.log
44b99d02f9ad743611853f1cbe9305ef591a3bf0e29a808d5ca90b021280e4c5  r4-api-typecheck-built.log
```

This v1 document prepares evidence for every original required key. It does not
record acceptance prematurely or substitute for the new candidate's independent
review, hosted CI or protected merge. Preserve the candidate unchanged after
handoff and let the existing lifecycle collect those results.

## R6 fresh delivery lineage and reproduction — 2026-10-16

Normal Supervisor R5/R6 routing authorizes this same original task on
`codex/platform-session-revocation-browser-csrf-flow-20261015-delivery-r3-20261016`.
The original nine scopes, four complete clauses/keys, dependencies, Codex owner
and independent Claude2 reviewer remain unchanged. Fresh scope inspection found
no production writer overlap; the only overlap is the already qualified broad
`tests/unit/` reservation of accepted `ENTRY-TENANT-GOOGLE-OIDC-20261005`.
Actual worker cwd/dispatch actor/branch were checked. Both Git identities use the
explicit authorized `git -c user.name=Codex -c user.email=codex@openai.com
-c user.useConfigOnly=true` prefix and literally resolve Codex <codex@openai.com>.
No shared identity setting, old ref/object, old PR head or history was changed.

Read all original changed files and compared each hunk with accepted base
`b726c5cd08c932502d768e5766bbdf4753e4a1f4`. Existing proxy, IAM client,
controller and r05 blobs are still the original pre-repair blobs; the three local
proof modules, task tests and UAT are absent. Thus none of the original repair
is already present. Existing production surfaces receive only their specific
remaining hunks, without replacing their files. The separately inspected absent
modules and original tests are retained with original Codex lineage. Full patch,
per-hunk identifiers and accepted/old blob identities are recorded in
`.local/platform-session-csrf-r6/per-hunk-lineage.v1.json`.

| Path / original hunk                                        | Current behavior → retained necessary repair                                                                      |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Proxy `forward`, import + revoke-family branch              | No CSRF check → same-origin signed proof before auth/fetch, only original revoke family                           |
| IAM client import + `revokeSession` options                 | No proof acquisition → await local proof and attach header; direct bearer unchanged                               |
| New browser helper, all lines                               | No supplier → fail-closed GET, no retry, same-origin credentials/referrer                                         |
| New server helper, all lines                                | No verifier → random token, constant-time equality, signed host/origin binding, approved Origin/Referer semantics |
| New GET route, all lines                                    | No route → no-store proof, secure host cookie, fail-closed supply                                                 |
| Controller `listAdminSessions`, query type + effectiveQuery | HTTP string loses revoked row → only boolean true or exact HTTP true opts in                                      |
| r05 import/cleanup + two revoke fixtures/assertions         | Original outcomes preserved with explicit proof transport                                                         |
| Boundary test, all cases                                    | Retain every original lawful/denial/transport control                                                             |
| Mounted test, all cases                                     | Retain actual component chain, canonical selected-session/refresh-family readback, 403-stop and failure truth     |
| Query test, all 14 cases                                    | Retain original minimal production controller/repository regression                                               |
| UAT, historical body + current section                      | Preserve old evidence as dated history and append fresh results; no transfer of old CI/review credit              |

Before production edits, `pnpm exec vitest run
 tests/unit/platform-session-revocation-browser-csrf-flow-20261015` invoked real
accepted proxy/controller/repository code: **13 PASS / 2 FAIL**, exit 1, Vitest
4.1.4. Missing-proof JSON was forwarded (200, one upstream call; expected 403,
zero calls), and HTTP true readback lost the revoked row. No missing-module or
fixture failure is counted as reproduction. Log: `before.log`. The same two
assertions remain in the fixed suite; `accepted-before.test.ts` adds the explicit
upstream-call diagnostic. These tests were anchored and normally pushed before
repair; original refs remain preserved.

Current machine-specific logs, preflight and complete per-hunk ledger live under
this assigned worktree's `.local/platform-session-csrf-r6/`. Fresh full checks,
exact candidate lock and external gates are pending at this checkpoint.

### R6 additional compatibility finding and check history

At production checkpoint `a9560779f047045ef1bf3a408e3917b5140faaae`, the
original app-local `apps/platform-admin-web/tests/unit/iam-security-ui.test.ts` found that attaching an
empty headers object changed the direct API caller's request options shape:
3 PASS / 1 FAIL, exit 1 (`app-iam-regression.log`). This is an additional
compatibility finding, not a reason to weaken the old assertion. The scoped
`revokeSession` fix awaits the same supplier and includes headers only when
nonempty. Direct bearer requests retain the original options shape; local BFF
proof failures still stop before POST. The unchanged app test rerun passes 4/4,
exit 0 (`app-iam-fixed.log`). This is a new small R6 hunk beyond retained a967.

The first full 178-case run at a956 completed with 177 PASS / 1 FAIL, exit 1
(`full.log`): the mounted lawful case exceeded its existing 5000ms timeout while
seven checks were launched concurrently. The earlier scoped 52-case run passed
that exact assertion. Preserve this failure; no assertion or timeout was changed.
A fresh full run after the compatibility fix and with fewer parallel checks is
required before handoff. Initial API typecheck also failed on absent worktree-local
contracts/control-plane dist declarations and stale canonical dependency types;
normal local build prerequisites and rerun are recorded separately.

### R6 final validation and original acceptance map v1

Checked production/test checkpoint:
`5432a0228ccd330225d3f822081001bba57cb115`. All subsequent closeout changes are
UAT documentation only. Exact checked production/test blob identities are in the
manifest; the final candidate must retain them. Both original defect assertions
were re-run on these final blobs and pass within the full suite. Every launched
check has completed and its result was read. Node v22.23.2, pnpm 10.33.0,
Vitest 4.1.4; jsdom is socket-free and no browser/server/PG runtime was started.

| Original finding / required acceptance                                   | Source / actual production chain                                                                                                                                                   | Before → final local result                                                                                                                                                                                                                                                                                                                                       | Remaining external evidence                                                                                                                                                                     |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `platform-session_browser-csrf-issuance-and-boundary`                    | Mounted IAM client → local GET supplier → host-only signed cookie/token → proxy Origin/validated Referer and constant-time verification before upstream                            | Accepted b726c5c missing-proof JSON returns 200 with one upstream call; final returns 403 with zero calls. Issuance, cookie binding, no-store, secret outage and proof reuse controls pass                                                                                                                                                                        | Independent exact-SHA Claude2 review and normal acceptance record pending; no live provider success claimed                                                                                     |
| `platform-session_mounted-lawful-revoke-and-canonical-readback`          | Actual UserDetailDrawer → real client/handlers/IAP verification/registered principal/guard/controller → unchanged production noDB repository → same-session wire-envelope readback | HTTP true loses selected revoked row before; final 14 query controls plus mounted lawful chain pass. Selected session and its refresh family revoked by actual registered principal, unselected session active, same row read back and Revoke action absent                                                                                                       | Controlled socket/context boundary only; no live browser/IAP/PG execution claimed; external candidate gates and acceptance record pending                                                       |
| `platform-session_origin-token-denials-and-original-session-regressions` | Full original r05, API cookie-CSRF rejection, IAP/realm/scope/step-up, masking/list envelopes, exact tenant/target authorization retained                                          | Missing/mismatched/forged/tampered/duplicate/cross-host proof, wrong/missing Origin plus missing/unvalidated Referer, cross-origin form shape denied before upstream. Lawful Referer/reuse/bearer and Cloud Run credential separation pass. Mounted inventory 403 does not retry; mutation/proof/storage errors remain truthful. Unchanged app IAM regression 4/4 | Hosted exact-SHA regression and normal acceptance record pending; no cross-site exploit or provider claim                                                                                       |
| `platform-session_exact-candidate-validation`                            | Isolated r3 branch, task-only commits, per-hunk lineage, literal actual Codex attribution, normal non-force pushes, full-range subject/trailer gate                                | Exact-source full regression 178 PASS / 0 FAIL / 0 SKIP in 13 files; relevant checks below pass except explicitly failed standard root check                                                                                                                                                                                                                      | New candidate SHA/PR head equality, independent review, matching required hosted CI, protected merge and all four own nonempty v1 acceptance records are lifecycle gates, not local test credit |

Final full command is unchanged from the original R4 full command above, with the
whole task directory retained. `exact-source-full.log`: exit 0, 178/178; the extra
case versus the original 177 is the accepted-before upstream-call diagnostic.
`final-full.log` is an earlier 178/178 pass after the compatibility repair; counts
are not added together. Initial timeout/failure logs remain in the same bundle.

| Check                                                            | Exit / result                                                                                                                           | Log                                                                         |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| App typecheck (Next typegen, no server)                          | 0 PASS; generated next-env import removed                                                                                               | `app-typecheck.log`                                                         |
| Final app tsc / client lint after compatibility repair           | Both 0 PASS                                                                                                                             | `app-final-tsc.log`, `client-final-lint.log`                                |
| App lint / root lint / exact API controller lint                 | All 0 PASS                                                                                                                              | `app-lint.log`, `root-lint.log`, `controller-lint.log`                      |
| Standard `pnpm typecheck:root`                                   | 2 FAIL, 78 shared dependency resolution diagnostics; stale canonical private ApiClient.baseUrl and tenant-auth/passenger-client exports | `root-typecheck.log`                                                        |
| Full root Source-mapped overlay                                  | 0 PASS; full root include set retained, only current worktree aliases added                                                             | `root-local-paths.log`, `root-local-paths.tsconfig.json`                    |
| API typecheck before local declaration builds                    | 2 FAIL, 371 stale/missing declaration diagnostics                                                                                       | `api-typecheck.log`                                                         |
| Local contracts build → control-plane-auth build → API typecheck | All 0 PASS; only ignored worktree-local dist outputs created                                                                            | `contracts-build.log`, `control-plane-build.log`, `api-typecheck-built.log` |
| Original app IAM tests                                           | Initial 3 PASS / 1 FAIL → unchanged assertions 4 PASS, exit 0                                                                           | `app-iam-regression.log`, `app-iam-fixed.log`                               |
| Task app files/r05/tests Prettier check                          | 0 PASS                                                                                                                                  | `format.log`                                                                |
| Full-range subject/trailers gate                                 | All task commits PASS; rerun after final closeout                                                                                       | Normal Git/CLI evidence, no bypass                                          |

The standard root check is still a failed result. The passing overlay extends the
normal root config, keeps every include, preserves contracts/control-plane aliases,
and adds local api-client, passenger-client and tenant-auth aliases (including its
real route-handlers export and subpaths). No shared node_modules, canonical Source
or production compiler config was edited to change resolution.

Config audit precision: required normal `git push -u` changed this task branch's
upstream from `dev` to its published r3 branch. Therefore common config bytes are
not identical. An in-memory reversal of only that merge tracking value exactly
reconstructs the initial SHA-256. The default Gemini2 name/email and both explicit
scoped Codex name/email values remain unchanged; no manual config command or disk
reversal occurred. Full observation: `config-tracking-observation.json`.

Durable machine-specific evidence bundle (outside the disposable worker tree):

`/home/lupin/workspace/drts-fleet-platform/.local/platform-session-csrf-owner-audits/20261016T034157Z-r6-delivery`.

Manifest: `validation.v1.json`, SHA-256
`5d1a5f5ab57edd9cc617f0ab66a6754449d271f998c7c8cc6f79cab17421bd6a`. It records each exact command, exit code, version, log hash,
old candidate/generation custody and final production/test blob identities.
The full accepted-vs-old per-hunk ledger is `per-hunk-lineage.v1.json`.

No old CI result or approval supplies new candidate credit. Old candidate a967,
its generation, delivery-r2 refs and OPEN PR #2719 stay preserved. The new normal
handoff supplies full candidate SHA, r3 branch and new PR; reviewer/CI/merge/four
acceptance records must all bind to that new candidate. This is implementation
handoff evidence, not a full-system/capability completion or deployment claim.

### R6 hosted CI citation repair

Prior candidate `4abec3dd7596aaa471eaea57c3b2653ea0ceead2` (generation
`d8be47d0e1a3437cb308ba4fc7854c73`, PR #2729) failed the
[Canonical consistency job](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38846932519/job/116799469035).
The compatibility paragraph above cited the app-local IAM test as a repository-root
path. The real test is
`apps/platform-admin-web/tests/unit/iam-security-ui.test.ts`; only that citation
and this evidence section change. Historical test results remain dated R6 evidence.

| Finding / acceptance                                                  | Source and repair                                                            | Before → after                                                                                                                                         | Command / evidence                                                                                                                    | Remaining limits                                                                                              |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| CI cited-path failure / `platform-session_exact-candidate-validation` | R6 compatibility paragraph now uses the real repository-rooted app test path | Hosted 4abec3d exits 1 with one missing-path finding; local unchanged-candidate probe reproduces exit 1 → corrected content exits 0 with zero findings | `python3 tools/ci/git/check_canonical_consistency.py --ci --base origin/dev --head HEAD`; hosted job above, `before.log`, `after.log` | New candidate independent review, matching hosted CI, protected merge and all four acceptance records pending |

Durable follow-up evidence directory:
`/home/lupin/workspace/drts-fleet-platform/.local/platform-session-csrf-owner-audits/20261016-ci-citation-repair`.
The unchanged production/test blobs retain the R6 validation manifest above; this
documentation correction does not substitute for new candidate lifecycle gates.
Local verification uses the production consistency checker, existing-path lookup,
Prettier and Git diff/commit gates. The first follow-up Prettier check exited 1
on the new table header; formatting that header resolves it. Product tests and
typecheck/lint are not rerun for this documentation-only change; their previous
R6 results, including the standard root typecheck failure, remain as recorded.
`validation.v1.json` records final commands, results and unchanged blob identities;
`candidate-readback.v1.json` binds the new full SHA to its remote branch and PR.
