# CI-BUILD-CROSS-APP-IMPORT-20261005

Owner: Codex. Reviewer: Codex2. Baseline: `b20895a17` (full SHA in baseline log).

## Repair boundary

The enterprise Dockerfile copies `packages/` and only its own app. Its auth route
imported the tenant-console app, so a monorepo build concealed a missing image
input. Move the complete handler dependency closure to `@drts/tenant-auth`:
`createTenantAuthHandlers`, cookie constants, state/CSRF helpers, Cloud Run
transport, and `verifyTenantSession`. Both app routes consume the workspace
package. Keep tenant helper re-exports for existing middleware, BFF and tests;
keep `/login` versus `/auth-required` host-local error destinations.

No UI, auth policy, cookie scope or API contract redesign. Existing behavior
tests call the real route handlers; only external HTTP is mocked.

## Findings and acceptance evidence

| Finding / acceptance | Source and change | Before → after | Command / evidence | Remaining limits |
| --- | --- | --- | --- | --- |
| enterprise-dispatch-web可在自己的Docker建置脈絡中建置 | enterprise Dockerfile; new package and both app dependency manifests | Baseline clean context fails with the exact cross-app module-not-found; fixed build pending | `bash tools/ci/verify-enterprise-build-context.sh b20895a17`, exit 1; `.local/ci-build-cross-app-import/baseline-build.log` | Build only; no Docker/server/browser runs |
| 不再跨app相對路徑匯入 | both auth routes import `@drts/tenant-auth` | Pending guard and behavior regression | `node tools/ci/check-cross-app-imports.mjs`; existing BFF/auth suites | Real Google/provider login not implied by mock HTTP tests |
| CI加入防止跨app匯入的檢查 | `check-cross-app-imports.mjs`, `cross-app-imports.test.ts`, `ci.yml` product smoke gate | Pending positive/negative executable fixtures | JS/TS import, re-export, dynamic import, require, type import and stylesheet references | Relative references; package/alias dependency policy is outside this guard |
| 同候選SHA CI通過且獨立reviewer審查 | candidate lifecycle, reviewer Codex2 | Pending final candidate and hosted CI | SHA/PR recorded by handoff after final push | Owner does not approve/merge/close; Supervisor deploys after merge |

Machine-local logs and retained clean contexts live under
`.local/ci-build-cross-app-import/` in the assigned task worktree. The reusable
build script archives a named commit and the Dockerfile's source inputs into a
new directory, installs with a frozen lockfile, and runs its exact four build
commands. It retains the context for inspection and never launches a service.
