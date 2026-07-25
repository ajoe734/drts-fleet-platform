# SD-DP-20260725-008 Control-Plane Proxy Scope Parity

## Decision Record

- `decision_id`: `SD-DP-20260725-008`
- `title`: `The control-plane proxy mints the full API scope preset for its actor type, including dual-control approve rights`
- `owner`: `Claude2 / S3-FIX-PLATFORM-ADMIN-SANDBOX-SCOPE-001`
- `date`: `2026-07-25`
- `status`: `accepted-for-execution`
- `affected_docs`:
  - `docs/01-decisions/SD-DP-20260429-001-plane-separation-auth-matrix.md`
  - `docs/03-runbooks/auth-plane-separation-matrix.md`
- `superseding_decision`:
  - `CONTROL_PLANE_SCOPE_PRESETS` in `packages/control-plane-auth/src/index.ts` is a
    mirror of `AUTH_SCOPE_PRESETS` in `apps/api/src/common/auth/auth.constants.ts`,
    not a second, independent authorization boundary
  - the proxy-minted `platform_admin` identity therefore carries all 12
    `sandbox.*` scopes, including `sandbox.evidence.export.approve` and
    `sandbox.legal_hold.release.approve`
  - separation of duties for those two flows stays enforced on `actorId`, where
    it is already implemented — not by withholding the scope
- `scope`:
  - `packages/control-plane-auth/src/index.ts`
  - `apps/platform-admin-web` sandbox compliance / investigation / evidence /
    legal-hold / regulatory-report surfaces
  - `apps/api/tests/unit/platform-admin-sandbox-scope.test.ts`
- `out_of_scope`:
  - changing which scopes `AUTH_SCOPE_PRESETS.platform_admin` grants
  - changing the `ops_user` proxy preset (S3-FIX-OPS-SOS-BOARD-SCOPE-001)
  - introducing a per-user or per-role scope model for control-plane callers
- `implementation_implications`:
  - any scope added to `AUTH_SCOPE_PRESETS.ops_user` / `.platform_admin` must be
    mirrored into `CONTROL_PLANE_SCOPE_PRESETS` in the same change
  - a dual-control flow may not rely on scope partitioning to keep maker and
    checker apart; it must compare actor identity
- `completion_bar`:
  - the proxy preset and the API preset are pinned to exact two-way parity by test
  - every `sandbox.*`-guarded platform-admin route admits the proxy-minted
    identity with no `reject_authorization` audit row

## Problem

`apps/platform-admin-web` reaches the API through `/control-plane-proxy`. The proxy
mints the caller identity with `issueControlPlaneRequestAuth()` and forwards it as an
explicit `x-scopes` header (or a `scopes` JWT claim). The API's `deriveScopes()`
honours explicit scopes verbatim, so for a browser request the proxy preset
**replaces** `AUTH_SCOPE_PRESETS` rather than supplementing it.

`CONTROL_PLANE_SCOPE_PRESETS.platform_admin` was missing all 12 `sandbox.*` scopes
that `AUTH_SCOPE_PRESETS.platform_admin` grants. Every platform-admin sandbox
surface — compliance dashboard, trip compliance detail, investigations list /
detail / timeline, evidence manifests, controlled exports, legal holds, regulatory
reports — returned `403 AUTH_SCOPE_DENIED` from the browser and wrote a
`reject_authorization` audit row, while every server-side test stayed green because
they all assert `AUTH_SCOPE_PRESETS` directly. This is the same failure shape as the
Ops `/sos/board` denial fixed in S3-FIX-OPS-SOS-BOARD-SCOPE-001.

## Options considered

1. **Grant all 12, matching the API preset.** (chosen)
2. **Grant only the 10 non-approve scopes**, withholding
   `sandbox.evidence.export.approve` and `sandbox.legal_hold.release.approve` so the
   proxy cannot mint an identity that both requests and approves a controlled export
   or a legal-hold release.
3. **Move the sandbox surfaces off the proxy** onto a separately authenticated path.

## Rationale for option 1

- **The proxy is an identity-minting layer, not a policy layer.** The single
  authorization boundary for an actor type is `AUTH_SCOPE_PRESETS`. A second,
  quietly weaker boundary inside the proxy is precisely the defect being fixed;
  option 2 would keep that split and guarantee the next drift.
- **Option 2 does not add a control.** Separation of duties for both flows is
  already enforced in `apps/api/src/modules/platform-admin/platform-admin-compliance.service.ts`,
  which compares the requesting and approving `actorId` and raises
  `SANDBOX_EXPORT_SELF_APPROVAL_FORBIDDEN` /
  `SANDBOX_LEGAL_HOLD_SELF_APPROVAL_FORBIDDEN`
  (pinned by `apps/api/tests/integration/e2e-p2-sandbox-compliance-controls.test.ts`).
  Withholding the scope would not stop a self-approval that the service already
  refuses; it would only make the approve step unreachable from the browser, which
  is where the approver works — turning a working two-person control into a dead
  end.
- **The approver set is not widened.** The proxy derives `actorId` from the
  IAP-authenticated email (`extractAuthenticatedUserEmail` →
  `resolvePlatformAdminIdentity`), so two humans mint two actor ids and
  maker-checker holds end to end. Whoever could already reach the platform-admin
  console under IAP is the same set of people; option 1 changes what the console can
  do, not who can open it.
- **The no-IAP deployment fails closed.** Without an IAP header every caller
  collapses onto `CONTROL_PLANE_DEFAULT_EMAILS.platform_admin` and thus one actor id,
  so requester and approver are identical and the self-approval guard blocks the
  approval. Granting the scope cannot open a self-approval hole in either
  deployment.
- **Blast radius is confined to the platform-admin console.** Of the five
  `/control-plane-proxy` routes in the repo, only `apps/platform-admin-web` mints
  `platform_admin`; `ops-console-web` and `roc-console-web` mint `ops_user`, and the
  fleet / channel partner portals mint `partner_api_key`.
- Option 3 was rejected as disproportionate: it would fork the control-plane auth
  posture set by `SD-DP-20260429-001` for one feature area.

## Standing rule

`CONTROL_PLANE_SCOPE_PRESETS` must stay in exact two-way parity with the
corresponding `AUTH_SCOPE_PRESETS` entry — no under-grant (the browser 403s) and no
over-grant (the proxy invents authority the API never gave). Parity is pinned by
`apps/api/tests/unit/platform-admin-sandbox-scope.test.ts`, which also asserts that
every `sandbox.*` scope demanded by a platform-admin route is actually minted, so a
future scope added to a controller cannot regress silently.

A dual-control flow must never depend on scope partitioning to keep maker and
checker apart. Scopes say what a surface can attempt; identity comparison decides
whether a specific actor may complete it.
