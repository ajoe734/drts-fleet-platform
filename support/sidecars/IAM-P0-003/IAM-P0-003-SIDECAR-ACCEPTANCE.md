# IAM-P0-003 Sidecar Acceptance Packet

- Parent Task: `IAM-P0-003` - Classify every API route and enforce global default-deny
- Sidecar Task: `IAM-P0-003-SIDECAR-ACCEPTANCE`
- Owner: `Codex`
- Reviewer: `Codex2`
- Scope Guardrail: support artifact only; no canonical truth or runtime changes

## 1. Objective

Prepare a reviewer-facing packet for `IAM-P0-003` so the parent owner can
close the route-inventory/default-deny slice against concrete repo anchors,
known baseline gaps, and explicit verification expectations.

Primary source anchors:

- `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md`
- `docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md`
- `apps/api/src/common/auth/bootstrap-auth.guard.ts`
- `apps/api/src/common/auth/auth.policy.ts`
- `apps/api/src/common/auth/auth.decorators.ts`

## 2. Canonical Acceptance Summary

`IAM-P0-003` must deliver all of the following:

- Every controller route is classified.
- Anonymous access requires both an explicit open-route marker and an inventory
  entry.
- Unknown or conflicting route metadata fails closed at runtime.
- Adding an unclassified route fails CI.
- Open routes carry explicit rate-limit and data-exposure coverage.

Canonical security intent behind the task:

- `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md`
  names `unknown route 沒有 policy` as an authorization negative path.
- The same hardening plan requires Gate 0 to keep the public-route inventory
  complete and unknown routes fail closed.
- `docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md`
  makes route classification release-relevant and feeds the independent
  negative matrix owned by `IAM-UAT-001`.

## 3. Repo Baseline On 2026-08-01

The current shared repo state is not yet acceptance-clean for `IAM-P0-003`.

### Confirmed Baseline Facts

- `docs/02-architecture/auth-route-inventory.md` is absent in the current tree.
- `apps/api/src/common/auth/bootstrap-auth.guard.ts` returns `true` when a
  request is neither `@OpenRoute()` nor matched by merged policy metadata.
- The current guard therefore does not fail closed on unmatched routes.
- The API surface is broad enough that manual spot-checking is insufficient.
  A raw scan under `apps/api/src/modules` on 2026-08-01 returned:
  52 `*controller.ts` files, 53 `@Controller()` classes, 19 `@OpenRoute()`
  sites, 64 `@RequireScopes()` sites, and 107 raw `@RequireRealms()`
  decorator occurrences.
- Those raw counts are scale indicators only, not acceptance proof.
  `driver-sos.controller.ts` declares two controller classes in one file, and
  class-level decorators can inflate simple grep totals. Reviewer acceptance
  should therefore require exhaustive route classification from controller
  reality, inventory, and tests instead of relying on a snapshot count alone.

### Evidence Anchors

- `apps/api/src/common/auth/bootstrap-auth.guard.ts`
  - `canActivate()` short-circuits `@OpenRoute()` first.
  - When `policy` is null, the `!policy` branch still returns `true`.
- `apps/api/src/common/auth/auth.policy.ts`
  - Provides only a partial route classifier today; it is not a complete route
    inventory by itself.
- `apps/api/src/common/auth/auth.decorators.ts`
  - `OpenRoute`, `RequireScopes`, and `RequireRealms` are the live metadata
    seams that inventory/tests must reason about.
- `apps/api/src/modules/auth/auth.controller.ts`
  - Contains sensitive auth-entry surfaces including `/auth/token`,
    driver-device bootstrap, tenant bootstrap, and partner bootstrap.
- `apps/api/src/modules/identity/identity.controller.ts`
  - Keeps `GET /api/identity/context` public via `@OpenRoute()`.
- `apps/api/src/modules/multi-taxi/multi-taxi.controller.ts`
  - Contains several passenger access-token routes marked `@OpenRoute()`.
- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
  - Contains multiple public/bootstrap-style routes that must stay explicitly
    inventoried and bounded.
- `apps/api/src/modules/driver-sos/driver-sos.controller.ts`
  - Declares both `DriverSosController` and `OpsDriverSosController` in a
    single file, which is why raw controller-file and controller-class counts
    differ.

### Acceptance Gaps To Close

| Gap | Current Baseline | Acceptance Target |
| --- | --- | --- |
| G1 | `docs/02-architecture/auth-route-inventory.md` missing | Human-readable route inventory exists and matches code/tests |
| G2 | `BootstrapAuthGuard` allows unmatched/no-policy routes through the `!policy` branch | Unknown or conflicting routes return deny-by-default at runtime |
| G3 | No proof yet that all controller routes are classified | CI fails when any new route is unclassified |
| G4 | Public routes are distributed across auth, identity, multi-taxi, and tenant-partner surfaces | Every open route has explicit inventory, throttle, and data-exposure coverage |

## 4. Dependency Map

### Upstream Machine-Truth Dependencies

- None. `IAM-P0-003.depends_on` is empty in machine truth.

### Direct Code Dependencies

- `apps/api/src/common/auth/bootstrap-auth.guard.ts`
  - Global runtime admission point. The parent task must change the unmatched
    route behavior here or in an equivalent guard-adjacent seam.
- `apps/api/src/common/auth/auth.policy.ts`
  - Current route-policy classifier. Parent work may expand or replace this,
    but reviewer should require an exhaustive classification source.
- `apps/api/src/common/auth/auth.decorators.ts`
  - Metadata contract for `OpenRoute`, `RequireScopes`, and `RequireRealms`.
- `apps/api/src/common/auth/auth.matrix.ts`
  - Realm/path expectations that constrain which bearer paths are meant to stay
    public versus authenticated.
- `apps/api/src/modules/**/*.controller.ts`
  - Inventory source surface. The classification test must scan controllers, not
    just trust a hand-maintained list.
- `apps/api/tests/unit/auth-bootstrap.test.ts`
  - Existing auth-guard regression surface and the most natural home for
    fail-closed/unmatched-route assertions unless parent work adds a dedicated
    inventory test file.

### Cross-Task Semantic Dependencies

- `IAM-P0-002`
  - `/auth/token` is part of the protected auth-entry surface. Route
    classification and verified private exchange rules must stay aligned.
- `IAM-RBAC-001`
  - If the repo moves toward a generated policy catalog, `IAM-P0-003` should
    not create a second incompatible source of route truth.
- `IAM-UAT-001`
  - Owns the independent release-blocking negative matrix, including route
    classification failures.
- `IAM-REL-001`
  - Consumes the route-classification gate during reviewed integration and
    release validation.

### Reviewer Interpretation Rule

`auth.policy.ts` alone should not be treated as the only valid implementation
shape. Acceptance is satisfied only when the parent branch proves every route is
classified and unknown/conflicting routes fail closed, whether the final source
of truth is generated inventory, decorator scan, policy table, or a controlled
combination of them.

## 5. Parent Acceptance Checklist

### AC-1 Every API Route Is Classified

- [ ] Inventory covers every controller method under `apps/api/src/modules`.
- [ ] Each route resolves to exactly one classification outcome:
  authenticated route, explicit open route, or explicitly blocked/unsupported.
- [ ] Public routes are not implied solely by missing policy metadata.
- [ ] `docs/02-architecture/auth-route-inventory.md` exists and matches the
  runtime/test classification source.

### AC-2 Unknown Route Fails Closed

- [ ] A request that matches no route classification is denied at runtime.
- [ ] Conflicting metadata such as open-route plus protected-route semantics is
  rejected, not silently allowed.
- [ ] Guard logic no longer contains an unmatched-route success path equivalent
  to the current `!policy -> return true` behavior.

### AC-3 Adding An Unclassified Route Fails CI

- [ ] Parent branch adds a deterministic test that scans controller routes.
- [ ] The test fails when a new route is introduced without classification.
- [ ] The failure is local and CI-visible, not dependent on manual reviewer
  memory.

### AC-4 Open Routes Have Explicit Safety Coverage

- [ ] Every `@OpenRoute()` endpoint has an inventory entry with a reason for
  public exposure.
- [ ] Open routes carry throttle/rate-limit expectations where applicable.
- [ ] Tests prove public endpoints do not expose privileged data when no token
  is present.
- [ ] Token-present behavior on open routes stays bounded to documented
  identity/context semantics.

### AC-5 Focused Verification Passes

- [ ] `pnpm --filter @drts/api lint`
- [ ] `pnpm --filter @drts/api typecheck`
- [ ] `pnpm --filter @drts/api test -- --run tests/unit/auth-bootstrap.test.ts`
- [ ] Parent branch also runs the new route-inventory/classification test that
  enforces CI failure on unclassified routes.

## 6. Reviewer Hotspots

Reviewer `Codex2` should verify these points first:

1. The parent branch closes both missing pieces: inventory artifact plus
   fail-closed runtime behavior.
2. `/auth/token` remains protected and does not become public while
   `IAM-P0-002` is tightening verified private exchange.
3. Open-route handling is explicit for high-risk surfaces:
   `auth.controller.ts`, `identity.controller.ts`, `multi-taxi.controller.ts`,
   and `tenant-partner.controller.ts`.
4. Classification enforcement is automated from controller reality rather than
   a manually curated document only.
5. The parent branch does not create a policy source that will drift from
   `IAM-RBAC-001`'s generated-catalog direction.

## 7. Handoff Notes For Parent Owner / Reviewer

- Treat this packet as support material only; it does not change product truth.
- The current repo baseline should be described as not yet compliant with
  `IAM-P0-003`, chiefly because the inventory doc is missing and unmatched
  routes are not fail-closed.
- If parent implementation keeps some routes protected by controller metadata
  instead of `auth.policy.ts`, that is acceptable only if the inventory and CI
  scan prove the route is classified.
- Public route exceptions should stay narrowly scoped to documented bootstrap,
  callback, health, or access-token flows with explicit tests.

## 8. Evidence

- `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md`
- `docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md`
- `apps/api/src/common/auth/bootstrap-auth.guard.ts`
- `apps/api/src/common/auth/auth.policy.ts`
- `apps/api/src/common/auth/auth.decorators.ts`
- `apps/api/src/common/auth/auth.matrix.ts`
- `apps/api/src/modules/auth/auth.controller.ts`
- `apps/api/src/modules/identity/identity.controller.ts`
- `apps/api/src/modules/multi-taxi/multi-taxi.controller.ts`
- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
- `apps/api/tests/unit/auth-bootstrap.test.ts`

## 9. Verification Notes

- This sidecar performed repo inspection only. No runtime code, canonical truth,
  or control-plane state was modified beyond normal task-status updates.
- Raw baseline scan commands used for this packet:
  - `rg --files apps/api/src/modules -g '*controller.ts' | wc -l`
  - `rg -n '@Controller\\(' apps/api/src/modules | wc -l`
  - `rg -n '@OpenRoute\\(' apps/api/src/modules | wc -l`
  - `rg -n '@RequireScopes\\(' apps/api/src/modules | wc -l`
  - `rg -n '@RequireRealms\\(' apps/api/src/modules | wc -l`
- No lint/typecheck/test run was required for the sidecar itself because the
  task scope is support material only.
