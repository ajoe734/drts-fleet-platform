# S3-FIX-OPS-SOS-BOARD-SCOPE-001 — scope-boundary decision and fix

- Task: `S3-FIX-OPS-SOS-BOARD-SCOPE-001`
- Owner: `Claude2`
- Reviewer: `Claude`
- Branch: `claude2/s3-fix-ops-sos-board-scope-001`, base `dev` @ `a03e32ea2`
- Date: `2026-07-25`
- Source finding: `S3-VERIFY-001` §"Incidental finding" —
  `/sos/board` calls `GET /api/driver/tasks` under the Ops identity and receives
  `403 AUTH_SCOPE_DENIED` (`required: driver:read`), leaving
  `reject_authorization` rows visible in `S3-O05-sos-records.png`.

---

## 1. Decision

**Ops keeps `GET /api/driver/tasks` as the board's data source. The
proxy-minted `ops_user` identity is corrected to carry the grant the API already
defines for that actor type.** The board data source is not changed.

Why this and not "change the board data source":

1. The boundary was already decided and already landed. `resolveRouteAuthPolicy`
   admits realm `ops` on `driver/tasks` by design
   (`apps/api/src/common/auth/auth.policy.ts:303-323`, description
   `"Driver task access"`), and `AUTH_SCOPE_PRESETS.ops_user` was given
   `driver:read` on 2026-06-15 by `0c66acb5a`
   (`OPS-DRIVER-READ-DISPATCH-20260615`, #735) with the commit subject
   _"grant ops_user driver:read so the dispatch board loads"_. This task did not
   need to pick a boundary so much as finish enforcing the one on record.
2. `/sos/board` is not the only caller. `apps/ops-console-web/app/dashboard/page.tsx:1047`
   and `apps/ops-console-web/app/dispatch/page.tsx:2655` call the same endpoint,
   so re-sourcing one board would have left two other Ops surfaces denied.
3. The grant stays read-only. `ops_user` gets `driver:read` and **not**
   `driver:write`, so Ops can read driver task assignment but cannot drive the
   driver task state machine (`accept` / `depart` / `complete` all require
   `driver:write`). Other `/api/driver/*` families (profile, SOS submission,
   device session) remain driver-realm only and are untouched.

## 2. Root cause

The failing identity is not the one the API-side tests assert against.

`apps/ops-console-web` browser traffic defaults to `/control-plane-proxy`
(`apps/ops-console-web/lib/runtime-config.tsx:6`), so `getOpsClient()` sends no
actor headers of its own. The proxy route
(`apps/ops-console-web/app/control-plane-proxy/[...path]/route.ts:116`) calls
`issueControlPlaneRequestAuth({ actorType: "ops_user" })`, which **mints** the
identity from `CONTROL_PLANE_SCOPE_PRESETS` in
`packages/control-plane-auth/src/index.ts` and writes it into `x-scopes` (or the
`scopes` claim of the inner Bearer when `JWT_SECRET` is set).

`deriveScopes()` (`apps/api/src/common/auth/auth.extractor.ts:112-120`) returns
explicit scopes verbatim and only falls back to `AUTH_SCOPE_PRESETS` when none
were supplied. For a browser request the proxy preset therefore **replaces** the
API preset.

Timeline:

| Date       | Commit      | Effect                                                                                                                                            |
| ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-24 | `5027f6af6` | introduces `packages/control-plane-auth` with a copy of the ops/platform scope presets; moves the ops-console browser onto `/control-plane-proxy` |
| 2026-06-15 | `0c66acb5a` | adds `driver:read` to `AUTH_SCOPE_PRESETS.ops_user` only — the proxy copy is not updated                                                          |
| 2026-07-25 | —           | `S3-VERIFY-001` observes `403 AUTH_SCOPE_DENIED` on `/sos/board`                                                                                  |

So #735 fixed the server-side preset that the browser never reaches. The denial
is raised at `apps/api/src/common/auth/bootstrap-auth.guard.ts:389` and audited
as `reject_authorization` at `:328`, which is exactly the row seen in
`support/sidecars/S3-VERIFY-001/screenshots/S3-O05-sos-records.png`.

### Why nothing caught it

`apps/api/tests/unit/ops-driver-tasks-scope.test.ts` — added by #735 for this
exact concern — asserted `AUTH_SCOPE_PRESETS.ops_user` and the route policy.
Both were correct. Neither is the identity a browser request carries, so the
test was green for the whole period the board was 403ing.

### Preset drift measured

`CONTROL_PLANE_SCOPE_PRESETS` was a strict subset of `AUTH_SCOPE_PRESETS` for
both control-plane actor types:

| Actor type       | In API preset, missing from proxy preset                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| `ops_user`       | `driver:read`, `sandbox.compliance.read`, `sandbox.investigation.read`, `sandbox.evidence.preview` |
| `platform_admin` | the 12 `sandbox.*` compliance/governance scopes                                                    |

Nothing was over-granted in either direction.

## 3. Change

1. `packages/control-plane-auth/src/index.ts` — `ops_user` brought to full
   parity with `AUTH_SCOPE_PRESETS.ops_user` (adds `driver:read` plus the three
   read-only `sandbox.*` scopes the same drift had dropped), and a comment
   naming the API table as the source of truth.
2. `apps/api/tests/unit/ops-driver-tasks-scope.test.ts` — extended with five
   cases that assert the identity the proxy actually mints (below).
3. `docs/03-runbooks/auth-plane-separation-matrix.md` — new "Scope Grants"
   section plus Hard Rule 5, so the next person who adds a control-plane scope
   is told that the API preset alone does nothing for the browser.

`platform_admin` is deliberately **not** widened here. Those 12 scopes include
dual-control approval rights (`sandbox.legal_hold.release.approve`,
`sandbox.evidence.export.approve`); expanding an approver set is not this task's
call and belongs to a `platform-admin-web` task. The new test pins
`platform_admin` against over-grant only. **This is an open gap, not a fix** —
see §6.

## 4. Regression coverage

`apps/api/tests/unit/ops-driver-tasks-scope.test.ts`, new cases:

- proxy-minted bootstrap headers, run through the API's own
  `extractBootstrapRequestIdentity`, satisfy the realm and every required scope
  of `resolveRouteAuthPolicy("GET", "/api/driver/tasks")`
- the JWT path carries the same scopes in its `scopes` claim
- proxy `ops_user` preset is set-equal to `AUTH_SCOPE_PRESETS.ops_user` (drift guard)
- **`BootstrapAuthGuard` admits the board request and writes no
  `reject_authorization` audit row** — the acceptance criterion asserted at the
  only code path that emits that row
- proxy `platform_admin` never over-grants beyond the API preset

The coverage is not vacuous. With the fix reverted and the tests unchanged:

```
× bootstrap-header identity from the proxy satisfies GET /api/driver/tasks
× jwt_bearer identity from the proxy carries the same scopes
× proxy ops_user preset stays in parity with the API ops_user preset
× guard admits the board request without writing a reject_authorization audit row
  → AssertionError: expected [ Array(24) ] to include 'driver:read'
  → ApiRequestError AUTH_SCOPE_DENIED (bootstrap-auth.guard.ts:389)
Tests  4 failed | 4 passed (8)
```

With the fix applied: `Tests 8 passed (8)`.

## 5. Gates run

| Gate                                                                         | Result                          |
| ---------------------------------------------------------------------------- | ------------------------------- |
| `vitest run tests/unit` (apps/api, full unit tier)                           | **PASS** — 110 files, 918 tests |
| `vitest run tests/unit/ops-driver-tasks-scope.test.ts`                       | **PASS** — 8/8                  |
| same file, fix reverted                                                      | **FAIL** — 4/8 (intended)       |
| `tsc -p apps/api/tsconfig.json --noEmit`                                     | **PASS**                        |
| `tsc` over `apps/api/src` + the new test + `packages/control-plane-auth/src` | **PASS**                        |
| `tsc -p packages/control-plane-auth/tsconfig.json --noEmit`                  | **PASS**                        |
| `eslint` on both changed files                                               | **PASS** (`--max-warnings=0`)   |
| `prettier --check` on both changed files                                     | **PASS**                        |

Prerequisite: `packages/contracts` had to be built in this worktree
(`tsc -p packages/contracts/tsconfig.json`) before `apps/api` typecheck could
resolve `@drts/contracts`; the shared `node_modules` `@drts/*` links still point
at the pruned `claude2-p5-pax-001` worktree.

### Honesty boundary

No browser was driven and no screenshot was taken for this task. The `/sos/board`
acceptance is asserted at the guard, which is the sole writer of the
`reject_authorization` audit row and the sole source of the observed 403 — the
failure reproduces and clears deterministically there, with no database or
rendering involved. A rendered re-shot of `S3-O05` against a live stack was not
run and is **not** claimed.

## 6. Open gap handed back to the board

`CONTROL_PLANE_SCOPE_PRESETS.platform_admin` is still missing all 12 `sandbox.*`
scopes that `AUTH_SCOPE_PRESETS.platform_admin` grants. Any `platform-admin-web`
sandbox compliance / investigation / evidence / legal-hold surface reached
through `/control-plane-proxy` will fail the same way `/sos/board` did. It is not
fixed here because widening a dual-control approver set is out of this task's
scope. Recorded as `S3-FIX-PLATFORM-ADMIN-SANDBOX-SCOPE-001`.
