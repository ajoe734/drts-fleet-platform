# FBP-005 BFF & Frontend Handoff Packet

**Sidecar Task:** `FBP-005-SIDECAR-BFF-HANDOFF`  
**Parent Task:** `FBP-005`  
**Helper Kind:** `bff_handoff_packet`  
**Prepared by:** Codex  
**Assigned Reviewer:** Claude  
**Date:** 2026-04-15 (UTC)  
**Status:** IN PROGRESS - ready to hand off for review

---

## 1. Purpose

This sidecar captures the tenant-facing BFF freeze point that `FBP-005` established inside
`drts-fleet-platform`, then translates it into a frontend-consumer handoff packet.

It exists to answer four questions for downstream UI work:

1. Which tenant portal journeys were already safe to consume from `/api/tenant/*` at the end of `FBP-005`?
2. Which surfaces were still partial or missing at that freeze point and therefore could not be assumed complete?
3. Which wire-contract and authority rules did frontend consumers need to follow?
4. What should reviewer Claude verify before this sidecar is closed?

This document is support-only. It does not change canonical truth, runtime behavior, registry
behavior, or governance state.

---

## 2. Shared-Truth Baseline

The baseline below comes from the current shared coordination files plus the existing support docs:

- `current-work.md` records parent task `FBP-005` as `done`, commit `78cb874`, with Claude review
  notes confirming tenant-facing BFF parity closure and explicitly calling out two remaining gaps:
  webhook metadata update and tenant role catalog.
- `ai-status.json` records this sidecar task as owned by `Codex`, reviewed by `Claude`, and scoped
  to `support/sidecars/FBP-005/FBP-005-SIDECAR-BFF-HANDOFF.md`.
- `docs/02-architecture/authority/fbp-005-tenant-bff-parity-matrix.md` is the primary freeze
  artifact for parent-task scope and gap boundaries.
- `docs/02-architecture/authority/fbp-006-tenant-commute-hub-cutover-spec.md` provides the
  downstream consumer mapping that proves how the `FBP-005` freeze point was intended to be
  consumed by repo-B/frontend work.

Important framing:

- This packet documents the `FBP-005` freeze point, not the later `FBP-006` cutover result.
- It is valid to mention that `FBP-006` later closed the two remaining gaps, but those closures do
  not retroactively change what `FBP-005` itself delivered.

---

## 3. `FBP-005` Freeze Point For Frontend Consumers

At the end of `FBP-005`, a frontend consumer could safely assume the following tenant journeys were
backed by core-repo authority and standard envelope contracts.

| Tenant journey                                         | Primary UI route(s)                                           | BFF endpoint(s) at `FBP-005` freeze                                                                                                                                                                                                                                                | Frontend posture                                                                      | Freeze status |
| ------------------------------------------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------- |
| Booking create/list/detail/update/cancel               | `/bookings/new`, `/booking-list`, `/booking-list/[bookingId]` | `POST /api/tenant/bookings`, `GET /api/tenant/bookings`, `GET /api/tenant/bookings/:bookingId`, `PUT /api/tenant/bookings/:bookingId`, `POST /api/tenant/bookings/:bookingId/cancel`                                                                                               | Treat booking lifecycle as backend-owned; do not use owned-order fallback routes      | implemented   |
| Passenger directory                                    | `/passengers`                                                 | `GET /api/tenant/passengers`, `POST /api/tenant/passengers`                                                                                                                                                                                                                        | Upsert through BFF only; no local CRUD authority                                      | implemented   |
| Address book                                           | `/addresses`                                                  | `GET /api/tenant/addresses`, `POST /api/tenant/addresses`                                                                                                                                                                                                                          | Same posture as passengers                                                            | implemented   |
| Reports job lifecycle                                  | `/reports`                                                    | `GET /api/tenant/reports/jobs`, `POST /api/tenant/reports/jobs`, `GET /api/tenant/reports/:jobId`                                                                                                                                                                                  | Poll backend job state and consume signed artifact URLs only                          | implemented   |
| API key management                                     | `/api-keys`                                                   | `GET /api/tenant/api-keys`, `POST /api/tenant/api-keys`, `POST /api/tenant/api-keys/:apiKeyId/rotate`, `POST /api/tenant/api-keys/:apiKeyId/revoke`                                                                                                                                | Show plaintext secret only on issue/rotate response; never store locally as authority | implemented   |
| Webhook list/create/delete/test/rotate/read deliveries | `/webhooks`                                                   | `GET /api/tenant/webhooks`, `POST /api/tenant/webhooks`, `DELETE /api/tenant/webhooks/:webhookId`, `GET /api/tenant/webhooks/deliveries`, `GET /api/tenant/webhooks/:webhookId/deliveries`, `POST /api/tenant/webhooks/test`, `POST /api/tenant/webhooks/:webhookId/rotate-secret` | Safe for list/create/delete/test/rotate-secret/delivery-read only                     | partial       |
| Billing profile + invoices                             | `/billing`                                                    | `GET /api/tenant/billing/profile`, `POST /api/tenant/billing/profile`, `GET /api/tenant/invoices`, `GET /api/tenant/invoices/:invoiceId`, `POST /api/tenant/invoices/generate`                                                                                                     | Amounts, invoice state, and signed downloads remain backend-owned                     | implemented   |
| Notification preferences                               | `/notifications`                                              | `GET /api/tenant/notifications`, `POST /api/tenant/notifications`                                                                                                                                                                                                                  | Write preference values only through canonical enum values                            | implemented   |
| Tenant notification feed                               | `/webhooks` secondary panel                                   | `GET /api/tenant/notifications/feed`                                                                                                                                                                                                                                               | Read-only feed; no ops-only route dependency                                          | implemented   |
| SLA profile                                            | `/sla`                                                        | `GET /api/tenant/sla`, `POST /api/tenant/sla`                                                                                                                                                                                                                                      | Threshold truth remains backend-owned                                                 | implemented   |
| Tenant users                                           | `/users`                                                      | `GET /api/tenant/users`, `POST /api/tenant/users`, `POST /api/tenant/users/:userId/role`                                                                                                                                                                                           | List/invite/update are backend-backed, but role catalog was not yet queryable         | partial       |
| Audit trail                                            | `/audit`                                                      | `GET /api/tenant/audit`                                                                                                                                                                                                                                                            | Read-only tenant-scoped audit feed                                                    | implemented   |

The freeze-point interpretation is strict:

- `implemented` means frontend consumers could wire the page directly to the listed BFF surface.
- `partial` means the route family existed, but the missing command/query had to remain explicit in
  handoff docs and could not be assumed by frontend teams.

---

## 4. Explicit Gaps That `FBP-005` Left Open

These were the only two material BFF parity gaps that remained open at the parent-task freeze
point. They were correctly documented in the parent review notes and in the parity matrix.

| Gap                     | Missing surface at `FBP-005` freeze                                          | Frontend implication at freeze time                                                                                 | Downstream note                                                           |
| ----------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Webhook metadata update | `POST /api/tenant/webhooks/:webhookId` or equivalent metadata-update command | Webhook pages could create/delete/test/rotate/read deliveries, but could not assume an edit-existing-endpoint flow  | Later closed by `FBP-006`; do not rewrite `FBP-005` history               |
| Tenant role catalog     | `GET /api/tenant/roles`                                                      | User-management pages could invite and mutate user roles, but role picker truth still had to remain a fixed UI enum | Later closed by `FBP-006`; at `FBP-005` freeze this was still a known gap |

Additional handoff caveat:

- `apps/tenant-portal-web/README.md` was already called out in the parity matrix as stale and must
  not be treated as the BFF parity source of truth.

---

## 5. Frontend Consumer Rules

Any frontend or repo-B consumer using the `FBP-005` freeze point had to preserve these rules:

- Use shared `@drts/api-client` tenant surfaces; do not introduce direct database, Supabase, or
  edge-function authority.
- Preserve the tenant bootstrap identity posture validated in `FBP-005`:
  `x-actor-type=tenant_admin`, `x-realm=tenant`, `x-tenant-id=<tenant>`.
- Parse success envelopes as `data/meta`; parse tenant lists as `data.items[] + data.page_info`.
- Preserve `snake_case` wire payloads and canonical enum values; display labels stay presentation-only.
- Let `@drts/api-client` provide `X-Request-Id` and `Idempotency-Key` behavior; do not hand-roll
  alternate semantics.
- Treat signed URLs returned by billing/reporting endpoints as opaque backend outputs; never
  regenerate, persist, or infer them locally.
- Treat backend error codes as authoritative; do not map them into different business outcomes just
  because the frontend prefers a different message.

---

## 6. Tenant-Admin Journey Handoff

The journey summaries below translate the parity matrix into task-oriented frontend guidance.

### 6.1 Booking Admin Journey

- Create bookings through `POST /api/tenant/bookings`.
- Refresh list/detail using tenant-prefixed booking reads only.
- Update and cancel through the canonical tenant booking commands.
- Do not fall back to `/api/orders` or any owned-order surface for tenant-admin booking flows.

### 6.2 Reporting Journey

- Start report jobs with `POST /api/tenant/reports/jobs`.
- Poll or refresh job detail with `GET /api/tenant/reports/:jobId`.
- Consume artifact downloads only from backend-returned signed URLs.
- Do not run client-side report generation or artifact stitching.

### 6.3 Webhook Admin Journey

- Supported at `FBP-005` freeze: list endpoints, create endpoint, delete endpoint, test dispatch,
  rotate secret, and inspect delivery history.
- Not supported at `FBP-005` freeze: edit metadata for an existing webhook.
- Frontend handoff must state that missing edit flow explicitly instead of silently implying parity.

### 6.4 Billing Admin Journey

- Read and update billing profile only through the tenant billing profile routes.
- Read invoice list/detail through the tenant invoice routes.
- Trigger invoice generation with the canonical command path.
- Do not compute invoice status, totals, or downloadable artifacts in the UI.

### 6.5 Tenant User Admin Journey

- List users, invite users, and mutate assigned role/state through the tenant user routes.
- At `FBP-005` freeze, the assignable role set was still a frontend-fixed catalog.
- Handoff docs must therefore distinguish “user mutation implemented” from “role catalog query implemented.”

---

## 7. Reviewer Checklist For Claude

Claude should evaluate this sidecar against the following points:

1. The packet is support-only and does not modify canonical runtime or L1/L2 truth.
2. Every “implemented” or “partial” statement matches the parent freeze artifact
   `fbp-005-tenant-bff-parity-matrix.md`.
3. The two explicit gaps remain visible as `FBP-005` freeze-time caveats and are not silently erased
   by knowledge of later `FBP-006` work.
4. The frontend rules reflect the verified `FBP-005` wire/authority posture:
   tenant actor type, canonical list envelopes, auto request IDs/idempotency, signed-download
   consumption, and no local authority.
5. The handoff is sufficient for a downstream frontend consumer to wire pages without consulting
   stale docs or inventing missing backend surfaces.

If those checks pass, Claude can approve this sidecar and return it to Codex for `done` closeout
with `NO_COMMIT_REQUIRED=1`.

---

## 8. Suggested Review / Closeout Commands

Reviewer approval:

```bash
AI_NAME=Claude \
REVIEW_FILE=support/sidecars/FBP-005/FBP-005-SIDECAR-BFF-HANDOFF.md \
REVIEW_NOTES_ZH='審查通過：handoff packet 正確凍結 FBP-005 的 tenant-facing BFF 邊界，implemented/partial 狀態與 parity matrix 一致；兩個 freeze-time gap（webhook metadata update、tenant role catalog）保持明示，且未混入 FBP-006 後續 closure；frontend consumer rules 與 tenant actor/envelope/idempotency/signed-download posture 對齊。|回到 owner（Codex）以 NO_COMMIT_REQUIRED=1 做 done closeout。' \
./scripts/ai-status.sh approve FBP-005-SIDECAR-BFF-HANDOFF \
  "Review approved. Handoff packet freezes FBP-005 tenant BFF parity for frontend consumers, preserves the two known freeze-time gaps, and stays support-only."
```

Owner closeout after approval:

```bash
AI_NAME=Codex NO_COMMIT_REQUIRED=1 \
./scripts/ai-status.sh done FBP-005-SIDECAR-BFF-HANDOFF \
  "Done: FBP-005 BFF/frontend handoff packet recorded the tenant-facing freeze point, consumer rules, and explicit gap carry-forward without changing canonical truth."
```

---

This packet is a sidecar support artifact. It records the `FBP-005` handoff boundary; it does not
replace the parent parity matrix, rewrite `FBP-005` scope, or modify machine-tracked canonical
task evidence.
