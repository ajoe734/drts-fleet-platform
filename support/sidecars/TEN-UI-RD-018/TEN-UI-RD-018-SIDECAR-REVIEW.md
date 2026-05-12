# TEN-UI-RD-018 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `TEN-UI-RD-018` — Webhooks 完整化
**Parent Owner:** `Codex2`
**Parent Reviewer:** `Codex`
**Sidecar Owner:** `Codex`
**Sidecar Reviewer:** `Codex2`
**Generated:** `2026-05-12` (UTC)
**Refreshed:** `2026-05-12T19:49:02Z`
**Status:** `REVIEW SUPPORT ARTIFACT` — support-only; does not modify
canonical truth, runtime behavior, the parent review verdict, or the parent
closeout evidence.

This packet exists only to support sidecar reviewer handoff for
`TEN-UI-RD-018`. The parent task already reached `done` on its own track.
This packet does not re-litigate the parent review outcome. It records the
final machine-truth anchors, the reopen -> re-handoff -> review_approved ->
done lifecycle, the load-bearing source anchors, and the exact checks the
sidecar reviewer (`Codex2`) should repeat before approving this support
slice.

Transient sidecar lifecycle truth (`status`, `next`, `last_update`) remains
authoritative only in `ai-status.json`. This packet intentionally avoids
hard-coding those volatile fields.

---

## 1. Scope Boundary

In scope:

- summarize the stable machine-truth fields of parent `TEN-UI-RD-018` and
  this sidecar task
- record the dependency baseline on `TEN-UI-RD-001`
- pin the parent's final lifecycle chain, including the two review failures,
  the final re-handoff, reviewer approval, and owner closeout
- capture the concrete source anchors that justify the final parent outcome:
  design target, runtime route, client manager, server actions, api-client
  helpers, and backend routes
- restate the webhook gap posture (`WH-1`, `WH-2`, `WH-3`) so the reviewer can
  confirm the parent did not invent replay, tenant-wide client helpers, or any
  contract widening
- provide reviewer-facing handoff notes for this docs-only support artifact

Out of scope:

- editing runtime or contract files under `apps/tenant-console-web/**`,
  `packages/ui-web/**`, `packages/api-client/**`, `packages/contracts/**`, or
  `apps/api/**`
- editing design or planning truth under
  `docs/05-ui/drts-design-canvas/**` or
  `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`
- editing `ai-status.json`, `current-work.md`, or `ai-activity-log.jsonl`
  except through the normal lifecycle commands for this sidecar task
- reopening, approving, or re-finalizing parent `TEN-UI-RD-018`; that parent
  review/closeout already completed under `Codex` and `Codex2`
- treating this packet as a substitute for the parent commit, push, or
  acceptance-side artifact

---

## 2. Machine-Truth Anchors

### Sidecar task — `TEN-UI-RD-018-SIDECAR-REVIEW`

Stable fields in `ai-status.json`:

- owner=`Codex`
- reviewer=`Codex2`
- task_class=`sidecar`
- helper_parent=`TEN-UI-RD-018`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- auto_generated=`true`
- auto_created_by=`supervisor-underutilization`
- depends_on=`TEN-UI-RD-001`
- artifact=`support/sidecars/TEN-UI-RD-018/TEN-UI-RD-018-SIDECAR-REVIEW.md`

Live sidecar lifecycle state:

- read `status`, `next`, `last_update`, and the latest handoff/approve events
  directly from `ai-status.json`
- this packet is intentionally written against stable parent evidence, not the
  sidecar's transient lifecycle fields

### Parent task — `TEN-UI-RD-018`

Stable fields in `ai-status.json`:

- title=`Webhooks 完整化`
- summary_zh=`TN_Webhooks — 現為 IA shell + 投遞紀錄。`
- phase=`Wave 3`
- owner=`Codex2`
- reviewer=`Codex`
- status=`done`
- depends_on=`TEN-UI-RD-001`
- artifacts=`apps/tenant-console-web/app/`
- acceptance:
  - `pnpm --filter @drts/tenant-console-web typecheck / build / test`
  - `Storybook 對照對應 TN_* artboard`
  - `若 backend contract 缺，開 blocker 回 discussion_planning，不偷擴 contract`
- planning_ref=`docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`
- commit_hash=`ea0c49cb1013c1f337a6ec14af83a37c354e38c4`
- commit_subject=`feat(TEN-UI-RD-018): complete tenant webhooks surface`
- commit_agent=`Codex2`
- commit_reviewer=`Codex`
- push_remote=`origin`
- push_branch=`feat/claude2-ui-redesign-foundation`
- push_ref=`origin/feat/claude2-ui-redesign-foundation`
- push_commit=`ea0c49cb1013c1f337a6ec14af83a37c354e38c4`

Branch reachability checks at packet refresh:

- `git branch -r --contains ea0c49cb1013c1f337a6ec14af83a37c354e38c4`
  resolves to `origin/feat/claude2-ui-redesign-foundation`
- `git show --stat --summary ea0c49c --` confirms the parent closeout commit
  touched:
  - `apps/tenant-console-web/app/webhooks/actions.ts`
  - `apps/tenant-console-web/app/webhooks/constants.ts`
  - `apps/tenant-console-web/app/webhooks/page.tsx`
  - `apps/tenant-console-web/app/webhooks/webhook-manager.tsx`
  - `packages/api-client/src/index.ts`
  - `support/sidecars/TEN-UI-RD-018/TEN-UI-RD-018-SIDECAR-ACCEPTANCE.md`

### Companion acceptance sidecar — `TEN-UI-RD-018-SIDECAR-ACCEPTANCE`

Stable follow-on truth worth recording for reviewer orientation:

- status=`done`
- owner=`Codex2`
- reviewer=`Claude`
- commit_hash=`495708a`
- commit_subject=
  `docs(TEN-UI-RD-018-SIDECAR-ACCEPTANCE): finalize acceptance packet closeout`
- push_ref=`origin/feat/claude2-ui-redesign-foundation`

Why it matters here:

- the parent closeout note explicitly says the refreshed acceptance sidecar is
  finalized
- this review packet should not claim the acceptance companion is still
  pending or only `review_approved`

### Hard dependency — `TEN-UI-RD-001`

- status=`done`
- commit=`515f271395a583fe25be16c110dbf232f4ebcf87`
- subject=`feat(TEN-UI-RD-001): finish CSS strip + add tenant-shell Storybook target`
- push_ref=`origin/feat/claude2-ui-redesign-foundation`

Dependency role:

- `TEN-UI-RD-001` supplies the tenant shell baseline and shared story shell
  that the final `/webhooks` route and `Tenant Console/Webhooks` Storybook
  target render inside

---

## 3. Final Parent Lifecycle Summary

The earlier version of this packet was written while the parent was still in
flight. It is no longer accurate. The final lifecycle is:

| Timestamp UTC          | Event                     | Meaning                                                                                                                                                   |
| ---------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2026-05-12T14:29:18Z` | first `handoff`           | `Codex2` first claimed completion: route + story + verification passed.                                                                                   |
| `2026-05-12T14:40:59Z` | first `reopen`            | `Codex` rejected the first pass because governance-load failures still collapsed unknown posture into false negatives.                                    |
| `2026-05-12T14:43:34Z` | second `reopen`           | `Codex` also flagged parity drift: runtime route was still effectively read-only relative to the story/claim set.                                         |
| `2026-05-12T16:43:02Z` | second `handoff`          | `Codex2` rebuilt the route around a client manager, added mutation flows, preserved unknown governance state, and extended `@drts/api-client` for `WH-3`. |
| `2026-05-12T16:56:16Z` | `review_approved`         | `Codex` accepted the rework after re-running tenant-console and ui-web verification.                                                                      |
| `2026-05-12T17:03:08Z` | parent `done`             | `Codex2` closed the parent with task-scoped commit `ea0c49c` pushed non-force to `origin/feat/claude2-ui-redesign-foundation`.                            |
| `2026-05-12T17:12:16Z` | acceptance sidecar `done` | `Codex2` separately finalized the acceptance companion at commit `495708a`.                                                                               |

Reviewer interpretation:

- the load-bearing review work already happened on the parent track
- this sidecar review is about whether this packet accurately describes that
  final state, not whether the parent should reopen again

---

## 4. Source and Evidence Anchors

### Planning and design anchors

- `docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md:469-475`
  - records `TEN-UI-RD-018` as `Webhooks 完整化`
  - re-states the parity-fill rule: if contract coverage is missing, open a
    blocker instead of expanding backend semantics locally
- `docs/05-ui/drts-design-canvas/Tenant Console.html:82-85`
  - the integration section includes
    `DCArtboard id="webhooks" label="Webhook + 投遞"`
- `docs/05-ui/drts-design-canvas/tenant-screens.jsx:362-390`
  - `TN_Webhooks` expects a webhook page header, endpoint inventory, nearby
    delivery evidence, and the conceptual tabs
    `Endpoints / Deliveries / Replay`

### Runtime and story-shell anchors

- `apps/tenant-console-web/lib/navigation.ts:63-76`
  - keeps `/webhooks` under `Integrations`, adjacent to `/api-keys`
- `packages/ui-web/src/tenant-story-support.tsx:34-39`
  - mirrors the same `Integrations -> Webhooks` story-shell slot
- `packages/ui-web/src/tenant-webhooks.stories.tsx:318-344`
  - exports the `Tenant Console/Webhooks` parity story with
    `anchor="webhooks"`

### Parent implementation anchors

- `apps/tenant-console-web/app/webhooks/page.tsx:23-89`
  - loads `listWebhooks()`, `getTenantIntegrationGovernancePackage()`, and
    per-endpoint `listWebhookDeliveries(webhookId)` under
    `Promise.allSettled()`
  - preserves partial-failure errors instead of crashing the page
  - delegates the rendered surface to `WebhookManager`
- `apps/tenant-console-web/app/webhooks/webhook-manager.tsx:303-357`
  - page header plus explicit partial-load warning:
    "Unknown governance values remain explicitly unknown below"
- `apps/tenant-console-web/app/webhooks/webhook-manager.tsx:359-391`
  - KPI row keeps governance-derived coverage unavailable when governance did
    not load instead of forcing `0 / 0`
- `apps/tenant-console-web/app/webhooks/webhook-manager.tsx:398-579`
  - endpoint inventory table and recent deliveries table stay on the same
    runtime surface
- `apps/tenant-console-web/app/webhooks/webhook-manager.tsx:584-889`
  - create, update, delete, send-test, and rotate-secret controls live in the
    selected-shell route
- `apps/tenant-console-web/app/webhooks/webhook-manager.tsx:892-963`
  - policy posture renders unknown values through `renderUnknown()` and
    `renderBooleanState()` instead of fabricating `no` / `not required`
- `apps/tenant-console-web/app/webhooks/webhook-manager.tsx:965-1034`
  - coverage card falls back to an explicit unavailable warning when
    governance is missing, and the final guardrail banner says the route does
    not invent tenant-wide delivery feeds, replay buttons, or manual retry
    semantics
- `apps/tenant-console-web/app/webhooks/actions.ts:68-272`
  - server actions wire:
    - create (`68-111`)
    - update (`113-161`)
    - delete (`163-195`)
    - send test (`197-229`)
    - rotate secret (`231-272`)

### Contract and backend anchors

- `packages/contracts/src/index.ts:833-901`
  - `TenantWebhookRuntimeMetadata`
  - `CreateTenantWebhookEndpointCommand`
  - `TENANT_WEBHOOK_ENDPOINT_STATUSES`
  - `TenantWebhookEndpoint`
  - `UpdateTenantWebhookEndpointCommand`
  - `SendTestWebhookCommand`
  - `WebhookDeliveryRecord`
- `packages/contracts/src/index.ts:1109-1127`
  - `TenantWebhookGovernancePolicy`
  - `TenantIntegrationGovernancePackage`
- `packages/api-client/src/index.ts:1274-1330`
  - `listWebhooks`
  - `createWebhookEndpoint`
  - `updateWebhookEndpoint`
  - `deleteWebhookEndpoint`
  - `sendTestWebhook`
  - `rotateWebhookSecret`
  - `listWebhookDeliveries(webhookId)`
- `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts:544-679`
  - published backend routes:
    - `POST tenant/webhooks`
    - `POST tenant/webhooks/test`
    - `POST tenant/webhooks/:webhookId`
    - `DELETE tenant/webhooks/:webhookId`
    - `POST tenant/webhooks/:webhookId/rotate-secret`
    - `GET tenant/webhooks/deliveries`
    - `GET tenant/webhooks/:webhookId/deliveries`

### Gap posture that still matters

- `support/sidecars/XS-UI-002/backend-gap-inventory.md:109-123,269-271`
  - `WH-1` remains a real backend gap:
    no retry/replay command endpoint exists
  - `WH-2` remains an api-client gap:
    tenant-wide deliveries exist in backend but the shared client still only
    exposes per-endpoint `listWebhookDeliveries(webhookId)`
  - `WH-3` started as an api-client gap and is resolved by this parent slice
    via `sendTestWebhook` and `rotateWebhookSecret`

Interpretation check:

- the final route is allowed to aggregate recent deliveries from
  per-endpoint calls
- the final route is not allowed to imply a tenant-wide client helper or any
  replay/manual retry command
- `webhook-manager.tsx:1029-1034` explicitly preserves that guardrail

---

## 5. Verification Summary

The parent's final recorded verification, copied from machine truth and
relevant lifecycle entries:

- owner handoff re-verified at `2026-05-12T16:43:02Z`:
  - `pnpm --filter @drts/tenant-console-web typecheck`
  - `pnpm --filter @drts/tenant-console-web build`
  - `pnpm --filter @drts/tenant-console-web test` (no test files, exit `0`)
  - `pnpm --filter @drts/ui-web typecheck`
  - `pnpm --filter @drts/ui-web exec storybook build`
- reviewer approval re-verified at `2026-05-12T16:56:16Z`:
  - same five commands
  - no backend-contract blocker found

Packet-refresh verification performed for this sidecar update:

- read back `ai-status.json` for:
  - parent `TEN-UI-RD-018`
  - sidecar `TEN-UI-RD-018-SIDECAR-REVIEW`
  - companion `TEN-UI-RD-018-SIDECAR-ACCEPTANCE`
- parsed `ai-activity-log.jsonl` for the parent lifecycle events above
- checked `git show --stat --summary ea0c49c --`
- checked `git branch -r --contains ea0c49c`
- checked `git show --stat --summary 495708a --`
- checked `git branch -r --contains 495708a`

No runtime tests were rerun during this sidecar refresh because this task only
updates a support artifact.

---

## 6. Reviewer Checklist For This Sidecar

1. Confirm machine truth still matches the packet.
   - Sidecar row still identifies `owner=Codex`, `reviewer=Codex2`,
     `helper_parent=TEN-UI-RD-018`, and `mutates_canonical=false`.
   - Parent row still shows `status=done` with commit `ea0c49c...` on
     `origin/feat/claude2-ui-redesign-foundation`.
   - Acceptance companion still shows `status=done` with commit `495708a`.

2. Confirm the packet no longer describes the stale pre-closeout state.
   - It must not say the parent is still `in_progress`, `review`, or awaiting
     commit evidence.
   - It must not say the runtime route is a placeholder or that the parity
     story is missing.

3. Confirm the source anchors are accurate.
   - `page.tsx`, `webhook-manager.tsx`, `actions.ts`,
     `tenant-webhooks.stories.tsx`, `navigation.ts`, `tenant-story-support.tsx`,
     `packages/api-client/src/index.ts`, `packages/contracts/src/index.ts`,
     and `tenant-partner.controller.ts` should all match the claims above.

4. Confirm the gap posture is honest.
   - `WH-3` is now resolved in the shared client.
   - `WH-1` and `WH-2` remain real gaps and are not misrepresented as solved.
   - The route still refuses to invent replay or tenant-wide client semantics.

5. Confirm sidecar scope discipline.
   - This sidecar update should touch only
     `support/sidecars/TEN-UI-RD-018/TEN-UI-RD-018-SIDECAR-REVIEW.md`
     plus the normal lifecycle state transitions recorded through
     `scripts/ai-status.sh`.

---

## 7. Reviewer Handoff Summary

Expected sidecar reviewer conclusion if this packet passes:

- the packet now reflects the final parent truth instead of the stale
  mid-review snapshot
- the reopen findings, final re-handoff, review approval, parent closeout,
  and acceptance-side closeout are all represented accurately
- the file/line anchors match the live runtime, story, contract, and backend
  surfaces
- the packet remains support-only and does not mutate canonical truth

If the sidecar review fails, the failure should point to one of these classes:

- parent lifecycle chronology is wrong or incomplete
- commit/push evidence is misstated
- a source anchor no longer matches the live file
- `WH-1` / `WH-2` / `WH-3` posture is misstated
- the packet still carries stale pre-closeout claims
