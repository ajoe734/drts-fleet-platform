# SR-MAIL-DELIVERY-READBACK-20261001

Owner: Claude. Reviewer: Claude2. Candidate identity, independent review and
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
