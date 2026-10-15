# UAT Report: APPROVAL-MAIL-DURABLE-DELIVERY-READBACK-20261015

- **Task ID**: `APPROVAL-MAIL-DURABLE-DELIVERY-READBACK-20261015`
- **Owner**: `Claude2`
- **Reviewer**: `Claude`
- **Branch**: `claude2/approval-mail-durable-delivery-readback-20261015`
- **Base (`origin/dev`)**: `409bad360e89ec4e8e6e48c337f42295e15210d8` (HEAD at dispatch time)
- **Implementation Commit SHA**: `1437456877e7ba645e3e7d1348145dcedb118518`
- **Task Spec Ref**: `/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T1531-original-booking-mail-host-root/APPROVAL-MAIL-DURABLE-DELIVERY-READBACK-20261015-R1.task-spec.json`

---

## 1. Finding-to-Verification Mapping (`AI_COLLABORATION_GUIDE.md` §0.7)

| Finding / Acceptance Key                                     | Root Cause & Pre-Repair Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Code Location Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Verification Test & Assertion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`approval_mail_durable_delivery_identity_preserved`**      | `AuditNotificationEmailAdapter.deliver()` (C026) wrapped `enqueue()` _and_ `dispatch()` in a single `try`/`catch`. Once `enqueue()` durably committed a real `deliveryId`/`messageId` to the outbox, any later exception thrown by `dispatch()` — a claim-storage rejection before the provider call, or an ACK-persistence rejection after the provider call — fell into the same `catch` as a genuine enqueue failure. That branch discarded the real, already-durable `deliveryId` and fabricated a synthetic, non-queryable `error-<idempotencyKey>` id with status `"failed"`, even though the outbox already held a real row. | `apps/api/src/modules/audit-notification/audit-notification.email-adapter.ts` (`deliver()` split into two `try`/`catch` blocks: one around `enqueue()`, one around the `dispatch()` call)                                                                                                                                                                                                                                                                                    | `tests/unit/system-remediation/sr-mail-002/audit-notification-email-adapter.test.ts` — `"preserves the real deliveryId when claim-storage rejects after a successful enqueue, before any provider call"` and `"preserves the real deliveryId and never fabricates sent/failed when ack-persistence rejects after a real provider accept"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **`approval_mail_actual_producer_receipt_recovery`**         | Same defect: a dispatch-phase exception could neither preserve nor expose the real receipt state (`queued`/attempt history) that the outbox already durably held, so there was no honest "last-known" value to recover from.                                                                                                                                                                                                                                                                                                                                                                                                        | Same file — the `dispatch()` catch now returns `queued.deliveryId` / `queued.messageId` / `queued.status` / `queued.sentAt` (the receipt enqueue already committed) with a bounded `errorCode` from the dispatch exception, instead of a guessed outcome.                                                                                                                                                                                                                    | Same two tests above assert `record.deliveryId` matches the real UUID pattern, is retrievable via `NotificationDeliveryService.get()`, and resolves to the genuinely stored attempt history (`attempts: []` for claim rejection; one `"started"` attempt with no acknowledgement for ACK-persistence rejection). `tests/unit/approval-mail-durable-delivery-readback-20261015/approval-mail-durable-delivery-readback.test.ts` additionally exercises the full `AuditNotificationEmailAdapter` → `AuditNotificationService.dispatchApprovalNotification` (per-recipient audit) → `TenantPartnerService.getMailDeliveryReceipt` (existing authorized mail-delivery readback endpoint, SR-MAIL-DELIVERY-READBACK-20261001) chain and confirms the audited `deliveryId` resolves through that production readback path to the real, queryable receipt. |
| **`approval_mail_original_status_dedupe_scope_regressions`** | N/A — regression guard.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | No behavioral change to: the five bilingual templates, tenant/recipient/opt-out policy, in-app vs. email status separation, accepted-send / permanent-failure / unavailable / invalid-address handling, bounded error codes, same-key dedupe (an already-`"sent"` receipt is still never re-dispatched), or C006 tenant-invitation delivery (untouched; `TenantInvitationDeliveryService` already carried the equivalent fix and is reused here as the established pattern). | `apps/api/src/modules/audit-notification/audit-notification.email-adapter.ts`; no other `write_scopes` file's production behavior changed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Full pre-existing `tests/unit/system-remediation/sr-mail-002/audit-notification-email-adapter.test.ts` (12 tests, including the 5 per-template delivery cases, idempotent-retry, tenant-scoping, unconfigured/permanent-failure/invalid-address, and exception-content redaction) and `tests/unit/system-remediation/sr-mail-002/audit-notification-service.dispatch.test.ts` (per-recipient audit + dedupe) pass unmodified in assertions. `tests/unit/system-remediation/sr-mail-delivery-readback-20261001/mail-delivery-readback.test.ts` (cross-tenant deny, wrong-tenant 404, platform/ops readback, C006 ack-persistence recovery) passes unmodified. |
| **`approval_mail_exact_candidate_validation`**               | Candidate must keep the diff within the 4 code/test `write_scopes` paths plus this UAT doc, and pass the exact-candidate unit/lint checks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | All `write_scopes` paths listed in the task brief.                                                                                                                                                                                                                                                                                                                                                                                                                           | Verified below with exact commands and results.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

---

## 2. Before / After Reproduction Summary

### Before Repair

`AuditNotificationEmailAdapter.deliver()`:

```ts
try {
  const queued = await this.deliveryService.enqueue({ ... });
  const receipt = queued.status === "sent" ? queued : (await this.deliveryService.dispatch(...) ?? queued);
  ...
} catch (error) {
  // Reached for BOTH a genuine enqueue failure (no durable record exists)
  // AND a dispatch-phase claim/ACK-persistence rejection (a durable record
  // from enqueue already exists).
  return {
    ...
    deliveryId: `error-${idempotencyKey}`,  // discards the real, already-committed id
    status: "failed",                       // fabricates certainty the provider never gave
    ...
  };
}
```

Reproduced with a `FileMailOutbox` wrapped so its 2nd `transaction()` call (dispatch's claim phase) throws: the adapter returned `deliveryId: "error-approval-notification:...:...:..."` and `status: "failed"`, even though `NotificationDeliveryService.get(tenantId, <real deliveryId>)` showed a genuinely stored `"queued"` record with zero attempts (no provider call was ever made). Reproduced again with the 3rd `transaction()` call (post-ACK persistence) throwing after a real provider accept: the adapter still returned the synthetic `error-` id and `"failed"`, discarding a receipt that actually held one `"started"` attempt and could not honestly be called a provider failure.

### After Repair

`deliver()` now wraps `enqueue()` and the `dispatch()` call in separate `try`/`catch` blocks (mirroring the already-shipped `TenantInvitationDeliveryService` C006 pattern):

- `enqueue()` throwing → nothing durable exists yet; the synthetic `error-<idempotencyKey>` id and `status: "failed"` remain correct (unchanged behavior).
- `dispatch()` throwing after a successful `enqueue()` → the catch returns the real `queued.deliveryId` / `queued.messageId` / `queued.status` (always `"queued"` at that point) / `queued.sentAt`, with a bounded `errorCode` derived from the dispatch exception. No `"sent"` or `"failed"` is fabricated for an ACK-unknown outcome.

Re-running both reproductions: the adapter now returns the real UUID `deliveryId`, status `"queued"`, and the same identity is confirmed resolvable through `NotificationDeliveryService.get()` directly and through `TenantPartnerService.getMailDeliveryReceipt()` (the existing SR-MAIL-DELIVERY-READBACK-20261001 readback endpoint) via the full `AuditNotificationService.dispatchApprovalNotification` per-recipient audit path.

---

## 3. Verification Commands, Outputs, and Exit Codes

All checks were executed socket-free in the isolated worktree `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude2-approval-mail-durable-delivery-readback-20261015` (no dev server, no Playwright/browser, no Docker Compose infrastructure started).

1. **Targeted unit/regression suite**:

   ```bash
   pnpm vitest run \
     tests/unit/system-remediation/sr-mail-002/audit-notification-email-adapter.test.ts \
     tests/unit/system-remediation/sr-mail-002/audit-notification-service.dispatch.test.ts \
     tests/unit/approval-mail-durable-delivery-readback-20261015/approval-mail-durable-delivery-readback.test.ts \
     tests/unit/system-remediation/sr-mail-delivery-readback-20261001/mail-delivery-readback.test.ts
   ```

   - **Result**: `Test Files 4 passed (4)`, `Tests 33 passed (33)`, exit code `0`.

2. **Full `sr-mail-002` + readback directory sweep** (regression guard for `audit-notification-module.test.ts` and all pre-existing cases):

   ```bash
   pnpm vitest run \
     tests/unit/system-remediation/sr-mail-002/ \
     tests/unit/system-remediation/sr-mail-delivery-readback-20261001/ \
     tests/unit/approval-mail-durable-delivery-readback-20261015/
   ```

   - **Result**: `Test Files 6 passed (6)`, `Tests 43 passed (43)`, exit code `0`.

3. **Lint on touched files**:

   ```bash
   pnpm exec eslint \
     apps/api/src/modules/audit-notification/audit-notification.email-adapter.ts \
     tests/unit/system-remediation/sr-mail-002/audit-notification-email-adapter.test.ts \
     tests/unit/approval-mail-durable-delivery-readback-20261015/approval-mail-durable-delivery-readback.test.ts
   ```

   - **Result**: no output (clean), exit code `0`.

4. **Typecheck scope note**: `cd apps/api && pnpm exec tsc --noEmit -p tsconfig.json` reports 4 pre-existing, unrelated errors (`Cannot find module '@drts/control-plane-auth'`) caused by an unbuilt workspace package (`packages/control-plane-auth` has no `dist/`); confirmed present before this change and unrelated to any file in this task's `write_scopes` (no error references `audit-notification` or `approval-mail`). Not touched here — out of this task's `write_scopes` and not caused by this diff.

---

## 4. Scope & Live-Verification Boundary Statement

- **Preserved Credit**: SR-MAIL-002 (approval-notification email delivery, five bilingual templates, opt-out policy), SR-NOTIFY-001 (`NotificationDeliveryService` durable outbox, retry/lease fencing — untouched, no file in that module is in this task's `write_scopes`), SR-MAIL-DELIVERY-READBACK-20261001 (`TenantPartnerService.getMailDeliveryReceipt`, cross-tenant/scope enforcement), and C006 (`TenantInvitationDeliveryService`'s equivalent claim/ACK-persistence-rejection correlation fix, used here only as the established reference pattern and left otherwise unmodified) are all preserved intact and re-verified by their existing passing suites.
- **No Invented Transport/Policy**: No new transport, outbox algorithm, provider policy, or public field was added to `AuditNotificationEmailDeliveryRecord`; the fix is confined to which identity/status `deliver()` returns when `dispatch()` itself throws after a successful `enqueue()`.
- **Live Boundary**: All verification is socket-free (in-memory `FileMailOutbox` under a temp directory, controlled test transport). This does not claim live SMTP/provider delivery, a running VM product server, or any hosted mailbox acceptance — those remain the responsibility of their own original tasks/gates.
