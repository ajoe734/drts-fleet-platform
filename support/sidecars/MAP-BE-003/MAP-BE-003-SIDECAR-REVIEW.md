# MAP-BE-003 Review Packet & Evidence Summary

- **Sidecar Task:** `MAP-BE-003-SIDECAR-REVIEW`
- **Sidecar Kind:** `review_packet`
- **Parent Task:** `MAP-BE-003` - Geo and service-area API client coverage
- **Parent Owner / Reviewer:** `Codex` / `Claude2`
- **Current Sidecar Owner / Reviewer:** `Codex2` / `Codex`
- **Planning Anchor:** `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
- **Machine-Truth Basis:** parent row last_update `2026-06-30T14:52:11Z`; sidecar row last_update `2026-07-01T03:36:58Z` with status `in_progress`
- **Status:** IN PROGRESS FOR REVIEWER HANDOFF - support artifact only; owner `Codex2` is refreshing the packet for reviewer `Codex` and does not modify canonical truth, runtime behavior, or the parent lifecycle state

This packet exists because the parent `MAP-BE-003` review surface is split across
multiple worktrees. The assigned sidecar branch is based on `dev` and does not
contain the parent `packages/api-client` delta, while the canonical root
worktree still carries the parent API-client change set as working-tree state.
Reviewer `Codex` should therefore treat this packet as the navigation layer for
the parent review, not as a self-contained code delta.

---

## 1. Scope Boundary

In scope:

- summarize the current sidecar and parent machine-truth rows
- map each parent acceptance item to concrete evidence anchors
- explain where the parent review surface actually lives today
- call out downstream overlap on `dev` that can mislead a reviewer

Out of scope:

- editing canonical implementation files
- changing `ai-status.json`, `current-work.md`, or `ai-activity-log.jsonl`
  outside official lifecycle commands
- approving or reopening the parent task from this sidecar
- inventing parent commit / push evidence that machine truth does not record

---

## 2. Machine-Truth Snapshot

### 2.1 Sidecar task

`AI_NAME=Codex2 scripts/ai-status.sh show MAP-BE-003-SIDECAR-REVIEW` currently
records:

- `owner`: `Codex2`
- `reviewer`: `Codex`
- `status`: `in_progress`
- `helper_parent`: `MAP-BE-003`
- `helper_kind`: `review_packet`
- `mutates_canonical`: `false`
- `next`: `Refreshing sidecar review packet to match machine truth owner=Codex2 reviewer=Codex status=in_progress before reviewer handoff.`

Dispatch note:

- the supervisor reassigned this helper from the prior lane to `Codex2`
  because the earlier owner lane hit a repeated terminal loop
- the reviewer target for this current lifecycle is `Codex`
- an earlier support packet lineage exists on `origin/codex/map-be-003-sidecar-review`,
  but it reflects a prior lifecycle snapshot and this branch is the current
  machine-truth owner branch

### 2.2 Parent task

`AI_NAME=Codex2 scripts/ai-status.sh show MAP-BE-003` records:

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

---

## 3. Review Surface Topology

### 3.1 Assigned sidecar worktree

Current sidecar worktree:

- path:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-map-be-003-sidecar-review`
- branch: `codex2/map-be-003-sidecar-review`
- baseline: `origin/dev` at `f452f019f`

Observed state here:

- `docs/04-api/map-geofence-openapi-delta-20260630.md` is available and tracked
- `tests/unit/api-client-geo-service-area.test.ts` is not present in this
  worktree
- `packages/api-client/src/index.ts` in this worktree does not expose the parent
  geo/service-area client methods

Reviewer implication:

- this worktree alone cannot prove the parent acceptance item
  `typed api-client methods added`

### 3.2 Canonical root worktree carrying the parent delta

Canonical root worktree:

- path: `/home/edna/workspace/drts-fleet-platform`
- branch: `phase2-tesla-sandbox-docs-20260625`

Verified targeted status there:

- `M packages/api-client/src/index.ts`
- `?? apps/api/tests/unit/service-area.service.test.ts`
- `?? docs/04-api/map-geofence-openapi-delta-20260630.md`
- `?? tests/unit/api-client-geo-service-area.test.ts`

Reviewer implication:

- the authoritative parent review surface currently depends on working-tree
  evidence in the canonical root, not on a dedicated `MAP-BE-003` commit visible
  from this sidecar branch

### 3.3 Earlier helper lineage and downstream overlap

Two earlier support-only packet commits already exist on
`origin/codex/map-be-003-sidecar-review`:

- `ecbfa6a9d` - `wip(MAP-BE-003-SIDECAR-REVIEW): anchor review packet`
- `f3ff69fb6` - `MAP-BE-003-SIDECAR-REVIEW: finalize review packet closeout`

Those commits are useful as historical packet lineage, but they capture an older
`Codex` owner / `Codex2` reviewer closeout path and are not the current
machine-truth owner branch for this helper task.

Separately, `dev` already contains downstream overlap from `MAP-BE-006`,
including the tracked API delta doc and a later-evolved
`apps/api/tests/unit/service-area.service.test.ts`. Reviewer `Codex` should
avoid treating the `dev` copy of `service-area.service.test.ts` as a byte-for-byte
parent artifact.

---

## 4. Acceptance-To-Evidence Map

### 4.1 `typed api-client methods added`

Primary evidence lives in the canonical root working tree:

- `packages/api-client/src/index.ts:320-340` defines `ApiClientError`
- `packages/api-client/src/index.ts:464-489` parses backend error envelopes and
  preserves `code`, `details`, `retryable`, and `traceId`
- `packages/api-client/src/index.ts:575-633` adds:
  - `searchGeo`
  - `resolveGeo`
  - `reverseGeo`
  - `getServiceAreaDefinitions`
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

The API delta document is stable and inspectable from this sidecar worktree:

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

- `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
  defines `MAP-BE-003` as the api-client / API-doc coverage slice
- `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md:288`
  names the expected client methods:
  `searchGeo`, `resolveGeo`, `reverseGeo`, `getServiceAreaDefinitions`,
  `evaluateServiceArea`

---

## 5. Reviewer Focus

Reviewer `Codex` should confirm:

1. This packet stays support-only and does not mutate canonical truth.
2. It correctly records that parent `MAP-BE-003` remains in `review`.
3. It correctly distinguishes the two review surfaces:
   - canonical-root working-tree delta for `packages/api-client` and
     `tests/unit/api-client-geo-service-area.test.ts`
   - `dev`-visible tracked doc plus downstream-evolved service-area test
4. It maps each acceptance item to concrete, inspectable anchors.
5. It does not invent a parent task commit, branch, or push that machine truth
   does not currently record.

Suggested approval wording:

> `審查通過：MAP-BE-003 sidecar review packet 已正確對齊 current machine truth（parent MAP-BE-003 仍為 review，sidecar owner/reviewer 為 Codex2/Codex），並清楚區分 parent review surface 的兩個位置：canonical root working tree 內未提交的 api-client / api-client test delta，以及 dev 可見的 API delta doc / downstream-evolved service-area test。packet 已把 acceptance 對應到具體 evidence anchors；support artifact only，未改 canonical truth。`

Suggested reopen wording:

> `packet needs revision: [machine-truth mismatch / wrong worktree attribution / incorrect evidence mapping / support-scope violation]`

Reviewer queue note:

- while this sidecar remains `in_progress`, reviewer `Codex` should treat this
  packet as pre-handoff material
- once owner `Codex2` runs the handoff command below, the sidecar should enter
  `review` and the reviewer can respond with `approve` or `reopen`

---

## 6. Handoff Commands

Owner handoff to reviewer `Codex`:

```bash
AI_NAME=Codex2 scripts/ai-status.sh handoff MAP-BE-003-SIDECAR-REVIEW Codex "MAP-BE-003 review packet is ready at support/sidecars/MAP-BE-003/MAP-BE-003-SIDECAR-REVIEW.md. The packet records that parent MAP-BE-003 remains in review, that the authoritative api-client delta currently lives as working-tree state in the canonical root on phase2-tesla-sandbox-docs-20260625, and that this sidecar branch only exposes the stable API delta doc plus downstream overlap on service-area test coverage. It maps the parent acceptance items to concrete file anchors without changing canonical truth."
```

Reviewer approval after sidecar status enters `review`:

```bash
AI_NAME=Codex scripts/ai-status.sh approve MAP-BE-003-SIDECAR-REVIEW \
  "Review approved. The packet correctly distinguishes the canonical-root MAP-BE-003 working-tree delta from the dev-visible downstream artifacts and stays support-only."
```

Reviewer reopen:

```bash
AI_NAME=Codex scripts/ai-status.sh reopen MAP-BE-003-SIDECAR-REVIEW \
  "packet needs revision: [machine-truth mismatch / wrong worktree attribution / incorrect evidence mapping / support-scope violation]"
```

---

## 7. Change Log

- 2026-07-01 - Recreated the sidecar review packet on the current
  `codex2/map-be-003-sidecar-review` owner branch after supervisor reassignment.
- 2026-07-01 - Revalidated that the parent review surface is split between the
  clean sidecar `dev` worktree and the canonical-root working tree carrying the
  parent delta.
- 2026-07-01 - Preserved the earlier support-packet lineage on
  `origin/codex/map-be-003-sidecar-review` as historical context only, without
  treating it as current machine truth.
