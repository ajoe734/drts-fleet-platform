# SR-TENANT-LOGIN-001 — 租戶登入 callback 與錯誤恢復

- Status: candidate handed off for review (see `ai-status.json` for machine truth)
- Owner: Claude
- Reviewer: Claude2
- Base SHA (`origin/dev` at task start after rebase): `0dd392894e455a3b50da80851155c71315c15a8`
- Candidate branch: `claude/sr-tenant-login-001`
- Candidate SHA: recorded at handoff via `CANDIDATE_SHA=$(git rev-parse HEAD)`

## 1. Audit finding vs. current code (regression check, not a redo)

`docs/04-uat/system-remediation-20260906/source/findings.json` → `R02`:

> 正常登入按鈕產生 localhost callback 並被拒絕 / 登入頁按透過 OIDC 登入，400
> AUTH_SESSION_EXCHANGE_DENIED，localhost:3104 不被允許 (evidence:
> `tenant-login-cloud.png`, Cloud Run dev, reproduced twice as of 2026-09-06
> audit).

This is a **historical observation**, not the state of the code at base SHA
`0dd392894`. Reading the current implementation:

- `apps/tenant-console-web/app/api/auth/[...auth]/route.ts:78` and `:208` build
  the OIDC callback as `` `${request.nextUrl.origin}/api/auth/tenant/callback` ``
  — derived from the actual inbound request origin, never a hardcoded
  `localhost:3104` (or any other fixed host/port).
- `apps/tenant-console-web/lib/auth/session.ts` implements an HMAC-signed,
  time-boxed (`TENANT_OIDC_STATE_MAX_AGE_SECONDS` = 600s) OIDC state envelope
  (`encodeStateEnvelope` / `decodeStateEnvelope`), CSRF token verification
  (`verifyCsrfToken`), same-origin enforcement for mutating requests
  (`verifySameOrigin`), and open-redirect sanitization
  (`sanitizeReturnPath`, only same-origin relative paths survive).
- `apps/tenant-console-web/middleware.ts` bounces any unauthenticated
  protected-page request to `/login?redirect_uri=<original same-origin
path+search>` (JSON 401 for API/proxy routes), so an expired/cleared
  session is always recoverable rather than a dead end.
- `git log --oneline -- apps/tenant-console-web/app/api/auth/ apps/tenant-console-web/lib/auth/`
  shows this behavior was already introduced by prior canonical work
  (IAM-OP-AUTH-001, IAM-OP-AUTH-E2E-001, S1F-REL-CLOSE lineage), merged before
  this task's 9/6 audit snapshot was taken.

Conclusion: the specific R02 defect (hardcoded `localhost:3104` callback) does
**not** exist at base SHA `0dd392894`. Per this task's brief ("已由其他任務修復
時提交目前 SHA 的回歸證據，不重做或回退"), this task's deliverable is
regression evidence + closing the gap between "acceptance conditions are met"
and "acceptance conditions have committed automated proof," not a
re-implementation.

## 2. What was verified (commands + exact results)

All commands were run from the isolated task worktree
`/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/claude-sr-tenant-login-001`
on branch `claude/sr-tenant-login-001`, rebased onto `origin/dev` at
`0dd392894`, using `npx --yes pnpm@10.33.0 …` (the worktree's own `pnpm`
binary is not on `PATH` in this sandbox; `npx pnpm@10.33.0` resolves to the
same pinned `packageManager` version declared in the root `package.json`).

### 2.1 Environment note (install repair, no lockfile change)

This worktree's `node_modules` was only partially linked (`react` was
missing from both the root and `apps/tenant-console-web` `node_modules`,
failing `tests/unit/api-client.test.ts` and
`tests/unit/tenant-av-fallback.test.ts` with `Cannot find package 'react'`).
Fixed by relinking the existing pnpm content-addressable store into this
worktree:

```
$ git status --short pnpm-lock.yaml   # empty, before
$ CI=true npx --yes pnpm@10.33.0 install --frozen-lockfile --offline
Done in 7.6s using pnpm v10.33.0
$ git status --short pnpm-lock.yaml   # empty, after — lockfile untouched
```

This is an environment/install artifact of the isolated worktree, unrelated
to `SR-TENANT-LOGIN-001`'s write scope.

### 2.2 Full tenant-console-web unit suite (must still pass — no regression introduced)

```
$ npx --yes pnpm@10.33.0 --filter @drts/tenant-console-web exec vitest run
 Test Files  12 passed (12)
      Tests  73 passed (73)
```

### 2.3 New SR-TENANT-LOGIN-001 regression file, via the required root Vitest command

```
$ npx --yes pnpm@10.33.0 exec vitest run tests/unit/system-remediation/sr-tenant-login-001/
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

New file: `tests/unit/system-remediation/sr-tenant-login-001/tenant-login-callback-recovery.test.ts`.
It drives the real route handlers
(`apps/tenant-console-web/app/api/auth/[...auth]/route.ts`) and
`apps/tenant-console-web/middleware.ts` — no fixtures/fake signatures/fake
delivery — and covers:

1. **R02 regression** — login on a non-localhost public origin
   (`https://tenant.console.drts.example.com`) produces a backend
   `redirect_uri` equal to that origin's own callback path, and explicitly
   asserts it does **not** contain `localhost:3104` / `localhost`.
2. **Malicious `returnTo` rejected end-to-end** — login requested with
   `redirect_uri=https://evil-attacker.example/steal`; the signed state
   envelope's `returnUrl` is sanitized, and after a valid callback exchange
   the final redirect lands on the origin root, not the attacker origin.
3. **State replay rejected** — a legitimate callback consumes (clears) the
   one-time OIDC state cookie in the response (asserted via `Max-Age=0` /
   `Expires: Thu, 01 Jan 1970`); replaying the identical callback URL without
   that cookie is denied with `AUTH_SESSION_EXCHANGE_DENIED` (400).
4. **Forged state rejected** — a callback with an attacker-guessed `state`
   query parameter that does not match the signed envelope is redirected to
   `/login?error=AUTH_STATE_MISMATCH` and never calls the upstream exchange
   endpoint (spy assertion `not.toHaveBeenCalled()`).
5. **Expired-session recovery loop** — an expired/revoked session probe
   (`GET /api/auth/session` → upstream 401) clears the session cookie, and
   the next protected-page request (no cookie) is bounced by
   `middleware.ts` to `/login?redirect_uri=<original same-origin path>`
   (recoverable, same-origin, never an open redirect).
6. **Controlled logout** — `POST /api/auth/logout` clears the session, CSRF,
   _and_ OIDC-state cookies together.

### 2.4 Static checks

```
$ git diff --check
(no output — clean, exit 0)

$ npx --yes pnpm@10.33.0 --filter @drts/tenant-console-web typecheck
✓ Types generated successfully
(exit 0)
```

## 3. Acceptance criteria mapping

| 驗收條件                                                | 狀態          | 證據                                                          |
| ------------------------------------------------------- | ------------- | ------------------------------------------------------------- |
| 受控 OIDC 登入/登出/過期 session 回復可用               | ✅ 迴歸通過   | §2.3 items 1, 5, 6                                            |
| 惡意 returnTo 與 state 重放拒絕                         | ✅ 迴歸通過   | §2.3 items 2, 3, 4                                            |
| dev 正常流程與正式 IAP 驗收分開，不能用假 header 繞登入 | ⚠️ 部分——見下 | 本任務未新增/修改任何 IAP header bypass；未執行 live IAP 驗收 |
| 證據包含 base/candidate SHA、實際指令結果與資源 ID      | ✅            | 本文件 §0, §2                                                 |
| 先 commit＋普通 push，再 handoff                        | ✅            | 見 handoff 記錄                                               |

### Explicitly NOT done in this task (no fake completion claimed)

- **No live Cloud Run / real IdP round-trip was executed.** This sandbox has
  no network egress to the real OIDC provider or the deployed Cloud Run
  tenant console. All verification above is via the real route-handler code
  paths under Vitest with mocked upstream HTTP responses (`global.fetch`
  mocked per-test), not via fixtures replacing the code under test. A live
  Cloud Run re-run of the exact repro steps from `findings.json` (R02), and
  the separate formal IAP acceptance pass, remain outside this task's
  reachable scope and must be tracked/executed by whichever task/owner has
  access to that environment (see `SR-READINESS-001` / `SR-UAT-HARNESS-001`
  for cross-role test-identity/harness ownership).
- No fixture, fixed percentage, fake signature, or fake delivery was used
  anywhere in the new test or the reviewed production code — the state
  envelope, CSRF token, and cookie flows exercised are the real
  `lib/auth/session.ts` implementations.

## 4. Files touched

- `tests/unit/system-remediation/sr-tenant-login-001/tenant-login-callback-recovery.test.ts` (new)
- `docs/04-uat/system-remediation-20260906/SR-TENANT-LOGIN-001.md` (this file, new)

No files outside this task's `write_scopes` were modified.
