# SR-TENANT-LOGIN-001 — 租戶登入 callback 與錯誤恢復

- Status: candidate handed off for review (see `ai-status.json` for machine truth)
- Owner: Claude
- Reviewer: Gemini
- Base SHA (`origin/dev` at task start after rebase): `0dd392894e455a3b50da80851155c71315c15a8`
- Candidate branch: `claude/sr-tenant-login-001`
- Candidate SHA: recorded at handoff via `CANDIDATE_SHA=$(git rev-parse HEAD)` (see §2.6 for this
  session's SHA; supersedes the `76cc6c5be2` / `21e342382` SHAs referenced by earlier drafts of
  this document, both of which had a CI-failing test file — see §2.6)

Note: an earlier draft of this document was written before the `ai-status.sh
handoff` call actually landed in machine truth (the task remained
`in_progress`, reassigned back to `Claude` on 2026-09-08 per
`ai-status.json`'s `next` field). A later session re-verified the same
evidence below still held at that `HEAD` (no drift from `origin/dev`, which
only gained unrelated commits — see §2.5) and issued a handoff — but GitHub
CI on PR #1674 (candidate `21e342382`) then failed `typecheck` /
`Canonical consistency` / `Product smoke acceptance`. This session fixes
those CI failures without touching the underlying auth behavior — see §2.6.

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
failing `apps/tenant-console-web/tests/unit/api-client.test.ts` and
`apps/tenant-console-web/tests/unit/tenant-av-fallback.test.ts` with
`Cannot find package 'react'`).
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

### 2.5 Re-verification at re-dispatch (2026-09-08, session 2)

`origin/dev` had advanced 10 commits past base SHA `0dd392894` by the time
this task was re-dispatched. None of those commits touch this task's
write-scope files (`git diff HEAD..origin/dev --stat` over the scope paths
shows only this task's own two files as dev-side deletions, i.e. dev simply
doesn't have them yet — no upstream change to rebase against). Re-ran all
three required commands unchanged from the isolated worktree, pnpm
`10.33.0` on `PATH` this session (no `npx` workaround needed):

```
$ git diff --check
(no output — clean, exit 0)

$ pnpm --filter @drts/tenant-console-web typecheck
✓ Types generated successfully

$ pnpm exec vitest run tests/unit/system-remediation/sr-tenant-login-001/
 Test Files  1 passed (1)
      Tests  6 passed (6)

$ pnpm --filter @drts/tenant-console-web exec vitest run   # full app suite, non-regression check
 Test Files  12 passed (12)
      Tests  73 passed (73)
```

No source changes were needed; this session's contribution is the
re-verification above and issuing the actual `ai-status.sh handoff` call
that the prior session's document described but machine truth shows never
landed.

### 2.6 CI-failure fix, no auth-behavior change (2026-09-08, session 3)

`ai-status.sh show SR-TENANT-LOGIN-001` on re-dispatch showed candidate
`21e3423825ef` (PR #1674) with `ci_status: failure`. `gh pr view 1674
--json statusCheckRollup` showed real (non-flaky) failures in `typecheck`,
`Canonical consistency`, and `Product smoke acceptance` (the last is a
downstream gate on the first two; `Smoke acceptance` failed only because it
gates on `Product smoke acceptance`). Root causes, both confined to this
task's own artifacts — no production auth code was touched:

1. **`typecheck` (CI job log, `tsc --noEmit`)**: the new test file
   (`tests/unit/system-remediation/sr-tenant-login-001/tenant-login-callback-recovery.test.ts`)
   imported the app's route/middleware/constants modules via the `@/...`
   path alias. That alias is registered only in
   `apps/tenant-console-web/tsconfig.json`; the root `tsconfig.json` used by
   `pnpm typecheck:root` (which `pnpm run typecheck` — the actual CI
   `typecheck` job — runs first) has no such mapping, so `tsc -p
   tsconfig.json` failed with `TS2307: Cannot find module '@/...'` the
   moment it tried to type the test file, plus five `TS7006` implicit-`any`
   errors on `(c) =>` cookie-header callbacks whose element type couldn't be
   inferred once the import failed. Fixed by switching the test's own
   imports to relative paths (`../../../../apps/tenant-console-web/...`),
   matching the convention already used by `tests/unit/system-remediation/sr-referral-001/*.test.ts`,
   and adding explicit `(c: string) =>` annotations. That still left one
   transitive failure: `apps/tenant-console-web/middleware.ts` (which the
   test now reaches via a real relative import, per this task's "drives the
   real route handlers/middleware, no fixtures" evidence standard) itself
   imports `@/lib/auth/constants` internally. `middleware.ts` is **not**
   in this task's `write_scopes`
   (`apps/tenant-console-web/app/login/`, `apps/tenant-console-web/app/api/auth/`,
   `apps/tenant-console-web/lib/auth/`, the task's own `tests/unit/...`
   dir, and this doc), so it was not edited. Instead, an ambient module
   shim — `tests/unit/system-remediation/sr-tenant-login-001/tenant-console-web-path-alias.d.ts`
   — re-declares the three names `middleware.ts` imports from
   `@/lib/auth/constants` for the root `tsc` program only; it changes no
   runtime behavior (vitest already resolves `@` via `vitest.config.ts`'s
   own alias, and the app's own build/typecheck resolve `@/*` natively via
   its own tsconfig — verified unaffected in §2.6 command output below).
2. **`Canonical consistency` (CI job log,
   `tools/ci/git/check_canonical_consistency.py --ci`)**: this document's
   §2.1 originally cited the two `api-client.test.ts` /
   `tenant-av-fallback.test.ts` files without their real
   `apps/tenant-console-web/tests/unit/` prefix (see the corrected paths in
   §2.1 above). Fixed by adding that prefix so the citation matches the
   real on-disk location.

Commands re-run from the isolated task worktree
(`/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude-sr-tenant-login-001`,
branch `claude/sr-tenant-login-001`), `origin/dev` at `b5c3774e5e`:

```
$ git diff --check
(no output — clean, exit 0)

$ pnpm --filter @drts/tenant-console-web typecheck
✓ Types generated successfully

$ pnpm typecheck:root        # what CI's `typecheck` job actually runs first
(no output for this task's files — exit 0. Pre-existing unrelated failures
remain for tests/unit/fleet-partner-list-envelope.test.ts and
tests/unit/system-remediation/sr-admin-verify-001/fleet-lists.test.ts: a
duplicate-module-identity TS2345 on ApiClient's private `baseUrl`, caused by
this *isolated worktree* holding its own copy of packages/api-client
alongside the canonical checkout's copy. Confirmed environment-only: the
actual GitHub CI typecheck log for PR #1674 shows only this task's own file
failing, never those two files, since CI runs from a single clean checkout
with no duplicate worktree copy. Out of this task's write_scopes regardless.)

$ pnpm exec vitest run tests/unit/system-remediation/sr-tenant-login-001/
 Test Files  1 passed (1)
      Tests  6 passed (6)

$ pnpm --filter @drts/tenant-console-web exec vitest run   # full app suite, non-regression check
 Test Files  12 passed (12)
      Tests  73 passed (73)

$ python3 tools/ci/git/check_canonical_consistency.py --ci --base origin/dev --head HEAD
[consistency] l1-edit-authority: 0 finding(s)
[consistency] cited-paths: 0 finding(s)
[consistency] cited-decisions: 0 finding(s)
[consistency] task-claims: 0 finding(s)
[consistency] OK
```

No production auth code changed in this session (`apps/tenant-console-web/app/api/auth/`,
`apps/tenant-console-web/app/login/`, and `apps/tenant-console-web/lib/auth/`
are all untouched — confirm via `git diff origin/dev...HEAD --stat`, which
shows only this doc, the test file, and the new `.d.ts` shim).

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

- `tests/unit/system-remediation/sr-tenant-login-001/tenant-login-callback-recovery.test.ts` (edited in §2.6: relative imports instead of `@/...`, explicit `(c: string)` annotations)
- `tests/unit/system-remediation/sr-tenant-login-001/tenant-console-web-path-alias.d.ts` (new in §2.6: ambient type-only shim, see rationale there)
- `docs/04-uat/system-remediation-20260906/SR-TENANT-LOGIN-001.md` (this file)

No files outside this task's `write_scopes` were modified.
`apps/tenant-console-web/middleware.ts` was considered but deliberately
**not** edited — it is outside `write_scopes` and has no declared
`read_dependencies` entry for this task; see §2.6 for the in-scope
workaround used instead.
