# FBP-006 BFF & Frontend Handoff Packet

**Sidecar Task:** `FBP-006-SIDECAR-BFF-HANDOFF`  
**Parent Task:** `FBP-006`  
**Helper Kind:** `bff_handoff_packet`  
**Prepared by:** Codex  
**Assigned Reviewer:** Claude  
**Date:** 2026-04-15 (UTC)  
**Status:** IN PROGRESS - ready to hand off for review

---

## 1. Purpose

This sidecar compresses the completed `FBP-006` tenant cutover into a reviewer- and consumer-ready
handoff packet.

It exists to answer four practical questions:

1. What did `FBP-006` change relative to the `FBP-005` tenant BFF freeze point?
2. Which `tenant-commute-hub` journeys are now safe to consume only through
   `drts-fleet-platform` BFF authority?
3. Which local authority behaviors were removed from repo B and must stay deleted?
4. What should downstream reviewers or follow-on slices verify before they depend on this cutover?

This document is support-only. It does not change canonical truth, runtime behavior, contracts, or
governance state.

---

## 2. Shared-Truth Baseline

The baseline below comes from the current coordination files plus the parent execution artifact:

- `current-work.md` records parent task `FBP-006` as `done`, commit `ddfc087`, with the freeze note
  that core repo now exposes `GET /api/tenant/roles` and `POST /api/tenant/webhooks/:webhookId`.
- `ai-status.json` records this sidecar as owned by `Codex`, reviewed by `Claude`, and scoped to
  `support/sidecars/FBP-006/FBP-006-SIDECAR-BFF-HANDOFF.md`.
- `ai-activity-log.jsonl` records `FBP-006` as finalized on 2026-04-15T18:14:33Z and this sidecar
  as a pending owned-ready dispatch reassigned to Codex.
- `docs/02-architecture/authority/fbp-006-tenant-commute-hub-cutover-spec.md` is the parent-task
  execution artifact that freezes the migrated page inventory, deleted authority set, and local
  verification gate for `../tenant-commute-hub`.
- `docs/02-architecture/tenant-commute-hub-boundary.md` remains the canonical frontend boundary
  contract and defines the non-negotiable consumer rules that still apply after cutover.

Important framing:

- This packet documents the post-cutover result of `FBP-006`, not the earlier `FBP-005` freeze.
- `FBP-005` carried two known gaps into `FBP-006`; this sidecar is allowed to mark them closed
  because that closure is now part of the parent task's shared-truth done state.

---

## 3. Delta From `FBP-005` To `FBP-006`

`FBP-006` existed to remove the last reasons for repo B to keep local tenant authority.

| Freeze-time gap from `FBP-005`       | `FBP-006` target                                                      | Post-cutover status | Frontend implication                                                          |
| ------------------------------------ | --------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------- |
| Webhook metadata update missing      | `POST /api/tenant/webhooks/:webhookId`                                | closed              | `/webhooks` no longer needs a local edit fallback or partial-state warning    |
| Tenant role catalog missing          | `GET /api/tenant/roles`                                               | closed              | `/users` must source assignable roles from backend instead of a fixed UI enum |
| Repo B local authority still present | delete Supabase direct truth, edge functions, local command authority | closed              | `tenant-commute-hub` becomes a pure UI consumer of core BFF authority         |

Net result:

- `FBP-006` is the first tenant cutover point where downstream consumers can treat the entire
  tenant-admin page inventory as BFF-backed.
- If a future repo-B page discovers a missing surface after this freeze, it must reopen a new
  core-repo authority task instead of restoring local authority.

---

## 4. Cutover-Ready Tenant Journey Matrix

The matrix below is intentionally narrower than the full execution spec. It is the reviewer-facing
and downstream-consumer summary of what is safe after `FBP-006`.

| Tenant journey                           | Repo B route(s)                                               | Canonical BFF surface                                                                                                                                                                                                                                                           | Handoff note                                                                        |
| ---------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Dashboard bootstrap                      | `/`                                                           | `GET /api/identity/context`, tenant list reads for bookings, passengers, addresses, reports, api-keys, webhooks, invoices, audit                                                                                                                                                | Dashboard is read-only aggregation over backend truth; no local summary tables      |
| Booking create/list/detail/update/cancel | `/bookings/new`, `/booking-list`, `/booking-list/[bookingId]` | `POST /api/tenant/bookings`, `GET /api/tenant/bookings`, `GET /api/tenant/bookings/:bookingId`, `PUT /api/tenant/bookings/:bookingId`, `POST /api/tenant/bookings/:bookingId/cancel`                                                                                            | Booking lifecycle must stay on tenant-prefixed routes only                          |
| Passenger directory                      | `/passengers`                                                 | `GET /api/tenant/passengers`, `POST /api/tenant/passengers`                                                                                                                                                                                                                     | No local CRUD truth or dedupe logic treated as authority                            |
| Address book                             | `/addresses`                                                  | `GET /api/tenant/addresses`, `POST /api/tenant/addresses`                                                                                                                                                                                                                       | Same authority posture as passengers                                                |
| Reports job lifecycle                    | `/reports`                                                    | `GET /api/tenant/reports/jobs`, `POST /api/tenant/reports/jobs`, `GET /api/tenant/reports/:jobId`                                                                                                                                                                               | Artifact downloads must use backend-signed URLs only                                |
| API key management                       | `/api-keys`                                                   | `GET /api/tenant/api-keys`, `POST /api/tenant/api-keys`, `POST /api/tenant/api-keys/:apiKeyId/rotate`, `POST /api/tenant/api-keys/:apiKeyId/revoke`                                                                                                                             | Plaintext key material appears only on issue/rotate response                        |
| Webhook management                       | `/webhooks`                                                   | `GET /api/tenant/webhooks`, `POST /api/tenant/webhooks`, `POST /api/tenant/webhooks/:webhookId`, `POST /api/tenant/webhooks/:webhookId/rotate-secret`, `POST /api/tenant/webhooks/test`, `GET /api/tenant/webhooks/:webhookId/deliveries`, `GET /api/tenant/notifications/feed` | Metadata update is now canonical; no local edit, retry, or secret storage allowed   |
| Billing and invoices                     | `/billing`                                                    | `GET /api/tenant/billing/profile`, `POST /api/tenant/billing/profile`, `GET /api/tenant/invoices`, `GET /api/tenant/invoices/:invoiceId`, `POST /api/tenant/invoices/generate`                                                                                                  | Amounts, invoice state, and artifact URLs remain backend-owned                      |
| Notifications                            | `/notifications`                                              | `GET /api/tenant/notifications`, `POST /api/tenant/notifications`, `GET /api/tenant/notifications/feed`                                                                                                                                                                         | Submit canonical event/channel values only                                          |
| SLA profile                              | `/sla`                                                        | `GET /api/tenant/sla`, `POST /api/tenant/sla`                                                                                                                                                                                                                                   | No local threshold authority                                                        |
| Tenant users and role assignment         | `/users`                                                      | `GET /api/tenant/users`, `GET /api/tenant/roles`, `POST /api/tenant/users`, `POST /api/tenant/users/:userId/role`                                                                                                                                                               | Assignable role set must come from `GET /api/tenant/roles`; fixed enum is forbidden |
| Audit trail                              | `/audit`                                                      | `GET /api/tenant/audit`                                                                                                                                                                                                                                                         | Audit remains read-only and cannot be used as control-plane truth                   |
| Legacy redirects only                    | `/dashboard`, `/bookings`, `/admin`, `/cost-centers`          | browser redirect only                                                                                                                                                                                                                                                           | These paths must not hide residual local page implementations                       |

Interpretation rule:

- Every route above is now safe to wire as a pure consumer of `drts-fleet-platform`.
- That does **not** authorize local repo-B state machines, fallback writes, or shadow authority.

---

## 5. Authority Deletion Freeze

Per the parent cutover spec, the following local-authority classes were removed or explicitly
disabled in `tenant-commute-hub` and must stay that way:

1. Supabase direct reads and writes for tenant users, bookings, passengers, addresses, webhooks,
   billing, reports, and audit.
2. Repo-B edge functions or serverless handlers that create tenant-facing truth outside
   `drts-fleet-platform`.
3. Local webhook secret storage, retry scheduling, signature generation, or webhook payload
   publishing.
4. Local API key mint/revoke/rotate behavior or plaintext secret persistence.
5. Fixed tenant role enums used as authority for writes.
6. Client-side billing, invoice, fee, or statement computation treated as canonical.
7. Client-side booking or dispatch lifecycle mutation outside BFF command paths.
8. Local report generation or direct artifact-bucket access.
9. Repo-B environment variables or secrets that imply repo-owned backend authority for tenant flows.

Execution record frozen by the parent task:

- repo B `src/integrations/supabase/*` deleted
- repo B `supabase/functions/*` deleted
- repo B `supabase/migrations/*` deleted
- `src/pages/CostCenterManagement.tsx` deleted
- `@supabase/supabase-js` removed from repo B dependencies
- `/api-keys`, `/webhooks`, `/billing`, `/notifications`, `/sla`, and `/users` rewired to shared
  `@drts/api-client`

---

## 6. Frontend Consumer Rules That Still Apply

`FBP-006` closed the remaining BFF gaps, but it did not relax the frontend boundary contract.
Downstream consumers still must preserve these rules:

- All JSON wire payloads stay `snake_case`.
- Success responses are parsed as `data/meta`; list responses are parsed as `items[] + page_info`.
- POST command calls carry `Idempotency-Key`.
- Canonical enum values pass through unchanged; display labels remain presentation-only.
- Signed downloads are consumed exactly as returned by backend short-lived URLs.
- Backend error codes remain authoritative; do not reinterpret them into a different business result.
- `GET /api/tenant/roles` is now the single role catalog source for tenant-admin writes.
- `POST /api/tenant/webhooks/:webhookId` is now the only metadata update path for existing webhook
  endpoints.

Boundary reminder from `tenant-commute-hub-boundary.md`:

- repo B is a pure UI consumer
- domain truth remains in `drts-fleet-platform`
- audit is observation, not control
- frontend validation may improve UX but must not replace backend business rules

---

## 7. Downstream Handoff Notes

### 7.1 For Claude As Reviewer

Claude should verify:

1. This sidecar stays support-only and does not rewrite canonical truth.
2. The packet matches the parent done state of `FBP-006` in `current-work.md` and `ai-status.json`.
3. The matrix in §4 is consistent with the cutover spec's canonical page inventory.
4. The deletion freeze in §5 preserves repo B as a pure UI consumer and does not reintroduce local
   authority.
5. The consumer rules in §6 keep `tenant-commute-hub-boundary.md` intact while reflecting the two
   gap closures delivered by `FBP-006`.

### 7.2 For `FBP-007`

- `FBP-007` depends on `FBP-006`; this handoff confirms the external tenant UI cutover completed
  before `apps/tenant-portal-web` retirement.
- The parent spec already records the local verification gate required before the internal portal is
  retired.

### 7.3 For `FBP-014`

- The integrated cross-surface E2E suite should start tenant journeys from `tenant-commute-hub`,
  not from retired internal tenant portal flows.
- Use the routes in §4 as the tenant-side entry points for booking, reporting, billing, user/role,
  and audit evidence.

### 7.4 Known Non-Blocking Caveat

- The parent cutover spec records `npm run lint` in repo B as passing with pre-existing
  non-blocking warnings only (`MapPicker` hook dependency and several
  `react-refresh/only-export-components` notices). This is a warning freeze, not a cutover blocker.

---

## 8. Suggested Review / Closeout Commands

Reviewer approval:

```bash
AI_NAME=Claude \
REVIEW_FILE=support/sidecars/FBP-006/FBP-006-SIDECAR-BFF-HANDOFF.md \
REVIEW_NOTES_ZH='審查通過：handoff packet 正確反映 FBP-006 完成後的 tenant-commute-hub cutover 結果，已明示 webhook metadata update 與 tenant role catalog 兩個 gap 已被 parent task 關閉，且維持 repo B 純 UI consumer / 無本地 authority 的邊界。|回到 owner（Codex）以 NO_COMMIT_REQUIRED=1 做 done 收尾。' \
./scripts/ai-status.sh approve FBP-006-SIDECAR-BFF-HANDOFF \
  "Review approved. Handoff packet freezes the post-cutover tenant BFF surface, repo-B authority deletion boundary, and downstream consumer rules for FBP-006."
```

Owner closeout after approval:

```bash
AI_NAME=Codex NO_COMMIT_REQUIRED=1 \
./scripts/ai-status.sh done FBP-006-SIDECAR-BFF-HANDOFF \
  "Done: FBP-006 BFF/frontend handoff packet recorded the post-cutover tenant route matrix, authority deletion freeze, and downstream consumer rules without changing canonical truth."
```

---

This packet is a sidecar support artifact. It records the frontend/BFF handoff boundary established
by completed parent task `FBP-006`; it does not replace the parent cutover spec, boundary contract,
or machine-tracked task evidence.
