# Platform session revocation browser CSRF flow

Task: `PLATFORM-SESSION-REVOCATION-BROWSER-CSRF-FLOW-20261015`.
Owner: Codex. Independent reviewer: Claude2. Evidence version: v1.

## Delivery state

This is an implementation checkpoint, **not a review candidate or completed
acceptance**. App-local CSRF supply and enforcement are implemented. The mounted
lawful flow reaches the real repository revoke, but its subsequent HTTP inventory
read drops the revoked session. The original readback criterion remains open.
No acceptance key, hosted CI, merge, provider, deployment or live browser success
is claimed by this document.

The original task needs ordinary Supervisor scope coordination for exactly
`apps/api/src/modules/identity/identity.controller.ts`, symbol
`IdentityController.listAdminSessions`: normalize the existing `includeRevoked`
HTTP query value before passing it to the unchanged repository. The controller is
outside the current eight write scopes; it has **not been edited**. Do not replace
the failing readback assertion with a disappearance assertion, turn the HTTP query
into a boolean in the harness, invent a returned session, or waive the criterion.

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
