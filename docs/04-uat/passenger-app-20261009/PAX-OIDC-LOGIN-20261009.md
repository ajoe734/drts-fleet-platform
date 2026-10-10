# PAX-OIDC-LOGIN-20261009 — owner implementation evidence

Owner: Claude. Reviewer: Codex. Branch: `claude/pax-oidc-login-20261009`, base `dev`.

The exact final candidate SHA / PR are recorded by canonical `handoff`; nothing
in this document is a review/CI/merge/PG acceptance claim.

## Authority and implementation

Read the task brief, `AI_COLLABORATION_GUIDE.md` §0.7, `docs/ops/branch-strategy.md`
§11, `docs/02-architecture/passenger-app-20261009/01_system_sa_sd.md` §§2–4 and
`02_content_and_rules.md`, and the merged `PAX-ACCOUNT-SESSION-20261009` code
(`ce5b3e63d`) this task builds on: `passenger.accounts` / `passenger.logins`
(unique `(provider, subject)`) / `passenger.sessions`, `PassengerAccountService`
(`findOrCreateByIdentity`, `linkIdentity`, `issueSession`), `PassengerJwtService`,
and the existing tenant/partner OIDC reference implementation
(`apps/api/src/modules/auth/oidc-id-token-verifier.ts`,
`apps/api/src/modules/auth/oidc-pkce.service.ts`).

- Migration `V0110__passenger_oauth_transactions.sql` (next free allocation after
  V0109) adds `passenger.oauth_transactions`: `transaction_id` (PK, the only
  value returned to the client besides the plaintext `state`), `provider`,
  `purpose`, `state_hash` (SHA-256 of the state the client echoes back —
  equality-only, never needs the raw value again), `nonce` (kept plaintext;
  only ever compared against the verified ID token's `nonce` claim, never a
  secret exchanged with the provider), `code_verifier` / `code_challenge` (the
  PKCE pair — the raw verifier is kept because the real token-exchange step
  must send it to Google/LINE for them to validate `sha256(verifier) ==
  challenge`; hashing it at rest would make a real exchange cryptographically
  impossible), `redirect_uri`, `drts_passenger_id` (nullable; set only for
  `purpose='link'`), `created_at`/`expires_at` (10-minute TTL, matching the
  existing tenant/partner OIDC state TTL), `consumed_at` (one-time use).
- `PassengerOAuthTransactionRepository.claim` is a single atomic
  `UPDATE ... WHERE consumed_at IS NULL AND expires_at > $2 RETURNING *`: the
  transaction is burned by `transaction_id` alone, *before* `state`/provider
  equality is even checked, so a replay with a corrected `state` after a
  failed attempt still fails (`invalid_grant`), not just the first wrong one.
- `oidc-id-token-verifier.ts` gained an explicit `overrides?: {issuer, audience,
  jwksUri, hsSecret}` parameter (4th, optional) on `verify()`. Every existing
  call site (`oidc-pkce.service.ts`, tenant/partner) is unchanged — it never
  passes a 4th argument, so it keeps resolving `TENANT_OIDC_*` / `OIDC_*` env
  vars exactly as before. Passenger Google calls pass
  `{issuer: GOOGLE_OIDC_ISSUER, audience: <passenger client id>}`; passenger
  LINE calls pass `{issuer: "https://access.line.me", audience: <channel id>,
  jwksUri: LINE's certs endpoint, hsSecret: <channel secret>}` — the `hsSecret`
  override is a legitimate, always-available HS256 verification key (LINE
  Login v2.1's default signing mode), unlike the pre-existing
  `environment==='local'||'test'` fallback a few lines above it, which stays a
  test-only convenience for the tenant/legacy path.
- `apps/api/src/modules/passenger-app/oauth/`: `oauth-transaction.port.ts`
  (types), `oauth-transaction.repository.ts` (production SQL, bound params
  only), `oauth-provider.config.ts` (all-or-nothing env gating per SD §4:
  `GOOGLE_OAUTH_CLIENT_ID`+`_SECRET`, `LINE_CHANNEL_ID`+`_SECRET`; exact-string
  `OAUTH_REDIRECT_ALLOWLIST` match; `GET providers` also reports `phone`
  gated on `SMS_PROVIDER_API_KEY`+`_SENDER_ID`, `email` always on, and never
  reports `facebook` — the transaction table's provider CHECK already allows
  it for later reuse, but no OAuth2 exchange is implemented in this task),
  `passenger-oauth.service.ts` (start/callback), `passenger-oauth.controller.ts`
  (`POST auth/oauth/:provider/start`, `POST auth/oauth/:provider/callback`,
  `GET auth/providers`, all `@OpenRoute()`).
- `start`: all-or-nothing provider check → body whitelist/type validation →
  redirect-URI allowlist check → for `purpose:"link"`, requires a live
  passenger Bearer (`BootstrapAuthGuard.activatePassenger` already populates
  `request.identity` from exactly that credential on this `@OpenRoute()` path)
  and captures its `drtsPassengerId` into the new row — a link transaction is
  permanently bound to whoever started it, never to whatever Bearer happens to
  be presented again at `/callback`. Generates `state`/`nonce`/PKCE pair,
  persists the row, returns `{authUrl, transactionId, expiresAt, state}` —
  deliberately never the `nonce` or PKCE material, which never need to leave
  the server.
- `callback`: provider check → body validation → atomic claim by
  `transactionId` → provider/`state_hash` equality → (`purpose:"link"` only)
  caller's Bearer `drtsPassengerId` must equal the row's bound id → real
  `POST` to the provider's token endpoint with `code`, the *stored*
  `redirect_uri` (must equal what was sent to `/authorize`, standard OAuth2
  requirement), `client_id`/`client_secret`, and the stored raw
  `code_verifier` → verify the returned `id_token` via the generalized
  `OidcIdTokenVerifier` (signature, `iss`, `aud`, `nonce`, `exp` — `exp` is
  enforced by `jsonwebtoken`'s default `jwt.verify` behavior, not bespoke
  code) → `purpose:"login"` calls `findOrCreateByIdentity(provider, sub, …)`
  + `issueSession`; `purpose:"link"` calls `linkIdentity(identity, provider,
  sub, …)`. `email`/`name` claims are only ever used as *non-authoritative*
  attributes on a brand-new account (`verifiedEmail` only when
  `email_verified===true`) — the lookup/matching key is always
  `(provider, sub)`, per SD §2 "第三方回傳的 email 不作為合併依據"; this task
  adds no email-based account matching anywhere.
- `auth.policy.ts` gained one additive branch (`passenger-app/auth/providers`
  and `passenger-app/auth/oauth/:provider/(start|callback)`) inside the
  existing `passenger-app/*` block, purely for documentation/any future direct
  `resolveRouteAuthPolicy` consultation — `BootstrapAuthGuard` already routes
  every `passenger-app/*` path through `activatePassenger()` before this table
  is consulted, so this change does not alter runtime authorization.
- `passenger-app.module.ts` only appends the new controller/service/repository
  to the existing `@Global` module's `controllers`/`providers` arrays; nothing
  existing was removed or reordered.

## SQL / migration reconciliation (owner; reviewer must independently compare)

Production path: `PassengerOAuthTransactionRepository.insert`/`claim` →
`DatabaseService.query` (pool-level, no explicit `BEGIN`/`COMMIT` needed since
each method is one bound statement); only bound parameters, no interpolated
identities.

| Column               | Migration (`V0110`)                                      | Production mapping / write                                                                         |
| --------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `transaction_id`      | `uuid PRIMARY KEY`                                        | `transactionId`; server `randomUUID()`; returned to the client as the only opaque reference         |
| `provider`            | `varchar(10) CHECK IN ('google','facebook','line')`        | `OAuthProvider`; bound `$2`; `facebook` reserved, no insert path reaches it in this task             |
| `purpose`             | `varchar(10) CHECK IN ('login','link')`                    | from the validated start command; never re-derived from the callback body                            |
| `state_hash`          | `varchar(64) CHECK ~ '^[0-9a-f]{64}$'`, unique index        | `sha256(state).hex`; compared by re-hashing the callback's `state`, never decrypted/reversed          |
| `nonce`               | `varchar(128)`                                             | random 24-byte base64url; embedded in the `/authorize` URL; compared against the verified ID token    |
| `code_verifier`       | `varchar(128)`                                             | random 32-byte base64url; sent raw to the provider's token endpoint at `/callback`                    |
| `code_challenge`      | `varchar(128)`                                             | `base64url(sha256(code_verifier))`; sent in the `/authorize` URL                                      |
| `redirect_uri`        | `varchar(2048)`                                            | validated against `OAUTH_REDIRECT_ALLOWLIST` at `/start`; reused verbatim at `/callback`'s token POST |
| `drts_passenger_id`   | `varchar(100)` FK `passenger.accounts`, nullable            | set only for `purpose='link'`, from the `/start` caller's verified Bearer; `CHECK` ties it to purpose |
| `created_at`/`expires_at` | `timestamptz`, `expires_at > created_at` CHECK          | 10-minute TTL from `/start` time                                                                      |
| `consumed_at`         | `timestamptz`, nullable                                    | set by the one atomic claim `UPDATE`; `NULL` is the only claimable state                              |

Constraints/indexes: provider/purpose CHECKs, `expires_at > created_at`,
`(purpose='link') = (drts_passenger_id IS NOT NULL)`, unique `state_hash`
index, `expires_at` index for future cleanup. PG execution/locking/constraint
enforcement is **unverified locally** (see blocker below) — reviewer and
hosted CI are the acceptance gate for this table, same as V0109.

## Finding / acceptance evidence

| Acceptance key / behavior                                                         | Source / change                                                                                                   | Static evidence                                                                                                                                                                                                 | Command / result                                                                                                                                                                                                 | Remaining limits                                                                                                   |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pax-oidc_google_line_flow_and_verification` — state/nonce/PKCE/redirect/one-time/expiry negative tests; ID token signature/`iss`/`aud`/`nonce`/`exp` rejection; real Google (RS256) and LINE (HS256 and RS256) ID-token verification; one-time replay burns the transaction | `tests/unit/pax-oidc-login-20261009/passenger-oauth.test.ts` — `describe("OAuth callback: Google/LINE exchange and ID token verification")`, `describe("OAuth start: ...")` | Tests construct real RSA keypairs (`generateKeyPairSync`) and HS256 secrets, sign genuine Google/LINE-shaped ID tokens with `jsonwebtoken`, and mock only the HTTP boundary (`fetch` to the provider's token/JWKS endpoints) — `OidcIdTokenVerifier.verify` runs unmocked, performing real signature/claim verification, mirroring `tenant-partner.controller.test.ts`'s WIF pattern | **Not executed this dispatch** — see blocker below. Written and self-reviewed; not run.                                                                                                                           | Execution pending; see "Checks and unsuccessful setup attempts"                                                     |
| `pax-oidc_linking_and_config_gating` — login finds-or-creates by `(provider, sub)`; authenticated binding; identity already owned by another account rejected (`conflict`); no email-based merge; disabled provider never activates; existing tenant/partner OIDC tests unaffected | `passenger-oauth.service.ts` (`requirePassengerBearer`, `start`/`callback` purpose branches, `oauth-provider.config.ts`); same test file, `describe("OAuth start: ...")`, `describe("OAuth callback: linking")`, `describe("GET /passenger-app/auth/providers")` | Same test file exercises: unauthenticated `link` start rejected; link transaction bound to starting caller only; a different/absent Bearer at callback rejected; linking a subject already owned by another account rejected as `conflict` with the original owner retained; `GET providers` includes google/line only when both env vars are set, never facebook | **Not executed this dispatch.** `oidc-id-token-verifier.ts`'s 4th-parameter addition is additive-only (no existing call site passes it), so no regression is expected in the existing tenant/partner OIDC suites, but this is **not** a substitute for actually running them. | Execution pending; tenant/partner OIDC regression suite not re-run this dispatch                                   |
| SQL column reconciliation                                                         | `V0110__passenger_oauth_transactions.sql`                                                                         | Table above, written by hand against the migration text                                                                                                                                                                   | N/A — static document review                                                                                                                                                                                     | Reviewer must independently re-derive this table from the migration file, per §0.7                                 |

## Checks and unsuccessful setup attempts

**Blocker: this worktree's shared dependency install is broken, and this
session cannot repair it.**

- `apps/api/node_modules/typescript` (and the equivalent top-level
  `node_modules/typescript`, `node_modules/vitest`, and others) are symlinks
  into `.artifacts/worktrees/auto/gemini-pax-account-session-20261009/node_modules/.pnpm/...`
  — a sibling worktree that has since been removed (consistent with
  `tools/development-orchestrator/skills/worker-anchor-commit.md`'s
  supervisor worktree reaping). The target no longer exists, so every `tsc`/
  `vitest` invocation fails with `MODULE_NOT_FOUND` before running any of this
  task's code. This mirrors exactly what `PAX-ACCOUNT-SESSION-20261009`'s
  owner evidence (this directory) already documented once before
  ("Repaired only this task worktree's 22 dependency symlinks … `pnpm install
  --offline --frozen-lockfile --ignore-scripts`") — the same class of shared
  `.pnpm` store breakage, recurring with a different now-deleted worktree as
  the dangling target.
- The repair is known (same command Codex used previously:
  `pnpm install --offline --frozen-lockfile --ignore-scripts`, or a plain
  `pnpm install`), and this session's root `node_modules/.pnpm` already has
  an intact local copy of `typescript@5.9.3`/`vitest` to relink against — no
  network fetch should even be required. However, every mutating shell
  command in this session (`pnpm install`, `pnpm exec vitest run …`, `tsc …`,
  even `ln -sfn` to repoint just the dangling symlinks, even `rm` of a
  throwaway scratch file) was rejected by the harness as
  `Bash command classified as defer` — consistent with this session's
  `orchestrator_approval_broker` MCP server failing to connect
  (`CONNECT_TIMEOUT`, reported at session start): the permission hook that
  decides whether a mutating command may run has no broker to ask, and defers
  every one instead of prompting or executing. Read-only commands
  (`find`, `grep`, `ls`, `cat`, `git log`, `pnpm --filter … run typecheck`
  itself, `touch`) ran normally; only the actual repair commands were
  affected.
- Net effect: **no `tsc`/`vitest` command could be run this dispatch.**
  `apps/api/tests/unit/passenger-oauth-transaction.repository.test.ts` and
  `tests/unit/pax-oidc-login-20261009/passenger-oauth.test.ts` are written,
  internally consistent with the sibling `pax-account-session-20261009` test
  helpers they import (`MemoryPassengerStore`), and were reviewed by hand
  against the production code they exercise, but are **unrun** static
  evidence only. A stray empty scratch file
  `.claude-scratch-test` was created at the worktree root while diagnosing
  this (via `touch`, which was not deferred) and could not be removed (`rm`
  was deferred); it is zero bytes and git-untracked.
- This is a repo/session infrastructure blocker, not a product-code finding.
  Reviewer/Supervisor should either retry in a session with a healthy
  `orchestrator_approval_broker` connection, or run
  `pnpm install --offline --frozen-lockfile --ignore-scripts` once from a
  session that can execute mutating commands, then run:
  `pnpm --filter @drts/api typecheck`,
  `pnpm exec vitest run apps/api/tests/unit/passenger-oauth-transaction.repository.test.ts tests/unit/pax-oidc-login-20261009/passenger-oauth.test.ts`,
  and the existing tenant/partner OIDC-adjacent suites
  (`tests/unit/tenant-partner.controller.test.ts` and any other
  `oidc`/`pkce`-named suites) to confirm no regression from the
  `oidc-id-token-verifier.ts` signature change.

No VM development server, preview, browser, database or Compose
infrastructure was started. No real Google/LINE/SMS/PSP network calls or
provider secrets were used or required — the test's only external-boundary
mock is `fetch` to the provider's token/JWKS endpoints, as documented above.

## Pending integration / external acceptance

Not yet reached: implementation is written but unexecuted locally (blocker
above), so no `handoff` has been issued and no CI has run. This section will
be completed by whichever dispatch first gets a working `tsc`/`vitest`
environment and pushes a candidate.
