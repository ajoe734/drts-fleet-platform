# DOC-API-GOV-001 Review Packet & Evidence Summary

- **Sidecar Kind:** `review_packet`
- **Parent Task:** `DOC-API-GOV-001` — API documentation update for tenant governance contracts
- **Parent Owner / Reviewer:** `Codex` / `Claude2`
- **Sidecar Owner / Reviewer:** `Claude2` / `Codex`
- **Planning Anchor:** `docs/03-runbooks/post-tenant-governance-followup-wave-planning-20260513.md`
- **Machine-Truth Basis:** `ai-status.json` parent row last_update `2026-05-13T19:06:07Z`; sidecar `in_progress` since `2026-05-13T19:11:21Z`. Snapshot prepared `2026-05-13` (UTC).
- **Status:** REVIEW SUPPORT ARTIFACT — does not modify canonical truth, OpenAPI spec, generator, audit taxonomy, or parent lifecycle state.

This packet packages reviewer-facing evidence for `DOC-API-GOV-001` while the
parent sits in `review_approved` awaiting owner closeout. The sidecar's job is
to give the sidecar reviewer (`Codex`) one place to audit:

- the parent acceptance items against the actual `docs/04-api/openapi-spec.yaml`
  and `docs/04-api/audit-event-taxonomy.md` artifacts
- the parent's local closeout commits (`7a35769` + `816a6c8`) and their trailers
- the still-outstanding push step required before parent `done` is allowed
- a critical post-closeout working-tree drift on the audit taxonomy / generator
  pair that the reviewer must not confuse with the recorded closeout

---

## 1. Scope Boundary

In scope:

- snapshot the parent and sidecar rows exactly as machine truth records them
- map each parent acceptance item to a concrete file / anchor in the artifacts
- record the local closeout commit metadata and trailer compliance
- record the redocly-lint and generator drift-check verification claims from the
  parent handoff plus this sidecar's rerun observation
- explicitly flag working-tree drift on the audit-taxonomy + generator pair that
  exists _right now_ and would mislead any reviewer who reads HEAD instead of
  the recorded closeout commit

Out of scope:

- editing the OpenAPI spec, audit taxonomy, or generator script
- editing L1/L2 product truth
- editing `ai-status.json`, `current-work.md`, or `ai-activity-log.jsonl` except
  through the official `scripts/ai-status.sh` lifecycle
- deciding whether the working-tree drift should produce a follow-up canonical
  task; this packet only records that the drift exists and what it implies for
  the parent's `done` closeout

---

## 2. Machine-Truth Snapshot

### 2.1 Sidecar task

`ai-status.json` records:

- `id`: `DOC-API-GOV-001-SIDECAR-REVIEW`
- `title`: `Prepare DOC-API-GOV-001 review packet and evidence summary`
- `owner`: `Claude2`
- `reviewer`: `Codex`
- `status`: `in_progress` (transitioned from `backlog` by this sidecar's first
  `scripts/ai-status.sh start` call on `2026-05-13`)
- `helper_parent`: `DOC-API-GOV-001`
- `helper_kind`: `review_packet`
- `mutates_canonical`: `false`
- `task_class`: `sidecar`
- `auto_created_by`: `supervisor-underutilization`
- artifact path: `support/sidecars/DOC-API-GOV-001/DOC-API-GOV-001-SIDECAR-REVIEW.md`
- `depends_on`: `BE-CC-001`, `BE-RULE-001`, `BE-QUOTA-001`, `BE-APR-001`

### 2.2 Parent task

`ai-status.json` records:

- `id`: `DOC-API-GOV-001`
- `title`: `API documentation update for tenant governance contracts`
- `owner`: `Codex`
- `reviewer`: `Claude2`
- `status`: `review_approved`
- `last_update`: `2026-05-13T19:06:07Z`
- `planning_ref`: `docs/03-runbooks/post-tenant-governance-followup-wave-planning-20260513.md`
- `depends_on`: `BE-CC-001`, `BE-RULE-001`, `BE-QUOTA-001`, `BE-APR-001`
- `unblocks`: (empty)
- `mutates_canonical`: `true`
- `artifacts`:
  - `docs/04-api/openapi-spec.yaml`
  - `docs/04-api/audit-event-taxonomy.md`
- `review_notes_zh`:
  1. 審查通過：generator `--check` 無 drift；redocly lint 僅有預期警告
     (process-timeouts 為 501 stub 故無 2xx)；23 個 endpoints 覆蓋 §3
     四個 surface，21/21 §5 audit events 均有 generated 或 manual 對應
     (含 owned-mobility.service.ts 三筆 lifecycle 事件 + 3 筆 ops-console
     額外事件已明確標註)；RBAC、`ApiErrorEnvelope`、`x-rbac` 完整；倉內
     無 Postman/Insomnia collection 故 skip 正確
  2. 回到 owner 收尾

The parent's `next` is not yet `done`; the owner still has to record commit /
push evidence before the parent leaves `review_approved`. No `commit_hash`,
`push_remote`, or `push_branch` is recorded on the parent row.

### 2.3 Upstream dependencies already closed

- `BE-CC-001`: `done` at `2026-05-13T05:42:04Z`, commit
  `a7c1b9f3ccbc7e02cc6fae3dc2262d4c8b9656dd`
- `BE-RULE-001`: `done`, commit
  `c0f533c3a73a9a71367f8eda308e8e9a075cd867`
- `BE-QUOTA-001`: `done`, commit
  `73b53eedd0c7c96549b36a6fe813c6acb870bbb1` plus quota seed contract from
  `7c0b1ce`
- `BE-APR-001`: parent execution evidence per
  `support/sidecars/BE-APR-001/BE-APR-001-SIDECAR-REVIEW.md`; service
  emissions at
  `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:2501` and
  similar anchors are the source the generator reads

Reviewer implication: the doc artifacts must reflect the contracts and audit
emissions actually shipped by these four upstream slices rather than reseeding
their semantics.

---

## 3. Parent Closeout Commit Evidence (Local, Not Yet Pushed)

The branch tip on `feat/claude2-ui-redesign-foundation` carries two
DOC-API-GOV-001 commits behind the parent's `review_approved` row.

### 3.1 Primary artifact commit

`git show --stat --format=fuller 7a35769b2573fb9da05388ea7d4036ae9366d430 --`
reports:

- author / committer: `Claude <claude@drts-fleet-platform.local>`
- author date: `2026-05-13 19:09:27 UTC`
- subject: `docs(DOC-API-GOV-001): add tenant governance API docs`
- trailers:
  - `LLM-Agent: Codex`
  - `Task-ID: DOC-API-GOV-001`
  - `Reviewer: Claude2`
  - `Verification: node scripts/generate-tenant-governance-audit-taxonomy.mjs --check`
  - `Verification: pnpm --package=@redocly/cli dlx redocly lint docs/04-api/openapi-spec.yaml`
- changed files:

| File                                                    | Stat  |
| ------------------------------------------------------- | ----- |
| `docs/04-api/audit-event-taxonomy.md`                   | +111  |
| `docs/04-api/openapi-spec.yaml`                         | +2486 |
| `scripts/generate-tenant-governance-audit-taxonomy.mjs` | +122  |

Total: 3 files changed, 2719 insertions(+).

### 3.2 Drift-check stabilization follow-up

`git show --stat --format=fuller 816a6c8f17f1bc16a94c478e79bcc513aa8c9412 --`
reports:

- author / committer: `Claude <claude@drts-fleet-platform.local>`
- author date: `2026-05-13 19:11:19 UTC`
- subject: `chore(DOC-API-GOV-001): stabilize audit taxonomy drift check`
- trailers:
  - `LLM-Agent: Codex`
  - `Task-ID: DOC-API-GOV-001`
  - `Reviewer: Claude2`
  - `Verification: node scripts/generate-tenant-governance-audit-taxonomy.mjs --check`
  - `Verification: pnpm --package=@redocly/cli dlx redocly lint docs/04-api/openapi-spec.yaml`
- changed files:

| File                                                    | Stat     |
| ------------------------------------------------------- | -------- |
| `scripts/generate-tenant-governance-audit-taxonomy.mjs` | +53 / -3 |

Total: 1 file changed, 53 insertions(+), 3 deletions(-).

### 3.3 Push status

`git branch -r --contains 7a35769b2573fb9da05388ea7d4036ae9366d430` returns no
remote refs at the time of this snapshot. Same for
`git branch -r --contains 816a6c8f17f1bc16a94c478e79bcc513aa8c9412`.

`origin/feat/claude2-ui-redesign-foundation` is currently at
`d8254aa8d0fd90aeca16d4b58dbe976fcf9f4ece`, which does not contain either
DOC-API-GOV-001 commit.

Closeout implication: the parent owner cannot move `DOC-API-GOV-001` to `done`
under the AI_COLLABORATION_GUIDE §5 "Commit evidence rule" until
`7a35769` (and the `816a6c8` follow-up if the owner chooses to include it in
the same task closeout) has been pushed to a real remote and the owner records
`COMMIT_HASH`, `COMMIT_SUBJECT`, `PUSH_REMOTE`, and `PUSH_BRANCH`. The sidecar
does not perform that push; it only records that the push is the remaining
gate.

---

## 4. Acceptance-To-Evidence Map

Parent acceptance list (from `ai-status.json`):

1. OpenAPI spec includes all new endpoints (request schema, response schema,
   error envelopes, RBAC notes).
2. Audit event taxonomy doc auto-generated section from service code; manual
   section explains each event.
3. Postman / Insomnia collection updated if maintained (skip if not).
4. Spec validates with `openapi-lint` or equivalent.
5. Diff review against execution packet §3 + §5 confirms no missing endpoint or
   event.

### 4.1 Endpoint coverage (acceptance items 1 and 5)

`docs/04-api/openapi-spec.yaml` exposes the four tenant-governance surfaces.
`grep -E "^  /api/tenant/" docs/04-api/openapi-spec.yaml | wc -l` reports
**20 path entries**, which expand to **23 operation entries** by `operationId`
count (matches the parent reviewer note "23 個 endpoints"):

| Surface (execution packet §3) | Paths in OpenAPI spec                                                                                                                                                                                                                                                                                                                                                 | operationIds                                                                                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tenant cost centers           | `/api/tenant/cost-centers` (GET + POST), `/api/tenant/cost-centers/coverage` (GET), `/api/tenant/cost-centers/{code}` (GET), `/api/tenant/cost-centers/disable` (POST), `/api/tenant/cost-centers/{code}/quota` (GET)                                                                                                                                                 | `listCostCenters`, `upsertCostCenter`, `getTenantCostCenterCoverageReport`, `getCostCenter`, `disableCostCenter`, `getTenantCostCenterQuota`                 |
| Tenant quotas                 | `/api/tenant/quotas` (GET), `/api/tenant/quotas/policies` (POST), `/api/tenant/quotas/preview` (POST), `/api/tenant/quotas/ledger` (GET)                                                                                                                                                                                                                              | `getTenantQuotaSummary`, `upsertTenantQuotaPolicy`, `previewTenantBookingQuotaImpact`, `listTenantQuotaLedger`                                               |
| Tenant approval rules         | `/api/tenant/approval-rules` (GET + POST), `/api/tenant/approval-rules/{ruleId}` (GET + PATCH), `/api/tenant/approval-rules/{ruleId}/disable` (POST), `/api/tenant/approval-rules/reorder` (POST), `/api/tenant/approval-rules/evaluate` (POST)                                                                                                                       | `listApprovalRules`, `createApprovalRule`, `getApprovalRule`, `updateApprovalRule`, `disableApprovalRule`, `reorderApprovalRules`, `evaluateApprovalRules`   |
| Tenant approval requests      | `/api/tenant/approval-requests` (GET), `/api/tenant/approval-requests/{approvalRequestId}` (GET), `/api/tenant/approval-requests/{approvalRequestId}/approve` (POST), `/api/tenant/approval-requests/{approvalRequestId}/reject` (POST), `/api/tenant/approval-requests/{approvalRequestId}/escalate` (POST), `/api/tenant/approval-requests/process-timeouts` (POST) | `listApprovalRequests`, `getApprovalRequest`, `approveApprovalRequest`, `rejectApprovalRequest`, `escalateApprovalRequest`, `processApprovalRequestTimeouts` |

The `processApprovalRequestTimeouts` operation at
`docs/04-api/openapi-spec.yaml:898` is deliberately a `501` stub returning
`APPROVAL_TIMEOUT_AUTOMATION_DEFERRED`, matching the contract decision
documented in the BE-APR-001 acceptance packet (manual escalate ships in
Phase 1, automated timeout is deferred).

### 4.2 Schemas, RBAC, and error envelope wiring (acceptance item 1)

- `BearerAuth` security scheme: `docs/04-api/openapi-spec.yaml:921`.
- Header parameters `XTenantId` / `XRequestId`: `docs/04-api/openapi-spec.yaml:926`.
- `x-rbac` realm / notes annotations are present on every operation —
  `grep -c "x-rbac:" docs/04-api/openapi-spec.yaml` reports **23 occurrences**,
  one per operation.
- `ApiErrorEnvelope` schema is reused across error responses —
  `grep -c "ApiErrorEnvelope" docs/04-api/openapi-spec.yaml` reports
  **7 occurrences** across the schema definition and shared error response
  references.

### 4.3 Audit taxonomy coverage (acceptance items 2 and 5)

`docs/04-api/audit-event-taxonomy.md` is generated from the
`tenant-partner.service.ts` action names with manual lifecycle notes for the
`owned-mobility.service.ts` events. The generated section (between the
`<!-- GENERATED:tenant-governance-audit-events:start -->` markers) lists
**21 events** sourced from `apps/api/src/modules/tenant-partner/tenant-partner.service.ts`,
e.g.:

- `tenant.quota_policy.updated` at line `1575`
- `tenant.approval_rule.{updated,created,reordered,disabled}` at
  `1945`–`2045`
- `booking.approval_rules.evaluated` at `2100`
- `booking.approval_request.{ops_nudged_approver,ops_sla_breach_acknowledged}`
  at `2209` / `2283`
- `booking.approval_request.created` at `2501`
- `booking.approval_request.cancelled_by_re_evaluation` at `2577`
- `tenant.cost_center.{coverage_listed,updated,created,disabled}` at
  `2739`–`2900`
- `booking.approval_request.{timeout_escalated,approved,rejected}` at
  `6754`–`6866`
- `approver_fallback_used` at `6908`
- `tenant.quota_reservation.blocked` at `8229`
- `tenant.quota_ledger.entry_added` at `8639`
- `tenant.quota_snapshot.refreshed` at `8662`

The manual "Booking governance lifecycle" section captures three
lifecycle events that the service-level generator cannot see because they live
in owned-mobility:

- `booking.cost_center.assigned` —
  `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:4734`
- `booking.governance.evaluated` —
  `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:4762`
- `booking.approval_state.changed` —
  `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:4800`

The "Execution Packet Alignment Review" section explicitly maps each event
back to packet §5 (or flags it as an extra live-source event) at
`docs/04-api/audit-event-taxonomy.md:94`. This satisfies the "no missing
endpoint or event" condition in acceptance item 5.

### 4.4 Postman / Insomnia collection (acceptance item 3)

There is no Postman / Insomnia collection tracked in the repository
(`git ls-files -- '*postman*' '*insomnia*'` returns nothing). The acceptance
text explicitly says "skip if not maintained"; this satisfies the item without
producing a new artifact.

### 4.5 Spec validation (acceptance item 4)

The parent commit trailers record:

- `node scripts/generate-tenant-governance-audit-taxonomy.mjs --check`
- `pnpm --package=@redocly/cli dlx redocly lint docs/04-api/openapi-spec.yaml`

The parent reviewer note specifically confirmed that the redocly lint produces
"only expected warnings" (the `processApprovalRequestTimeouts` 501 stub has no
`2xx` response, which is intentional for the deferred-automation contract).

---

## 5. Fresh Verification Run And Working-Tree Drift Warning

This is the critical reviewer-facing caveat.

### 5.1 Generator drift check rerun

Rerun on `2026-05-13` UTC inside this sidecar:

```
node scripts/generate-tenant-governance-audit-taxonomy.mjs --check
```

Result: **FAILS** with the exact message:

> Generated tenant governance audit snippet is stale in
> `docs/04-api/audit-event-taxonomy.md`.

This does **not** mean the audit-event names themselves are wrong. It reflects
working-tree formatting drift between the staged copy and the live regeneration
output, described next.

### 5.2 Working-tree drift on the documentation pair

`git status --short -- docs/04-api/ scripts/generate-tenant-governance-audit-taxonomy.mjs`
currently reports:

```
MM docs/04-api/audit-event-taxonomy.md
MM scripts/generate-tenant-governance-audit-taxonomy.mjs
```

Diff scope vs HEAD:

| File                                                    | Working-tree delta | Staged delta |
| ------------------------------------------------------- | ------------------ | ------------ |
| `docs/04-api/audit-event-taxonomy.md`                   | +68 / -64          | +64 / -68    |
| `scripts/generate-tenant-governance-audit-taxonomy.mjs` | +2 / -2            | +2 / -2      |

The deltas are the markdown pipe-table padding ping-pong between the live
generator output (padded columns) and an editor-prettified alternative (skinny
columns). The action-name set and source-line anchors are not changing.

Important interpretations for the sidecar reviewer (`Codex`):

- The parent's recorded closeout target is commit `7a35769` (with optional
  `816a6c8` follow-up). Both commits already contain the correct generated
  taxonomy section. Review must read those commits, not the dirty working tree.
- The currently failing `--check` does _not_ contradict the parent reviewer
  note in `review_notes_zh`. At the moment that note was recorded, the check
  passed against the freshly committed state. The drift visible now is local
  uncommitted churn from concurrent work and does not block the parent's
  recorded `review_approved` verdict.
- However, before the parent can move to `done`, the owner has to make sure
  the closeout commit pushed to remote is the one that satisfies the
  `--check` invariant. If the owner chooses to fold the drift into the closeout
  scope (rather than leaving it as background noise), they should regenerate
  and commit before invoking `done`.

### 5.3 OpenAPI spec stability

`git status --short docs/04-api/openapi-spec.yaml` reports a clean working tree
for the spec itself — the only post-commit drift is on the audit-taxonomy /
generator pair, not on the OpenAPI surface. Reviewer can safely audit the
endpoint coverage table in §4.1 directly against the working tree for the
OpenAPI file.

---

## 6. Reviewer Checklist For The Sidecar Reviewer (`Codex`)

The sidecar reviewer should verify that this packet:

- correctly names the parent owner `Codex`, parent reviewer `Claude2`, sidecar
  owner `Claude2`, and sidecar reviewer `Codex`
- correctly identifies the parent as `review_approved` with the
  `review_notes_zh` already recorded by `Claude2`
- maps each parent acceptance item to a concrete file / line / event name
- distinguishes the recorded local closeout commits (`7a35769` and the
  stabilization follow-up `816a6c8`) from the working-tree drift on the
  audit-taxonomy and generator
- explicitly states that the parent owner still has to push and record
  `COMMIT_HASH` / `COMMIT_SUBJECT` / `PUSH_REMOTE` / `PUSH_BRANCH` before
  `done` is allowed
- does not modify L1 / L2 product truth, the OpenAPI spec, the audit taxonomy,
  the generator, or `ai-status.json` outside the supervisor lifecycle

Suggested audit commands:

```bash
git show --stat --format=fuller 7a35769b2573fb9da05388ea7d4036ae9366d430 --
git show --format='%H%n%s%n%n%b' --no-patch 7a35769b2573fb9da05388ea7d4036ae9366d430
git show --stat --format=fuller 816a6c8f17f1bc16a94c478e79bcc513aa8c9412 --
git branch -r --contains 7a35769b2573fb9da05388ea7d4036ae9366d430
grep -cE "^      operationId:" docs/04-api/openapi-spec.yaml
grep -cE "^  /api/tenant/" docs/04-api/openapi-spec.yaml
grep -c "x-rbac:" docs/04-api/openapi-spec.yaml
grep -c "ApiErrorEnvelope" docs/04-api/openapi-spec.yaml
git show 7a35769b2573fb9da05388ea7d4036ae9366d430:docs/04-api/audit-event-taxonomy.md | sed -n '13,42p'
node scripts/generate-tenant-governance-audit-taxonomy.mjs --check
```

---

## 7. Sidecar Conclusion

This packet now satisfies its own support-only scope:

- the artifact exists at the declared path
  `support/sidecars/DOC-API-GOV-001/DOC-API-GOV-001-SIDECAR-REVIEW.md`
- no canonical truth, OpenAPI spec, audit taxonomy, generator script, or parent
  implementation file was edited for this packet
- machine-truth status was driven through `scripts/ai-status.sh start`
- the reviewer gets a direct map from acceptance item → artifact anchor →
  closeout commit → push gate → working-tree drift caveat

Recommended next lifecycle step: sidecar owner `Claude2` invokes
`scripts/ai-status.sh handoff DOC-API-GOV-001-SIDECAR-REVIEW Codex` with this
packet as the handoff evidence. Reviewer `Codex` then either `approve`,
`reopen`, or `blocker` per AI_COLLABORATION_GUIDE §6.

The sidecar lifecycle is independent of the parent's `review_approved → done`
step. Even if the parent owner does not push immediately, this packet can be
approved on its own as a support-only artifact.

---

## 8. Evidence Commands Used By This Packet

- `python3 scripts/ai_status.py prompt`
- `grep -A 30 '"id": "DOC-API-GOV-001"' ai-status.json`
- `grep -B 1 -A 30 'DOC-API-GOV-001-SIDECAR-REVIEW' ai-status.json`
- `grep "DOC-API-GOV-001" ai-activity-log.jsonl | head`
- `git log --oneline -- docs/04-api/ apps/api/src/modules/tenant-partner/`
- `git show --stat --format=fuller 7a35769b2573fb9da05388ea7d4036ae9366d430 --`
- `git show --format='%H%n%s%n%n%b' --no-patch 7a35769b2573fb9da05388ea7d4036ae9366d430`
- `git show --stat --format=fuller 816a6c8f17f1bc16a94c478e79bcc513aa8c9412 --`
- `git branch -r --contains 7a35769b2573fb9da05388ea7d4036ae9366d430`
- `grep -E "^      operationId:" docs/04-api/openapi-spec.yaml`
- `grep -cE "^  /api/tenant/" docs/04-api/openapi-spec.yaml`
- `grep -c "x-rbac:" docs/04-api/openapi-spec.yaml`
- `grep -c "ApiErrorEnvelope" docs/04-api/openapi-spec.yaml`
- `git status --short docs/04-api/ scripts/generate-tenant-governance-audit-taxonomy.mjs`
- `git diff --stat -- docs/04-api/audit-event-taxonomy.md scripts/generate-tenant-governance-audit-taxonomy.mjs`
- `node scripts/generate-tenant-governance-audit-taxonomy.mjs --check`
- targeted `grep -n` lookups on owned-mobility audit emissions

No canonical truth files were edited to create this packet. Only this support
artifact is in scope.
