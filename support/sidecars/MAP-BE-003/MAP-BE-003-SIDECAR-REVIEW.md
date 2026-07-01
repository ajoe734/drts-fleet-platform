# MAP-BE-003 Review Packet & Evidence Summary

- **Sidecar Task:** `MAP-BE-003-SIDECAR-REVIEW`
- **Sidecar Kind:** `review_packet`
- **Parent Task:** `MAP-BE-003` - Geo and service-area API client coverage
- **Parent Owner / Reviewer:** `Codex` / `Claude2`
- **Current Sidecar Owner / Reviewer:** `Codex2` / `Codex`
- **Planning Anchor:** `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
- **Machine-Truth Basis:** parent row last_update `2026-06-30T14:52:11Z`; current sidecar row last_update `2026-07-01T03:44:35Z` with status `review`; same-day lifecycle also includes a reviewer-facing `review` snapshot at `2026-07-01T03:41:05Z` and a temporary `in_progress` refresh cycle at `2026-07-01T03:42:51Z`
- **Status:** REVIEW HANDOFF SNAPSHOT FOR CODEX - support artifact only; current machine truth is owner `Codex2`, reviewer `Codex`, status `review`, and this packet does not modify canonical truth, runtime behavior, or the parent lifecycle state

This packet exists because the parent `MAP-BE-003` review surface is split across
multiple worktrees. The reviewer worktree on `codex/map-be-003-sidecar-review`
is based on `dev` and does not contain the parent `packages/api-client` delta,
while the canonical root worktree still carries the parent API-client change set
as working-tree state. Reviewer `Codex` should therefore treat this packet as
the navigation layer for the parent review, not as a self-contained code delta.

---

## 1. Scope Boundary

In scope:

- summarize the current sidecar and parent machine-truth rows
- map each parent acceptance item to concrete evidence anchors
- explain where the parent review surface actually lives today
- call out branch lineage and downstream overlap that can mislead a reviewer

Out of scope:

- editing canonical implementation files
- changing `ai-status.json`, `current-work.md`, or `ai-activity-log.jsonl`
  outside official lifecycle commands
- approving or reopening the parent task from this sidecar
- inventing parent commit / push evidence that machine truth does not record

---

## 2. Machine-Truth Snapshot

### 2.1 Sidecar task

Current reviewer-facing row from
`AI_NAME=Codex scripts/ai-status.sh show MAP-BE-003-SIDECAR-REVIEW` records:

- `owner`: `Codex2`
- `reviewer`: `Codex`
- `status`: `review`
- `helper_parent`: `MAP-BE-003`
- `helper_kind`: `review_packet`
- `mutates_canonical`: `false`
- `next`: refreshed
  `support/sidecars/MAP-BE-003/MAP-BE-003-SIDECAR-REVIEW.md` to match the
  current machine-truth lifecycle: reviewer-facing review snapshot at
  `2026-07-01T03:41:05Z`, temporary `in_progress` refresh cycle at
  `2026-07-01T03:42:51Z`, and current owner/reviewer `Codex2` / `Codex`

Same-day lifecycle notes that matter to the reviewer:

- `2026-07-01T03:41:05Z`: owner `Codex2` handed the packet to reviewer `Codex`
- `2026-07-01T03:42:51Z`: reviewer `Codex` reopened because the packet still
  described the stale `2026-06-30` `review_approved` closeout snapshot
- `2026-07-01T03:44:35Z`: owner `Codex2` re-handed off after refreshing the
  queue snapshot, review outcome, lifecycle commands, and changelog for the
  current `Codex2` / `Codex` routing

Reviewer implication:

- the sidecar is currently waiting on `Codex` review
- it is **not** in `review_approved`
- it is **not** waiting on owner closeout / `done`

### 2.2 Parent task

`AI_NAME=Codex scripts/ai-status.sh show MAP-BE-003` records:

- `owner`: `Codex`
- `reviewer`: `Claude2`
- `status`: `review`
- `artifacts`:
  - `packages/api-client/`
  - `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
- acceptance:
  - `typed api-client methods added`
  - `serviceable/manual_review/not_serviceable/provider_unavailable responses covered`
  - `api-client typecheck passes`
  - `endpoint docs updated`

The parent `next` field says the owner already ran:

- `pnpm exec prettier --check` on touched client / API / test / docs files
- `pnpm --filter @drts/api-client typecheck`
- `pnpm exec vitest run tests/unit/api-client-geo-service-area.test.ts`
- `pnpm --filter @drts/api typecheck`
- `pnpm --filter @drts/api lint`
- `pnpm --filter @drts/api test -- --runInBand apps/api/tests/unit/service-area.service.test.ts`
- `pnpm lint:root`

This sidecar does not claim to have rerun those commands. It only packages the
review surface and the evidence map.

### 2.3 Current Codex queue relevant to this dispatch

Using filtered `scripts/ai-status.sh list` snapshots at the current review
handoff:

- `owner=Codex2 status=review`: `MAP-BE-003-SIDECAR-REVIEW`
- `reviewer=Codex status=review`: `MAP-BE-003-SIDECAR-REVIEW`
- `owner=Codex status=review_approved`: no matches

Practical meaning:

- this sidecar is the dispatch-relevant task currently waiting on `Codex`
- there is no `review_approved` closeout task for `Codex` to finalize right now

---

## 3. Review Surface Topology

### 3.1 Reviewer sidecar worktree

Current reviewer worktree:

- path:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-map-be-003-sidecar-review`
- branch: `codex/map-be-003-sidecar-review`

Observed state here:

- `docs/04-api/map-geofence-openapi-delta-20260630.md` is available and tracked
- `apps/api/tests/unit/service-area.service.test.ts` is available and tracked
- `tests/unit/api-client-geo-service-area.test.ts` is not present in this
  worktree
- `packages/api-client/src/index.ts` in this worktree does not expose the parent
  geo / service-area client methods

Reviewer implication:

- this worktree alone cannot prove the parent acceptance item
  `typed api-client methods added`

### 3.2 Canonical root worktree carrying the parent delta

Canonical root worktree:

- path: `/home/edna/workspace/drts-fleet-platform`
- branch: `phase2-tesla-sandbox-docs-20260625`
- HEAD: `22c5823d7`

Verified targeted status there:

- `M packages/api-client/src/index.ts`
- `?? apps/api/tests/unit/service-area.service.test.ts`
- `?? docs/04-api/map-geofence-openapi-delta-20260630.md`
- `?? tests/unit/api-client-geo-service-area.test.ts`

Additional topology note:

- there is no local or remote branch named `map-be-003`

Reviewer implication:

- the authoritative parent review surface currently depends on working-tree
  evidence in the canonical root, not on a dedicated `MAP-BE-003` task branch
  or inspectable parent commit

### 3.3 Helper lineage and downstream overlap

Historical support-packet lineage already exists on the reviewer branch
`origin/codex/map-be-003-sidecar-review`:

- `ecbfa6a9d` - `wip(MAP-BE-003-SIDECAR-REVIEW): anchor review packet`
- `f3ff69fb6` - `MAP-BE-003-SIDECAR-REVIEW: finalize review packet closeout`

Owner-refresh packet lineage also exists on
`codex2/map-be-003-sidecar-review`:

- `deb27cba9` - `wip(MAP-BE-003-SIDECAR-REVIEW): anchor review packet`
- `caf9513fa` - `MAP-BE-003-SIDECAR-REVIEW: refresh reviewer handoff packet`
- `ab440c666` - `wip(MAP-BE-003-SIDECAR-REVIEW): anchor post-handoff packet refresh`

These commits are useful as packet history only. The authoritative routing
question is answered by current machine truth: owner `Codex2`, reviewer
`Codex`, status `review`.

Separately, `dev` already contains downstream overlap from `MAP-BE-006`,
including the tracked API delta doc and a later-evolved
`apps/api/tests/unit/service-area.service.test.ts`. Reviewer `Codex` should not
treat the `dev` copy of `service-area.service.test.ts` as a byte-for-byte parent
artifact.

---

## 4. Acceptance-To-Evidence Map

### 4.1 `typed api-client methods added`

Primary evidence lives in the canonical root working tree:

- `packages/api-client/src/index.ts:320-345` defines `ApiClientError`
- `packages/api-client/src/index.ts:464-489` parses backend error envelopes and
  preserves `code`, `details`, `retryable`, and `traceId`
- `packages/api-client/src/index.ts:575-633` adds:
  - `searchGeo`
  - `resolveGeo`
  - `reverseGeo`
  - `getServiceAreaDefinitions`
  - `getServiceAreaGeoJson`
  - `evaluateServiceArea`
- `packages/api-client/src/index.ts:787-790` throws `ApiClientError` from the
  parsed backend envelope

Why this matters:

- the parent acceptance is not only about endpoint wrappers; it also depends on
  preserving structured backend error envelopes for frontend callers

### 4.2 `serviceable/manual_review/not_serviceable/provider_unavailable responses covered`

Primary api-client test evidence lives in the canonical root working tree:

- `tests/unit/api-client-geo-service-area.test.ts:90-128` covers typed
  `searchGeo` request construction
- `tests/unit/api-client-geo-service-area.test.ts:130-192` covers typed
  `resolveGeo` and `reverseGeo`
- `tests/unit/api-client-geo-service-area.test.ts:194-210` covers
  `getServiceAreaDefinitions` freshness metadata
- `tests/unit/api-client-geo-service-area.test.ts:212-235` covers
  `serviceable`, `manual_review`, and `not_serviceable`
- `tests/unit/api-client-geo-service-area.test.ts:237-263` preserves
  `GEO_PROVIDER_UNAVAILABLE`
- `tests/unit/api-client-geo-service-area.test.ts:265-295` preserves
  `INVALID_COORDINATE`

Supporting backend/service evidence:

- `apps/api/tests/unit/service-area.service.test.ts:43-58` asserts
  `serviceable`
- `apps/api/tests/unit/service-area.service.test.ts:60-103` asserts
  `not_serviceable`
- `apps/api/tests/unit/service-area.service.test.ts:106-131` asserts
  `manual_review`
- `apps/api/tests/unit/service-area.service.test.ts:186-214` asserts
  `generatedAt` freshness and GeoJSON export metadata

### 4.3 `api-client typecheck passes`

This sidecar can only preserve the machine-truth verification claim from the
parent `next` field:

- `pnpm --filter @drts/api-client typecheck`
- `pnpm exec vitest run tests/unit/api-client-geo-service-area.test.ts`
- `pnpm --filter @drts/api typecheck`
- `pnpm --filter @drts/api lint`
- `pnpm --filter @drts/api test -- --runInBand apps/api/tests/unit/service-area.service.test.ts`
- `pnpm lint:root`

If reviewer `Codex` wants fresh execution proof, those checks need to rerun from
the canonical root worktree that actually contains the parent delta.

### 4.4 `endpoint docs updated`

The API delta document is stable and inspectable from the reviewer sidecar
worktree:

- `docs/04-api/map-geofence-openapi-delta-20260630.md:13-44` documents the
  success/error envelope and `ApiClientError` behavior
- `docs/04-api/map-geofence-openapi-delta-20260630.md:74-132` documents
  `/api/geo/search`, `/api/geo/resolve`, and `/api/geo/reverse`
- `docs/04-api/map-geofence-openapi-delta-20260630.md:136-224` documents
  service-area definitions, admin GeoJSON, lifecycle endpoints, evaluation
  decisions, and error codes
- `docs/04-api/map-geofence-openapi-delta-20260630.md:226-247` maps client
  methods to endpoints

Secondary corroboration:

- `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md:287-310`
  defines `MAP-BE-003` as the API-client / OpenAPI coverage slice
- `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md:47`
  records that `MAP-BE-003` added typed API-client coverage and endpoint delta
  docs
- `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md:164-165`
  reiterates that service-area client methods and OpenAPI delta documentation
  were added in `MAP-BE-003`
- `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md:288`
  names the expected client methods:
  `searchGeo`, `resolveGeo`, `reverseGeo`, `getServiceAreaDefinitions`, and
  `evaluateServiceArea`

---

## 5. Reviewer Focus

Reviewer `Codex` should confirm:

1. This packet stays support-only and does not mutate canonical truth.
2. It correctly records that parent `MAP-BE-003` remains in `review`.
3. It correctly records the same-day sidecar lifecycle:
   - reviewer-facing `review` snapshot at `2026-07-01T03:41:05Z`
   - temporary `in_progress` refresh cycle at `2026-07-01T03:42:51Z`
   - current `review` handoff at `2026-07-01T03:44:35Z`
4. It correctly distinguishes the two review surfaces:
   - canonical-root working-tree delta for `packages/api-client` and
     `tests/unit/api-client-geo-service-area.test.ts`
   - reviewer-branch tracked doc plus downstream-evolved service-area test
5. It maps each acceptance item to concrete, inspectable anchors.
6. It does not invent a parent task commit, branch, or push that machine truth
   does not currently record.

Practical review order:

1. Read this packet.
2. Inspect `packages/api-client/src/index.ts` and
   `tests/unit/api-client-geo-service-area.test.ts` in the canonical root
   worktree.
3. Use the tracked `docs/04-api/map-geofence-openapi-delta-20260630.md` in this
   reviewer worktree for doc review.
4. Treat `apps/api/tests/unit/service-area.service.test.ts` in this reviewer
   worktree as downstream context, not as the exact parent snapshot.

Suggested approval wording:

> `審查通過：MAP-BE-003 sidecar review packet 已正確對齊 current machine truth（sidecar owner/reviewer 為 Codex2/Codex，當前狀態為 review，parent MAP-BE-003 仍為 review），並清楚區分 reviewer-facing review snapshot、temporary in_progress refresh cycle，以及 parent review surface 的兩個位置：canonical root working tree 內未提交的 api-client / api-client test delta，與 reviewer branch 可見的 API delta doc / downstream-evolved service-area test。packet 已把 acceptance 對應到具體 evidence anchors；support artifact only，未改 canonical truth。`

Suggested reopen wording:

> `packet needs revision: [machine-truth mismatch / wrong lifecycle timestamp / wrong worktree attribution / incorrect evidence mapping / support-scope violation]`

---

## 6. Lifecycle Commands

Historical reopen that created the temporary refresh cycle:

```bash
AI_NAME=Codex scripts/ai-status.sh reopen MAP-BE-003-SIDECAR-REVIEW \
  "packet needs revision: support/sidecars/MAP-BE-003/MAP-BE-003-SIDECAR-REVIEW.md still describes the old 2026-06-30 review_approved closeout snapshot (owner=Codex, reviewer=Codex2, pending done). Current machine truth on 2026-07-01T03:41:05Z is owner=Codex2, reviewer=Codex, status=review. The queue snapshot, review outcome, lifecycle commands, and changelog therefore misroute the current handoff and need a fresh packet refresh that distinguishes the 2026-07-01 review snapshot from the temporary in_progress refresh cycle."
```

Owner handoff back to reviewer `Codex`:

```bash
AI_NAME=Codex2 scripts/ai-status.sh handoff MAP-BE-003-SIDECAR-REVIEW Codex "Refreshed support/sidecars/MAP-BE-003/MAP-BE-003-SIDECAR-REVIEW.md to match the current machine-truth lifecycle: reviewer-facing review snapshot at 2026-07-01T03:41:05Z, temporary in_progress refresh cycle at 2026-07-01T03:42:51Z, and current owner/reviewer Codex2/Codex. The packet remains support-only, keeps parent MAP-BE-003 in review, and maps the parent acceptance items to the split review surface without changing canonical truth."
```

Reviewer approval:

```bash
AI_NAME=Codex scripts/ai-status.sh approve MAP-BE-003-SIDECAR-REVIEW \
  "審查通過：MAP-BE-003 sidecar review packet 已正確對齊 current machine truth（sidecar owner/reviewer 為 Codex2/Codex，當前狀態為 review，parent MAP-BE-003 仍為 review），並清楚區分 reviewer-facing review snapshot、temporary in_progress refresh cycle，以及 parent review surface 的兩個位置：canonical root working tree 內未提交的 api-client / api-client test delta，與 reviewer branch 可見的 API delta doc / downstream-evolved service-area test。packet 已把 acceptance 對應到具體 evidence anchors；support artifact only，未改 canonical truth。"
```

Reviewer reopen if needed:

```bash
AI_NAME=Codex scripts/ai-status.sh reopen MAP-BE-003-SIDECAR-REVIEW \
  "packet needs revision: [machine-truth mismatch / wrong lifecycle timestamp / wrong worktree attribution / incorrect evidence mapping / support-scope violation]"
```

---

## 7. Change Log

- 2026-06-30 - Created the initial sidecar review packet and recorded that the
  parent review surface is split across the sidecar `dev` worktree and the
  canonical-root working tree.
- 2026-07-01 - Refreshed the packet for the current `Codex2` / `Codex` routing
  instead of the older `Codex` / `Codex2` closeout snapshot.
- 2026-07-01 - Recorded the reviewer-facing `review` snapshot at
  `2026-07-01T03:41:05Z`, the temporary `in_progress` refresh cycle at
  `2026-07-01T03:42:51Z`, and the current `review` handoff at
  `2026-07-01T03:44:35Z`.
- 2026-07-01 - Preserved earlier `codex/*` and `codex2/*` support-packet
  lineage as historical context only, without treating it as current machine
  truth.
