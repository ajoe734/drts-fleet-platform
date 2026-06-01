# UI-FE-TEN-USR Planning Decision Unblock

## Scope

- Task: `UI-FE-TEN-USR-UNBLOCK-PLANNING-DECISION`
- Parent: `UI-FE-TEN-USR`
- Owner: `Codex`
- Reviewer: `Claude`
- Decision date: `2026-05-28`

## Diagnosis

`UI-FE-TEN-USR` was blocked by a planning mismatch between the Tenant Console
handoff packet and the current backend/contracts surface for `/users`.

The packet asked the page to ship:

1. `resend invitation`
2. `last login`
3. a `tc_integration_mgr`-style fifth assignable role alongside the current
   tenant role catalog

But the authoritative backend/contracts surface currently exposes:

- four assignable role codes only:
  `tenant_admin`, `tenant_ops_admin`, `tenant_finance_admin`,
  `tenant_viewer`
- mutate support for invite plus role/status update only
- user timestamps `invitedAt` and `updatedAt`, but no `lastLogin`

That left the parent without a clear answer on whether to invent UI-only
behavior, wait for new backend contracts, or scope the page to the current
authority surface.

## Canonical Sources Consulted

Higher-precedence first per `AI_COLLABORATION_GUIDE.md` §2:

1. `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
   §9.6.5
2. `packages/contracts/src/index.ts` (`TenantUserRoleRecord`,
   `CreateTenantUserCommand`, `UpdateTenantRoleCommand`,
   `TenantRoleCatalogRecord`)
3. `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
   tenant users / roles endpoints
4. `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`
   current tenant role catalog
5. `support/sidecars/XS-UI-002/backend-gap-inventory.md` (`TU-1` / `TU-3`)
6. `support/sidecars/XS-UI-003/command-action-matrix.md` (`/users` command map)
7. `docs/05-ui/tenant-console-design-handoff-packet-20260525.md` §2, §5.7

## Decision

`UI-FE-TEN-USR` is unblocked by **scoping the page to the current canonical
backend/contracts surface**. No new tenant-user contract is minted in this
helper.

Concretely:

1. `/users` must consume the backend role catalog exactly as returned by
   `GET /api/tenant/roles`. The current canonical set is the four
   `tenant_*` role codes above.
2. The packet's persona labels remain IA labels, not authoritative role codes.
   `Tenant Integration Manager` does **not** create a fifth assignable role for
   this task.
3. The selected-shell page must support invite plus role/status update only.
   `resend invitation` is out of scope until a backend command exists.
4. The list contract for this wave is `userId`, `displayName`, `email`,
   `roleCode`, `status`, `invitedAt`, and `updatedAt`. `last login` is scope
   cut for this parent because no canonical field exists today.
5. Suspend/reactivate stays an overloaded status update on
   `POST /api/tenant/users/:userId/role`; the UI must not invent a dedicated
   suspend endpoint or a required-reason field.

## What Changed In Canonical Planning

`docs/05-ui/tenant-console-design-handoff-packet-20260525.md` is updated so
the `/users` brief matches the current authority surface instead of asking the
parent to resolve product drift during implementation.

## Explicit Follow-Up Still Needed

- If product later wants a dedicated integration-manager assignable role, that
  needs a backend/auth/contracts follow-up, not a UI-local reinterpretation.
- If product later wants `resend invitation` or `last login`, that also needs a
  backend/contracts follow-up before selected-shell UI claims parity.

Those are not blockers for `UI-FE-TEN-USR`.

## Parent Unblocked Next Step

`UI-FE-TEN-USR` should now rebuild `/users` against the current contracts:

1. render the roster from `listTenantUsers()`
2. render assignable roles from `listTenantRoles()`
3. wire invite through `createTenantUser()`
4. wire role/status changes through `updateTenantRole()`
5. omit `resend invitation` and `last login`
6. keep labels/actions driven by backend role catalog and authority surface,
   not by packet-only `tc_*` shorthand

## Verification Basis

- Product rule: only tenant admin can operate and role catalog comes from
  backend spec §9.6.5
- Contract surface: `packages/contracts/src/index.ts`
- Endpoint surface: `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`
- Role catalog reality: `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`
- Existing gap inventory and command matrix:
  `support/sidecars/XS-UI-002/backend-gap-inventory.md`,
  `support/sidecars/XS-UI-003/command-action-matrix.md`

## Review And Closeout Evidence

- Reviewer `Claude2` approved this decision on `2026-05-28T09:33:42Z`,
  confirming alignment with spec §9.6.5, the four `tenant_*` role contracts,
  and the existing `TU-1` / `TU-3` gap inventory.
- Owner closeout keeps the parent next step explicit: `UI-FE-TEN-USR` should
  resume against `listTenantUsers()`, `listTenantRoles()`, `createTenantUser()`,
  and `updateTenantRole()`.
- The remaining workspace package-resolution issue mentioned on the parent is
  independent of this planning decision and does not reopen the `/users`
  product/contract scope resolved here.
