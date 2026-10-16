# Platform session revocation browser CSRF flow

Task: `PLATFORM-SESSION-REVOCATION-BROWSER-CSRF-FLOW-20261015`.
Owner: Codex. Independent reviewer: Claude2. Evidence version: v1.

## Delivery state

R4 continuation: machine truth now includes the exact controller write scope.
`IdentityController.listAdminSessions` normalizes only exact HTTP `"true"` or
boolean `true` before the unchanged repository. The original mounted canonical
readback assertion remains intact. Full validation and candidate handoff are in
progress; no review, hosted CI, merge, provider, deployment or live browser success
is claimed. Earlier checkpoint failures and scope holds below remain historical
evidence, not the current scope decision.

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
