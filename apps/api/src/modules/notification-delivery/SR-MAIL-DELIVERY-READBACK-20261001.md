# SR-MAIL-DELIVERY-READBACK-20261001

Owner: Claude. Reviewer: Codex. Candidate identity, independent review and
hosted CI remain governed by the task lifecycle; this artifact does not close
the task.

## What changed

- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`:
  `getMailDeliveryReceipt(tenantId, deliveryId, requestId?, identity?)` — a
  new read-only lookup backed by the existing
  `NotificationDeliveryService.get(tenantId, deliveryId)`. Enforces the new
  `mail_delivery` evidence-governance family via `assertEvidenceAccess`
  (same pattern as `listWebhookDeliveries`), audits every read via
  `recordTenantAudit`, and masks the provider acknowledgement response with
  `maskOpaqueToken` before it leaves the service. `NotificationDeliveryService`
  is now an optional constructor dependency on `TenantPartnerService`.
- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`:
  `GET tenant/mail-deliveries/:deliveryId` (`@RequireRealms("tenant",
  "platform", "ops")`), 404 `MAIL_DELIVERY_NOT_FOUND` when the service
  returns null (unknown id, or a known id under the wrong tenant).
- `apps/api/src/common/evidence-governance.ts`: new `mail_delivery`
  `EvidenceRetentionPolicyRecord`, modeled on the existing `webhook_delivery`
  family — tenant realm requires `tenant:read` and tenant-scoped access;
  platform/ops/system are unrestricted (cross-tenant).
- `packages/contracts/src/index.ts`: `"mail_delivery"` added to
  `EVIDENCE_RETENTION_FAMILIES`; new `MailDeliveryReceiptView` /
  `MailDeliveryAttemptView` / `MailDeliveryProviderAcknowledgementView`
  types; `deliveryId: string | null` added to `CanonicalIdentityInvitationRecord`
  and `TenantInvitationView`.
- `apps/api/src/modules/tenant-partner/tenant-invitation-delivery.service.ts`:
  `TenantInvitationDeliveryRecord` gained `queryable: boolean` — true only
  for the real `NotificationDeliveryService` id (the success path); false for
  the synthetic `unavailable-`/`error-` sentinel ids, which never resolve to
  a stored record.
- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`
  `issueTenantInvitation`: persists `deliveryId` on the canonical invitation
  record (`delivery.queryable ? delivery.deliveryId : null`); create, resend
  and revoke all return it via `toTenantInvitationView`. The audit-log
  approval path already carried `recipients[].deliveryId`
  (`audit-notification.service.ts`) — unchanged, confirmed by existing
  coverage.
- `apps/api/src/modules/identity/identity.repository.ts`: fixed a field
  whitelist bug in `upsertFallbackInvitation` (the in-memory, no-DB fallback
  merge path) that silently dropped `deliveryId` on the second upsert of an
  existing invitation — found by the new integration test, not spec'd
  up front. The DB-backed `upsertInvitation` path was already correct (it
  persists the full `record` as jsonb, no column whitelist).
- `apps/api/src/modules/notification-delivery/remote-smtp-mail.transport.ts`:
  extracted the provider-message-id regex matching into a standalone
  exported pure function `extractProviderMessageId(response, isSafe)`, and
  added a second pattern for Gmail's SMTP relay final reply (`"250 2.0.0 OK
  <epoch> <id> - gsmtp"`, which carries no `"queued as"` token). The existing
  `"queued as <id>"` pattern is tried first and still works unchanged. An
  unrecognized format keeps `providerMessageId` null.
- `tests/unit/system-remediation/sr-qa-reports-001/c099-evidence-governance-controlled-export.test.ts`:
  updated the hardcoded evidence-family count (12 → 13) and family-list
  assertion for the new `mail_delivery` family.

## Required-acceptance mapping

| Required acceptance | Source / change | Evidence |
| --- | --- | --- |
| 可依寄送ID查回狀態與每次嘗試的服務商回執 | `TenantPartnerService.getMailDeliveryReceipt` + `GET tenant/mail-deliveries/:deliveryId` | `tests/unit/system-remediation/sr-mail-delivery-readback-20261001/mail-delivery-readback.test.ts` — "records a queryable deliveryId ... resolves it to a sent receipt" |
| 邀請與簽核都能從業務紀錄取得寄送ID | `issueTenantInvitation` persists `deliveryId`; `toTenantInvitationView` returns it on create/resend/revoke. Approval audit log already had `recipients[].deliveryId` (unchanged, pre-existing). | `mail-delivery-readback.test.ts` — "carries the deliveryId through resend and revoke responses" |
| Gmail回應可擷取服務商訊息ID | `extractProviderMessageId` in `remote-smtp-mail.transport.ts`: `GSMTP_OK_PATTERN` added alongside the existing `QUEUED_AS_PATTERN` | `tests/unit/system-remediation/sr-mail-delivery-readback-20261001/remote-smtp-provider-message-id.test.ts` (7 cases: queued-as, gsmtp, single-space variant, unrecognized → null, empty → null, credential-echo rejected → null, queued-as preferred when both patterns could match) |
| 權限與遮罩經測試 | `mail_delivery` evidence-governance family (tenant:read, tenant-scoped; platform/ops/system unrestricted); `maskOpaqueToken` on the acknowledgement response | `mail-delivery-readback.test.ts` — same-tenant read, cross-tenant denial (403 `EVIDENCE_ACCESS_FORBIDDEN`), missing-scope denial, platform/ops cross-tenant allow, masked-response assertion (raw response never equals the masked one, body/token/credential never present) |
| 同候選SHA CI通過且獨立reviewer審查 | Candidate lifecycle (handoff → CI → review) | Pending — this artifact is not the candidate lock; see handoff for `CANDIDATE_SHA`/`CANDIDATE_BRANCH` |

## Explicitly out of scope / not claimed

- No local server, Docker, or SMTP/TLS listener was started (VM restriction).
  The Gmail/queued-as extraction is tested by calling the exported pure
  function directly — no transport instantiation, no nodemailer mock needed.
  (An earlier attempt to mock the `nodemailer` module directly surfaced a
  real pnpm-workspace resolution-path divergence between `apps/api`'s own
  `node_modules/nodemailer` symlink and the repo root's resolution context,
  which made `vi.mock("nodemailer", ...)` silently not intercept the import
  used by `remote-smtp-mail.transport.ts`; the pure-function extraction
  avoids depending on that mock path entirely rather than working around it.)
- No live Gmail SMTP send was performed; the Gmail reply format is a fixed
  string fixture matching the format given in the task brief
  (`250 2.0.0 OK  <epoch> <id> - gsmtp`), not a captured real response.
- Hosted CI, independent reviewer pass, PostgreSQL integration, and shared-dev
  deployment all remain pending; this artifact does not assert they passed.

## Checks run and read (this worktree, 2026-10-01)

- PASS, exit 0 — `@drts/contracts` build (`pnpm --filter @drts/contracts build`)
  and `@drts/control-plane-auth` build (required once to unblock the API
  typecheck; both packages resolve types from `src` directly for tests via
  `vitest.config.ts` aliases, so this was only needed for `tsc`).
- PASS, exit 0 — `pnpm --filter @drts/api typecheck` (`tsc -p tsconfig.json --noEmit`).
- PASS, exit 0 — `pnpm --filter @drts/contracts typecheck`.
- PASS, exit 0 — scoped ESLint (`--max-warnings=0`) on every changed source
  file plus the new test directory.
- PASS — Prettier check on every changed file (format-only fixes applied;
  see note below on an environment node_modules issue this surfaced).
- PASS, exit 0 — `git diff --check` (no whitespace errors).
- PASS, exit 0, 7/7 — `remote-smtp-provider-message-id.test.ts` (pure
  `extractProviderMessageId` coverage, both formats + edge cases).
- PASS, exit 0, 7/7 — `mail-delivery-readback.test.ts` (permission, masking,
  deliveryId propagation, not-found).
- PASS, exit 0, 184/184 across 19 files — root `tests/unit` regression scope:
  the two new files above, `tenant-invitation-lifecycle.test.ts`,
  `sr-mail-001`, `sr-mail-002`, `sr-notify-001`,
  `notification-delivery/{bootstrap,deploy-dev-smtp}.test.ts`,
  `sr-credential-expiry-20260913/postgres-mail-outbox.test.ts`,
  `identity-canonical-repository.test.ts`, `iam-min-accses-001.test.ts`,
  `tenant-partner-foundation.test.ts`, `security-events.test.ts`,
  `multi-tenant-header-routing.test.ts`.
- PASS, exit 0, 28 passed / 15 skipped — `notification-delivery/remote-smtp-mail.transport.test.ts`
  filtered to the same non-listener test-name subset the prior owner (Codex)
  used in `SR-MAIL-REMOTE-SMTP-TRANSPORT-20260930.md` (this VM must not open
  a local SMTP/TLS listener); the live-listener-dependent cases remain
  deferred to hosted CI exactly as before.
- PASS, exit 0, 100/100 across 6 files — `apps/api`-scoped regression (must
  be run via `pnpm --filter @drts/api exec vitest run <path>`, **not** from
  the repo root: the root `vitest.config.ts`'s `include` globs only cover
  the top-level `tests/` directory, so `apps/api/tests/unit/*.test.ts` is
  silently excluded — zero tests contributed, no error — when mixed into a
  root-level multi-path `vitest run` invocation alongside root-relative
  paths; this is a pre-existing config gap, not something this change
  introduced, but it is easy to be misled by a "N passed" summary that
  silently dropped one of the requested files):
  `tenant-partner.repository.test.ts`, `tenant-partner.controller.test.ts`,
  `tenant-partner.service.test.ts`, `tenant-approval-notification.test.ts`,
  `audit-notification.service.test.ts`, `evidence-governance.test.ts`.
- PASS, exit 0 — `c099-evidence-governance-controlled-export.test.ts` and
  `evidence-governance.test.ts` after updating the hardcoded family count.

### Local node_modules repair (environment-only, not part of the diff)

This worktree's `node_modules` (a symlink shared with the canonical root)
contained ~50 dangling symlinks left over from a since-reaped sibling
worktree (`gemini-sr-live-map-c114-identity-remediation-r2-20261001`), which
made `tsc`/`vitest` fail with spurious `Cannot find module '@nestjs/common'`
/ `'zod'` / `'@types/node'` etc. errors unrelated to this change. Repaired by
repointing each dangling symlink at the equivalent package already present
in the canonical root's own `.pnpm` store (same resolved version in every
case); no `pnpm install`, lockfile change, or dependency version change was
made. `node_modules` is gitignored and not part of this diff.

## Not verified / remaining limits

- No real Gmail SMTP send or hosted PostgreSQL run; `NotificationDeliveryService`
  is exercised through the real `FileMailOutbox` (temp-dir) + a controlled
  injected transport, consistent with the existing `sr-mail-001` test
  convention.
- Reviewer should re-check the `mail_delivery` evidence-governance scope
  choice (`tenant:read`, reused from the existing `eligibility_verification`
  family) against whether a dedicated `tenant:mail:read` scope is preferred
  instead.

## Round 2 remediation (candidate `990c6e472`, reviewer Codex, PR #2260 REJECT)

Codex's independent read-only review rejected the round-1 candidate with two
findings. Both are fixed on top of the same files; round-1 content above is
left as-is per §0.7 (no "all fixed" overwrite of the prior record).

### R1 [P1] — ops_user got a real 403 on the new HTTP route, fixed

- Root cause: `resolveRouteAuthPolicy` (`apps/api/src/common/auth/auth.policy.ts`)
  had no dedicated branch for `tenant/mail-deliveries`, so it fell through to
  the generic `tenant/*` fallback, which requires `tenant:read` for every
  realm including `ops`. `@RequireRealms("tenant","platform","ops")` on the
  controller only *adds* allowed realms via `AUTH_ALLOWED_REALMS_KEY` — it
  does not touch the scope requirement — so `BootstrapAuthGuard` still
  demanded `tenant:read`, which the real `ops_user` IAM preset
  (`packages/contracts/src/iam-policy-catalog.ts`) does not grant.
- Fix: added a dedicated branch in `auth.policy.ts`
  (`routePath.startsWith("tenant/mail-deliveries")`) requiring `audit:read`
  instead of `tenant:read`. `audit:read` is held by `platform_admin`,
  `tenant_admin`, and `ops_user` alike (confirmed directly in
  `iam-policy-catalog.ts`), matching the existing `identity:read` pattern
  used for the `identity/*` routes. The tenant-vs-cross-tenant boundary
  stays enforced where it already was: the `mail_delivery`
  evidence-governance access rule in
  `apps/api/src/common/evidence-governance.ts` (unchanged), which already
  correctly left `platform_admin`/`ops_user` unrestricted and only gated
  `tenant_admin` on `tenant:read` + tenant-scoping. No other `tenant/*`
  route's policy was loosened.
- New coverage: `apps/api/tests/unit/mail-delivery-route-authorization.test.ts`
  — calls the real `BootstrapAuthGuard.canActivate` with a real `Reflector`
  reading the actual `@RequireRealms` metadata off
  `TenantPartnerController.prototype.getMailDelivery`, and real IAM scope
  presets (no `x-scopes` header, so each actor type's default preset is
  what's checked). Cases: `ops_user` allow, `tenant_admin` allow,
  `platform_admin` allow, tenant identity with an unrelated scope only →
  403 `AUTH_SCOPE_DENIED`, `partner_api_key` → 403 `AUTH_REALM_DENIED`,
  no headers/no bearer → 401 `AUTH_REQUIRED`. This file lives under
  `apps/api/tests/unit/` (not the root `tests/unit/`) because `@nestjs/core`
  only resolves inside the `apps/api` package boundary from this workspace's
  pnpm layout — importing it from a root-level test file fails with
  `Cannot find package '@nestjs/core'` (confirmed by trying it there first).
  Also added `apps/api/tests/unit/tenant-partner.controller.test.ts` — "returns
  404 MAIL_DELIVERY_NOT_FOUND for an unknown mail delivery id" (controller
  handler path, same-tenant, no notificationDeliveryService wired so the
  service returns null — exercises the controller's own 404 mapping, not the
  guard). Cross-tenant denial and missing-scope denial for `tenant_admin` at
  the service layer were already covered by the round-1
  `mail-delivery-readback.test.ts` cases and still pass unchanged.

### R2 [P2] — enqueue-succeeded invitations losing their real deliveryId on a later persist failure, fixed

- Root cause: `TenantInvitationDeliveryService.deliver()`
  (`apps/api/src/modules/tenant-partner/tenant-invitation-delivery.service.ts`)
  wrapped `enqueue()` and `dispatch()` in one `try/catch`. If `enqueue()`
  succeeded (a real, durable, queryable outbox row now exists) but something
  after it threw — e.g. `dispatch()`'s post-send ack-persistence transaction —
  the single `catch` always returned a synthetic `error-<idempotencyKey>` id
  with `queryable: false`, discarding the real id. `tenant-partner.service.ts`
  then persisted `invitation.deliveryId = null` for a delivery that actually
  exists and is queryable.
- Fix: split the one `try/catch` into two. The first wraps only `enqueue()`;
  if that throws, nothing was ever durably created, so the synthetic
  `error-`/`queryable: false` result is still correct and unchanged. The
  second wraps the post-enqueue dispatch step; on failure there, the real
  `queued.deliveryId` is returned with `queryable: true`, `status` and
  `sentAt` taken verbatim from the last state `enqueue()` actually committed
  (never a guessed `"sent"` or fabricated provider acknowledgement —
  `providerMessageId: null`), and the real safe error code from the dispatch
  exception. `issueTenantInvitation`/resend/revoke in `tenant-partner.service.ts`
  were not touched; they already persist whatever `queryable` says, so this
  fix alone restores a resolvable `deliveryId` on the invitation record for
  this failure path.
- New coverage:
  `tests/unit/system-remediation/sr-mail-delivery-readback-20261001/mail-delivery-readback.test.ts`
  — "keeps the real, queryable deliveryId when enqueue succeeds but the
  ack-persistence transaction after dispatch throws". Reproduces the
  reviewer's exact repro shape: a real `FileMailOutbox` (temp dir) wrapped by
  a `MailOutbox` that forwards every `transaction()` call to the real outbox
  except the 3rd (enqueue = #1, dispatch's claim = #2, dispatch's
  post-send ack-persistence = #3), which throws once. Asserts: the returned
  `TenantInvitationDeliveryRecord.deliveryId` is a real UUID (not
  `error-*`), `queryable: true`, `status` is not `"sent"`,
  `providerMessageId` is `null`; then calls the real
  `TenantPartnerService.getMailDeliveryReceipt` (the actual readback path
  added in round 1, same `notificationDeliveryService` instance) with that
  id and asserts it resolves to `status: "queued"` with one attempt whose
  `outcome` is `"started"` — i.e. the real outbox state, not a fabrication.

### Checks run and read (this round, 2026-10-01)

- PASS, exit 0 — `pnpm --filter @drts/contracts build` and
  `pnpm --filter @drts/control-plane-auth build` (both needed again to clear
  stale/missing dist output before `tsc`; same pre-existing environment gap
  noted in round 1, not part of this diff).
- PASS, exit 0 — `pnpm --filter @drts/api typecheck`.
- PASS, exit 0 — scoped ESLint (`--max-warnings=0`) on every file touched
  this round: `auth.policy.ts`, `tenant-invitation-delivery.service.ts`,
  `tenant-partner.controller.test.ts`,
  `apps/api/tests/unit/mail-delivery-route-authorization.test.ts`,
  `tests/unit/system-remediation/sr-mail-delivery-readback-20261001/mail-delivery-readback.test.ts`.
- PASS — Prettier `--check` on the same file set.
- PASS, exit 0 — `git diff --check`.
- PASS, exit 0, 100/100 across 6 files —
  `pnpm --filter @drts/api exec vitest run` on
  `mail-delivery-route-authorization.test.ts`,
  `tenant-partner.controller.test.ts`, `tenant-partner.service.test.ts`,
  `tenant-approval-notification.test.ts`, `audit-notification.service.test.ts`,
  `evidence-governance.test.ts` (must run via the `@drts/api` filter, not the
  repo root — same pre-existing root-`vitest.config.ts` `include`-glob gap
  noted in round 1).
- PASS, exit 0, 151/151 across 13 files — root `tests/unit`/`tests/security`
  regression scope: the two `sr-mail-delivery-readback-20261001` files,
  `tenant-invitation-lifecycle.test.ts`, `c099-evidence-governance-controlled-export.test.ts`,
  `sr-mail-001`, `sr-mail-002`, `sr-notify-001`, `notification-delivery/*`,
  `sr-credential-expiry-20260913/postgres-mail-outbox.test.ts`,
  `identity-canonical-repository.test.ts`, `iam-min-accses-001.test.ts`,
  `tenant-partner-foundation.test.ts`, `security-events.test.ts`,
  `multi-tenant-header-routing.test.ts`.
- PASS, exit 0, 32/32 — `tests/security/iam-route-inventory.test.ts`,
  `tests/security/iam-route-map-negative.test.ts`,
  `tests/security/iam-driver-authz-enforcement.test.ts` (these enumerate/
  exercise `resolveRouteAuthPolicy` across the whole route table; run to
  check the new `tenant/mail-deliveries` branch didn't regress any other
  route's classification).
- PASS, exit 0, 121/121 across 5 files —
  `pnpm --filter @drts/api exec vitest run` on `auth-bootstrap.test.ts`,
  `driver-sos-incident.test.ts`, `owned-mobility-task-events.test.ts`,
  `multi-taxi-controlled-export.test.ts`, `ops-driver-tasks-scope.test.ts`
  (other callers of `resolveRouteAuthPolicy`/route-policy-dependent
  controllers, checked for collateral impact from the `auth.policy.ts`
  change).
- No server, Docker, SMTP/TLS listener, or browser was started this round
  (VM restriction).

### Not verified / remaining limits (round 2)

- Hosted CI for this round's new candidate SHA has not run yet; this
  artifact does not assert it passed. A new candidate handoff is required
  after this commit.
- Independent reviewer re-check of this round's fixes is pending (same
  Owner/Reviewer split as round 1: Claude owns, Codex reviews).
