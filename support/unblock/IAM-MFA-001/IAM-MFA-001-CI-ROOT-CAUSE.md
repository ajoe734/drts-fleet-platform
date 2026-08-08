# IAM-MFA-001 — CI root cause for the `JWT_INVALID` negative-matrix / e2e failures

- Task: `IAM-MFA-001`
- Author lane: `Claude` (owner after the 2026-08-08 chairman reassignment)
- Reviewer: `Codex`
- Produced: 2026-08-08
- Status of this artifact: diagnosis + exact patch, **applied to the integration rail**
  as commit `a4a9303516b346e72eb6fe440a4298a4fdd81d1f`; see §8 for what is still blocked

## 1. Why this artifact exists

The `IAM-MFA-001-UNBLOCK-HISTORY-REPAIR` review explicitly deferred the remaining
root-cause repair to this parent task:

> 保留意見一：Acceptance 2 的 merged_to_dev 尚未驗證。#1303 的 ci-integ/e2e/iam-negative-matrix 仍 FAILURE，
> 且 dev baseline 於 30906537102 與 30920030312 皆 success，故該 JWT_INVALID 失敗確為 clean-route commits
> 帶入而非既有 trunk 問題。殘餘 root cause 修復歸屬已 reopen 的 parent IAM-MFA-001

This document closes that diagnosis gap.

## 2. Observed failure

CI run `30918215661` on PR #1303 (`codex/iam-mfa-001-clean-route` @ `e3ecc0a0`):

| Job | Result |
| --- | --- |
| `iam-negative-matrix` | FAILURE |
| `e2e` | FAILURE |
| `ci-integ` | FAILURE (aggregate) |
| `unit`, `lint`, `build`, `typecheck`, `integration`, `orchestrator-tests`, `i18n-guard` | SUCCESS |

Failing scenarios and symptom:

```
E2E-004 — 1.1 POST /platform-admin/tenants
  [FAIL] Expected HTTP 200|201, got 401
  {"error":{"code":"JWT_INVALID","message":"... is invalid or expired.",
   "details":{"route":"/api/platform-admin/tenants"}}}

E2E-018 — 1.1 POST /auth/driver/device/register
  [FAIL] Expected HTTP 200|201, got 401
  {"error":{"code":"JWT_INVALID", ...,"details":{"route":"/api/auth/driver/device/register"}}}
```

Both failing steps are **write** requests. Read requests in the same suites pass.

## 3. Root cause

The regression is in `tests/e2e/lib/helpers.sh`, not in the API step-up code.

`BootstrapAuthGuard` only gained an `assertRequestSatisfied` call that runs *after*
JWT verification, so it cannot produce `JWT_INVALID`. The 401 is raised during
token validation, which means the suites started presenting a different credential.

The branch adds an opt-in flag with an explicit warning about this exact hazard:

```sh
# Opt-in for runtime-minted bearer + step-up proof flow. Leave disabled by
# default because workforce bootstrap tokens without durable memberships fail
# platform/ops JWT validation in the generic hermetic suites.
E2E_ENABLE_RUNTIME_STEP_UP="${E2E_ENABLE_RUNTIME_STEP_UP:-}"
```

`should_force_runtime_bearer()` honours that flag. **The minting block does not.**
In `http_call()` (clean-route line 304):

```sh
if [[ "$method" =~ ^(POST|PUT|PATCH|DELETE)$ ]]; then
  if [[ -z "$application_bearer" ]]; then
    application_bearer=$(mint_runtime_bearer_token || true)   # runs even when the flag is OFF
  fi
  ...
fi
```

With the flag unset (the CI default) every write request therefore:

1. mints a workforce bootstrap token via `POST /auth/token`, then
2. sends it as `x-drts-authorization: Bearer …` (line 313), and
3. **suppresses the bootstrap identity headers**, because the `x-actor-type` /
   `x-actor-id` / `x-realm` block and the `x-scopes` block are both guarded by
   `-z "$application_bearer"` (lines 324 and 346).

So the hermetic suites lose their bootstrap identity and instead present exactly the
"workforce bootstrap token without durable memberships" that the comment says will
fail platform/ops JWT validation → `JWT_INVALID`.

This also explains the read/write asymmetry: only `POST|PUT|PATCH|DELETE` enter the block.

Note: commit `e3ecc0a0` ("gate runtime step-up helper") was intended to fix this, but it
gated only `should_force_runtime_bearer`. CI run `30918215661` tested `e3ecc0a0` and still
failed, which confirms the gate is incomplete rather than absent.

## 4. Exact patch

Applies to `tests/e2e/lib/helpers.sh` on `codex/iam-mfa-001-clean-route`
(base blob `e612fecd6507a23e927e1954119e9d829f590753`). Verified with `bash -n`.

```diff
@@ -211,17 +211,22 @@
   printf '%s' "$reference"
 }
 
-should_force_runtime_bearer() {
-  local method="$1"
-  local path="$2"
-
+runtime_step_up_enabled() {
   case "${E2E_ENABLE_RUNTIME_STEP_UP:-}" in
     1|true|TRUE|yes|YES)
+      return 0
       ;;
     *)
       return 1
       ;;
   esac
+}
+
+should_force_runtime_bearer() {
+  local method="$1"
+  local path="$2"
+
+  runtime_step_up_enabled || return 1
 
   case "${E2E_ACTOR_TYPE:-}" in
     platform_admin|ops_user)
@@ -301,7 +306,7 @@
     curl_args+=(-H "x-drts-authorization: Bearer ${E2E_REQUEST_BEARER_TOKEN}")
   fi
 
-  if [[ "$method" =~ ^(POST|PUT|PATCH|DELETE)$ ]]; then
+  if runtime_step_up_enabled && [[ "$method" =~ ^(POST|PUT|PATCH|DELETE)$ ]]; then
     if [[ -z "$application_bearer" ]]; then
       application_bearer=$(mint_runtime_bearer_token || true)
     fi
```

With the flag off, `application_bearer` stays empty, so lines 313 / 324 / 346 restore the
pre-change dev-baseline header set exactly. The opt-in runtime step-up path is unchanged
when `E2E_ENABLE_RUNTIME_STEP_UP` is truthy.

## 5. Why this task is not `done`

Acceptance item *"Negative matrix and audit events pass"* is still unmet: the only
integration rail (PR #1303) is CI-red on `iam-negative-matrix` / `e2e` / `ci-integ`,
and the PR is additionally `mergeable: CONFLICTING` against `dev`.

Remaining work, in order:

1. Apply §4 to `codex/iam-mfa-001-clean-route` (normal non-force commit).
2. Resolve the `CONFLICTING` state of PR #1303 against `dev`.
3. Re-run CI and confirm `iam-negative-matrix`, `e2e`, `ci-integ` go green.
4. Only then merge and record `merged_to_dev` / `dev_deployed` with run evidence.

## 6. Branch landscape (recorded so the next dispatch does not re-derive it)

| Branch | Content | Role |
| --- | --- | --- |
| `codex/iam-mfa-001-clean-route` @ `e3ecc0a0` | 16 files, `step-up.policy.ts` (~54 colon-style action ids) | **canonical rail**, PR #1303, supersedes #1287 / #1293 |
| `gemini2/iam-mfa-001` @ `9d09011f` | byte-identical file set to clean-route | prior owner's line, same implementation |
| `claude/iam-mfa-001` @ `5289d1a7` | 14 files, `mfa-step-up.policy.ts` (27 dot-style action ids) | **superseded parallel implementation**, no PR |

The 2026-08-08 approval note ("54 個特權 action ID 完全對齊") matches the clean-route
catalog, not the `claude/iam-mfa-001` catalog. The `claude/iam-mfa-001` branch this
dispatch assigned must therefore **not** be closed out as the delivered work for
IAM-MFA-001.

## 7. Verification performed

- `bash -n` on the patched `helpers.sh` — syntax OK.
- `tests/unit/mfa-step-up-policy.test.ts` on `claude/iam-mfa-001` — 39/39 passed.
- `tests/unit/mfa-step-up-guard.test.ts` — could not run: this worktree has no
  per-package `node_modules` and `pnpm install` is blocked by the worker sandbox.
- The patch itself was **not** executed against a live API; CI on PR #1303 is the
  verification gate for §4, and that gate has **not yet been able to run** (see §8).

## 8. What this dispatch delivered, and what is still blocked

Delivered:

- `a4a9303516b346e72eb6fe440a4298a4fdd81d1f` on `codex/iam-mfa-001-clean-route` —
  the §4 patch, pushed as a normal non-force commit via the GitHub contents API.
  PR #1303 `headRefOid` is now this commit.
- This artifact, on `claude/iam-mfa-001`.

Still blocked — **PR #1303 cannot be validated or merged**:

- `PUT /repos/ajoe734/drts-fleet-platform/pulls/1303/update-branch` returns
  `422 merge conflict between base and head`. The conflict is real, not a stale
  mergeability cache.
- Because the PR is `CONFLICTING`, GitHub cannot compute a merge ref, so **no CI run
  was triggered for `a4a9303`**. The newest runs on this branch are still
  `30918215661` / `30918216460` against the old head `e3ecc0a0`. The §4 fix is
  therefore pushed but *unverified*.
- The three files that conflict with the 14 commits `dev` has gained since the merge
  base are:
  - `apps/api/src/common/audit/security-event-matrix.ts`
  - `apps/api/src/common/auth/index.ts`
  - `apps/api/src/modules/auth/auth.controller.ts`

Why this worker could not resolve the conflict: the assigned sandbox refused
`git worktree add`, `git read-tree` / `git hash-object -w`, `cp`, and
`pnpm install`. Without a checkout of `codex/iam-mfa-001-clean-route` there is no
way to perform a three-way merge, and the contents API cannot express one. The
next dispatch needs a worker whose cwd is a checkout of that branch.

Next dispatch should:

1. Check out `codex/iam-mfa-001-clean-route`, merge `origin/dev`, resolve the three
   files above, and push the merge (non-force).
2. Confirm CI now triggers for the head and that `iam-negative-matrix`, `e2e`, and
   `ci-integ` pass with the §4 fix in place.
3. Decide the fate of the superseded `claude/iam-mfa-001` branch (§6) — it should not
   be merged.
