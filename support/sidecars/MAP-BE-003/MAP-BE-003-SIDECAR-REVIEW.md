# MAP-BE-003 Review Packet & Evidence Summary

- **Sidecar Kind:** `review_packet`
- **Parent Task:** `MAP-BE-003` — Geo and service-area API client coverage
- **Parent Owner / Reviewer:** `Codex` / `Claude2`
- **Sidecar Owner / Reviewer:** `Codex` / `Codex2`
- **Planning Anchor:** `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
- **Machine-Truth Basis:** parent row last_update `2026-06-30T14:52:11Z`; sidecar row last_update `2026-06-30T21:36:14Z` with status `review_approved`; closeout refresh prepared `2026-06-30` (UTC)
- **Status:** REVIEW-APPROVED SUPPORT ARTIFACT SNAPSHOT — does not modify canonical truth, runtime behavior, or parent lifecycle state

This packet prepares reviewer-facing evidence for `MAP-BE-003` while keeping the
sidecar strictly in support scope. The important complication is that the parent
review surface is **split across worktrees**:

- the assigned sidecar worktree on `codex/map-be-003-sidecar-review` is based on
  `dev` and does **not** contain the parent's `packages/api-client` delta
- the canonical root worktree on `phase2-tesla-sandbox-docs-20260625` contains
  the parent's api-client changes as **uncommitted** working-tree state plus
  three untracked evidence files
- downstream `MAP-BE-006` later committed a copy of the API delta doc and a
  later-evolved `service-area.service.test.ts` onto `dev`

Reviewer implication: do not treat the sidecar worktree alone as the complete
`MAP-BE-003` review surface.

---

## 1. Scope Boundary

In scope:

- snapshot the sidecar and parent machine-truth rows
- map each parent acceptance item to concrete evidence
- explain where the parent review surface actually lives right now
- record downstream overlap that could mislead a reviewer reading only `dev`

Out of scope:

- editing canonical implementation files
- editing `ai-status.json`, `current-work.md`, or `ai-activity-log.jsonl`
  outside the official lifecycle commands
- approving or reopening the parent task directly from this packet
- inventing commit / push evidence that the parent has not yet recorded

---

## 2. Machine-Truth Snapshot

### 2.1 Sidecar task

`scripts/ai-status.sh show MAP-BE-003-SIDECAR-REVIEW` records:

- `id`: `MAP-BE-003-SIDECAR-REVIEW`
- `owner`: `Codex`
- `reviewer`: `Codex2`
- `status`: `review_approved`
- `helper_parent`: `MAP-BE-003`
- `helper_kind`: `review_packet`
- `mutates_canonical`: `false`
- reviewer conclusion: the packet correctly distinguishes the canonical-root
  working-tree delta from the `dev`-visible downstream artifacts and stays
  support-only
- artifact path:
  `support/sidecars/MAP-BE-003/MAP-BE-003-SIDECAR-REVIEW.md`

Owner implication: reviewer approval is already recorded, but the sidecar still
needs the owner closeout commit / push / `done` lifecycle step before it leaves
the queue.

### 2.2 Parent task

`scripts/ai-status.sh show MAP-BE-003` records:

- `id`: `MAP-BE-003`
- `title`: `Geo and service-area API client coverage`
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

The parent `next` field claims the following owner verification already ran:

- `pnpm exec prettier --check` on touched client / API / test / docs files
- `pnpm --filter @drts/api-client typecheck`
- `pnpm exec vitest run tests/unit/api-client-geo-service-area.test.ts`
- `pnpm --filter @drts/api typecheck`
- `pnpm --filter @drts/api lint`
- `pnpm --filter @drts/api test -- --runInBand apps/api/tests/unit/service-area.service.test.ts`
- `pnpm lint:root`

This sidecar did **not** rerun those commands; it only packages the evidence and
records where that review surface exists.

### 2.3 Current Codex queue relevant to this dispatch

Using filtered `scripts/ai-status.sh list` snapshots at closeout-prep time:

- `status=in_progress`: no matches
- `owner=Codex status=review_approved`: `MAP-BE-003-SIDECAR-REVIEW`
- `reviewer=Codex status=review`: no matches

Practical meaning: this sidecar is the only dispatch-relevant task currently
waiting on Codex, and it is already past review pending owner closeout.

---

## 3. Review Surface Topology

### 3.1 Assigned sidecar worktree (`codex/map-be-003-sidecar-review`)

Current sidecar worktree:

- path:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-map-be-003-sidecar-review`
- branch: `codex/map-be-003-sidecar-review`
- `dev` baseline under the packet: `f452f019f9d887850c907a28a60ce627b930049b`
- pushed packet anchor before owner closeout:
  `ecbfa6a9d4ed76f65d579dc389153cbe47f65aa3`

Observed state in this worktree:

- `docs/04-api/map-geofence-openapi-delta-20260630.md` exists and is tracked
- `apps/api/tests/unit/service-area.service.test.ts` exists and is tracked
- `tests/unit/api-client-geo-service-area.test.ts` does **not** exist
- `packages/api-client/src/index.ts` contains **no** `/api/geo/*` or
  `/api/service-area/*` client paths in this snapshot

Reviewer implication: this worktree alone cannot prove the parent acceptance
item "typed api-client methods added".

### 3.2 Canonical root worktree carrying the parent delta

Canonical machine-truth root worktree:

- path: `/home/edna/workspace/drts-fleet-platform`
- branch: `phase2-tesla-sandbox-docs-20260625`
- HEAD: `9f6dde8223366fe517431592fc6b93eb9f39114d`

Targeted status for parent-owned files there:

- `M packages/api-client/src/index.ts`
- `?? docs/04-api/map-geofence-openapi-delta-20260630.md`
- `?? apps/api/tests/unit/service-area.service.test.ts`
- `?? tests/unit/api-client-geo-service-area.test.ts`

Targeted diff evidence:

- `packages/api-client/src/index.ts`: `261 insertions(+), 6 deletions(-)`
- the API delta doc and both test files are untracked there, so they are part
  of the current working-tree review surface rather than commit history

There is no local or remote branch named `map-be-003`, and
`git log --all --grep='MAP-BE-003'` returns no dedicated parent commit. The
parent review therefore currently depends on **working-tree evidence**, not an
inspectable task-scoped commit.

### 3.3 Downstream overlap already on `dev`

`git show --stat ceecb45a0` (`MAP-BE-006: integrate service-area governance on dev`)
shows that downstream work later committed:

- `docs/04-api/map-geofence-openapi-delta-20260630.md`
- `apps/api/tests/unit/service-area.service.test.ts`

Important nuance:

- `cmp` confirms the API delta doc is identical between the sidecar worktree and
  the canonical root working tree
- `service-area.service.test.ts` is **not** identical between the two worktrees
- `diff -u` shows the `dev` copy contains additional persistence / rollback /
  seed-merge coverage that is not present in the canonical-root parent snapshot

Reviewer implication: the API delta doc is safe to inspect from either tree, but
the `service-area.service.test.ts` on `dev` is a **later** downstream evolution
and should not be treated as a byte-for-byte parent artifact.

---

## 4. Acceptance-To-Evidence Map

### 4.1 `typed api-client methods added`

Primary evidence lives in the canonical root working tree:

- `packages/api-client/src/index.ts:573-727` adds:
  - `searchGeo`
  - `resolveGeo`
  - `reverseGeo`
  - `getServiceAreaDefinitions`
  - `getServiceAreaGeoJson`
  - `evaluateServiceArea`
  - service-area admin lifecycle helpers for boundaries and stop policies
- `packages/api-client/src/index.ts:320-344` defines `ApiClientError`
- `packages/api-client/src/index.ts:464-487` parses backend error envelopes and
  preserves `code`, `details`, `retryable`, and `traceId`

This acceptance item cannot be verified from the sidecar worktree alone because
that snapshot does not contain the parent `packages/api-client` delta.

### 4.2 `serviceable/manual_review/not_serviceable/provider_unavailable responses covered`

Primary api-client test evidence lives only in the canonical root working tree:

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

Supporting backend/service evidence is visible in both worktrees:

- `apps/api/tests/unit/service-area.service.test.ts:48-63` asserts
  `serviceable`
- `apps/api/tests/unit/service-area.service.test.ts:65-109` asserts
  `not_serviceable`
- `apps/api/tests/unit/service-area.service.test.ts:111-136` asserts
  `manual_review`
- `apps/api/tests/unit/service-area.service.test.ts:186-214` asserts
  `generatedAt` freshness and GeoJSON export shape

### 4.3 `api-client typecheck passes`

This sidecar can only record the machine-truth claim from the parent `next`
field:

- `pnpm --filter @drts/api-client typecheck`
- `pnpm exec vitest run tests/unit/api-client-geo-service-area.test.ts`

Additional claimed supporting checks:

- `pnpm --filter @drts/api typecheck`
- `pnpm --filter @drts/api lint`
- `pnpm --filter @drts/api test -- --runInBand apps/api/tests/unit/service-area.service.test.ts`
- `pnpm lint:root`

This packet does **not** convert those claims into new verification evidence. If
the reviewer wants fresh execution proof, it must be rerun from the canonical
root worktree that actually contains the parent delta.

### 4.4 `endpoint docs updated`

The API delta document is stable and inspectable from either tree:

- `docs/04-api/map-geofence-openapi-delta-20260630.md:13-44` documents the
  success/error envelope and `ApiClientError` behavior
- `docs/04-api/map-geofence-openapi-delta-20260630.md:74-132` documents
  `/api/geo/search`, `/api/geo/resolve`, `/api/geo/reverse`
- `docs/04-api/map-geofence-openapi-delta-20260630.md:136-224` documents
  service-area definitions, GeoJSON export, evaluation, lifecycle endpoints,
  and error codes
- `docs/04-api/map-geofence-openapi-delta-20260630.md:226-251` maps client
  methods to endpoints

Secondary corroboration:

- `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md:260-281`
  defines `MAP-BE-003` as the api-client / API-doc coverage slice
- `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md:47`
  records that `MAP-BE-003` added typed API-client coverage and endpoint delta
  docs
- `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md:164-165`
  reiterates that service-area client methods and the OpenAPI delta doc were
  added in `MAP-BE-003`

---

## 5. Review Outcome And Reading Order

The assigned sidecar reviewer (`Codex2`) approved the packet after confirming
these points:

1. This packet stays support-only and does not pretend to approve the parent.
2. It accurately records that the parent's api-client delta lives in the
   canonical root working tree, not the sidecar `dev` snapshot.
3. It accurately records that the API delta doc is identical across worktrees,
   while `service-area.service.test.ts` has already evolved downstream on `dev`.
4. It does not invent a `MAP-BE-003` commit, branch, or push that does not
   exist.
5. It makes the distinction between "machine-truth verification claim" and
   "sidecar-rerun verification evidence" explicit.

Practical review order:

1. Read this packet.
2. Inspect `packages/api-client/src/index.ts` and
   `tests/unit/api-client-geo-service-area.test.ts` in the canonical root
   worktree.
3. Use the tracked `docs/04-api/map-geofence-openapi-delta-20260630.md` in this
   sidecar worktree for doc review, since it matches the canonical-root copy.
4. Treat `apps/api/tests/unit/service-area.service.test.ts` in this sidecar
   worktree as downstream context, not as the exact parent snapshot.

Recorded approval shape for the **sidecar packet**:

> `審查通過：MAP-BE-003 sidecar review packet 已正確區分 parent review surface 的兩個位置：canonical root working tree 內未提交的 api-client / api-client test delta，以及 dev 已可見的 API delta doc / downstream-evolved service-area test。packet 如實對齊 machine truth（parent 仍為 review，尚無專屬 commit/branch/push 證據），support artifact only，未改 canonical truth。`

Suggested reopen wording:

> `packet needs revision: [specify machine-truth mismatch / wrong worktree attribution / incorrect evidence mapping]`

---

## 6. Lifecycle Commands

The handoff / approval commands are preserved here for auditability. At this
snapshot, the sidecar is already `review_approved` and waiting only on owner
closeout.

Owner handoff to `Codex2`:

```bash
AI_NAME=Codex python3 scripts/ai_status.py handoff MAP-BE-003-SIDECAR-REVIEW Codex2 "MAP-BE-003 review packet is ready at support/sidecars/MAP-BE-003/MAP-BE-003-SIDECAR-REVIEW.md. The packet records that the parent remains in review, that the authoritative api-client delta currently lives as uncommitted working-tree state in the canonical root on phase2-tesla-sandbox-docs-20260625, and that dev only carries the shared API delta doc plus a downstream-evolved service-area.service test from MAP-BE-006. It maps the parent acceptance items to concrete file anchors and calls out that fresh verification would need to run from the canonical-root worktree containing packages/api-client/src/index.ts and tests/unit/api-client-geo-service-area.test.ts."
```

Reviewer approval:

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py approve MAP-BE-003-SIDECAR-REVIEW \
  "Review approved. The packet correctly distinguishes the canonical-root MAP-BE-003 working-tree delta from the dev-visible downstream artifacts and stays support-only."
```

Reviewer reopen:

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py reopen MAP-BE-003-SIDECAR-REVIEW \
  "packet needs revision: [specify machine-truth mismatch / wrong worktree attribution / incorrect evidence mapping]"
```

Owner closeout after review approval:

```bash
AI_NAME=Codex \
COMMIT_HASH=<sha> \
COMMIT_SUBJECT="MAP-BE-003-SIDECAR-REVIEW: finalize review packet closeout" \
PUSH_REMOTE=origin \
PUSH_BRANCH=codex/map-be-003-sidecar-review \
INTEGRATION_STATUS=not_applicable \
scripts/ai-status.sh done MAP-BE-003-SIDECAR-REVIEW \
  "Owner finalized the support-only review packet after Codex2 approval, pushed the task-scoped closeout commit, and recorded no-deploy integration status."
```

---

## 7. Change Log

- 2026-06-30 - Created initial sidecar review packet for `MAP-BE-003`.
- 2026-06-30 - Recorded that the parent review surface is split across the
  sidecar `dev` worktree and the canonical-root working tree.
- 2026-06-30 - Recorded that `docs/04-api/map-geofence-openapi-delta-20260630.md`
  matches across worktrees, while `apps/api/tests/unit/service-area.service.test.ts`
  has already evolved downstream in `MAP-BE-006`.
- 2026-06-30 - Refreshed the packet after `review_approved` so the closeout
  snapshot reflects the reviewer conclusion, the pushed packet anchor, and the
  pending owner `done` step.
