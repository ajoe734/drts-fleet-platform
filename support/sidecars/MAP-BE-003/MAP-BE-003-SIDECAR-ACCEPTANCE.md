# MAP-BE-003 Sidecar Acceptance Packet

- **Sidecar Kind:** `acceptance_packet`
- **Parent Task:** `MAP-BE-003` - Geo and service-area API client coverage
- **Parent Owner / Reviewer:** `Codex2` / `Gemini`
- **Sidecar Owner / Reviewer:** `Codex` / `Codex2`
- **Generated:** `2026-07-01` (UTC, packet rev2)
- **Snapshot anchor (parent `last_update`):** `2026-07-01T10:25:15Z`
- **Snapshot anchor (sidecar `last_update`):** `2026-07-01T15:04:53Z`
- **Status:** `ACCEPTANCE SUPPORT ARTIFACT` - support-only; does not modify canonical truth, runtime behavior, or the parent task lifecycle.

This revision replaces rev1 after the prior handoff failed for two concrete
reasons: the reviewer-facing branch did not contain the declared artifact, and
the owner branch commit failed `git show --check` because of trailing
whitespace and a blank line at EOF. Rev2 keeps the packet support-only while
re-aligning the acceptance checklist, dependency map, and reviewer path to the
current machine truth.

Current machine truth still says parent `MAP-BE-003` is `in_progress` and is a
readiness blocker for Gate A / C / D. This packet is therefore a reviewer
navigation layer, not proof that the parent slice is already ready for `done`.

As of this packet snapshot, inspectable parent evidence is split across
worktrees: this sidecar branch carries only the support artifact, while the
parent `packages/api-client` delta and related tests/docs remain
modified/untracked state in the canonical root worktree
`/home/edna/workspace/drts-fleet-platform`.

---

## 1. Scope Boundary

In scope:

- rebuild the missing sidecar acceptance packet at the declared artifact path
- restate the parent acceptance bar as a concrete reviewer checklist
- map upstream blockers and downstream consumers that currently depend on
  `MAP-BE-003`
- record where the inspectable parent evidence actually lives today
- preserve current verification and readiness evidence without mutating the
  parent task

Out of scope:

- editing `packages/api-client/src/index.ts`,
  `tests/unit/api-client-geo-service-area.test.ts`,
  `docs/04-api/map-geofence-openapi-delta-20260630.md`,
  `docs/03-runbooks/map-geofence-fleets-execution-tasks-20260701.md`, or
  `apps/api/tests/unit/service-area.service.test.ts`
- changing L1/L2 product truth, `ai-status.json`, `current-work.md`, or the
  parent task status outside official lifecycle commands
- claiming parent `MAP-BE-003` is merged, pushed, or ready for `done`
- inventing a parent task branch, commit hash, or remote ref that machine truth
  does not record

---

## 2. Machine-Truth Snapshot

### 2.1 Sidecar task - `MAP-BE-003-SIDECAR-ACCEPTANCE`

Machine-truth fields at packet generation:

- `title`: `Prepare MAP-BE-003 acceptance packet and dependency map`
- `owner`: `Codex`
- `reviewer`: `Codex2`
- `status`: `in_progress`
- `helper_parent`: `MAP-BE-003`
- `helper_kind`: `acceptance_packet`
- `mutates_canonical`: `false`
- `last_update`: `2026-07-01T15:04:53Z`
- `next`:
  - `Inspecting current branch packet, fixing whitespace/file placement issues, and preparing re-handoff to Codex2.`
- `artifacts`:
  - `support/sidecars/MAP-BE-003/MAP-BE-003-SIDECAR-ACCEPTANCE.md`
- acceptance:
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`
- prior review note carried in machine truth:
  - reviewer branch `codex2/map-be-003-sidecar-acceptance` at
    `f452f019f9d887850c907a28a60ce627b930049b` did not contain this artifact
  - owner branch commit `b9995aba13f6289e52dded5ff129a32a49d806cd` failed
    `git show --check` on markdown trailing whitespace and blank EOF

### 2.2 Parent task - `MAP-BE-003`

Machine-truth fields at packet generation:

- `title`: `Geo and service-area API client coverage`
- `owner`: `Codex2`
- `reviewer`: `Gemini`
- `status`: `in_progress`
- `depends_on`:
  - `MAP-BE-001`
  - `MAP-BE-002`
- `artifacts`:
  - `packages/api-client/`
  - `tests/unit/api-client-geo-service-area.test.ts`
  - `support/sidecars/MAP-QA-002/artifacts/vitest-api-client-map-geofence-surface-provenance-20260701T0952Z.json`
  - `docs/03-runbooks/map-geofence-fleets-execution-tasks-20260701.md`
- acceptance:
  - `typed api-client methods added`
  - `serviceable/manual_review/not_serviceable/provider_unavailable responses covered`
  - `api-client typecheck passes`
  - `endpoint docs updated`
- `planning_ref`:
  - `docs/03-runbooks/map-geofence-fleets-execution-tasks-20260701.md`
- `gap_ref`:
  - `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260701.md`
- `last_update`: `2026-07-01T10:25:15Z`
- `next` summary:
  - readiness blocker handoff; `34` failures reported
  - Gate A (`Callcenter safe to dispatch`), Gate C (`Ops safe to operate`),
    and Gate D (`Driver safe to navigate`) currently blocked
  - parent `next` still calls out open dependencies as
    `MAP-BE-001=review owner=Codex; MAP-BE-002=review owner=Claude2`
  - live task records currently read `MAP-BE-001.status=review` and
    `MAP-BE-002.status=in_progress`
  - parent must not be marked `done` until acceptance artifacts are real and
    readiness verification passes

### 2.3 Observed parent evidence topology

Observed from the canonical root worktree
`/home/edna/workspace/drts-fleet-platform` on branch
`phase2-tesla-sandbox-docs-20260625`:

- `M packages/api-client/src/index.ts`
- `?? tests/unit/api-client-geo-service-area.test.ts`
- `?? docs/04-api/map-geofence-openapi-delta-20260630.md`
- `?? docs/03-runbooks/map-geofence-fleets-execution-tasks-20260701.md`
- `?? support/sidecars/MAP-QA-002/artifacts/vitest-api-client-map-geofence-surface-provenance-20260701T0952Z.json`
- `?? apps/api/tests/unit/service-area.service.test.ts`

Observed from this sidecar worktree on branch
`codex/map-be-003-sidecar-acceptance`:

- `support/sidecars/MAP-BE-003/MAP-BE-003-SIDECAR-ACCEPTANCE.md` now exists
  here
- `tests/unit/api-client-geo-service-area.test.ts` is absent here
- `docs/03-runbooks/map-geofence-fleets-execution-tasks-20260701.md` is absent
  here

Observed branch state relevant to reviewer expectations:

- local `codex2/map-be-003-sidecar-acceptance` resolves to `origin/dev` at
  `f452f019f9d887850c907a28a60ce627b930049b`
- local `codex/map-be-003` also resolves to
  `f452f019f9d887850c907a28a60ce627b930049b`
- there is no remote parent branch `origin/codex/map-be-003`
- the prior review note explicitly identified
  `codex/map-be-003-sidecar-acceptance` commit
  `b9995aba13f6289e52dded5ff129a32a49d806cd` as the only committed location of
  this packet before rev2 cleanup

Reviewer implication: review the packet from the owner sidecar branch and the
parent implementation evidence from the canonical-root working tree. Do not
expect the reviewer branch or a dedicated parent task branch to contain both.

---

## 3. Dependency Map

### 3.1 Hard upstream blockers

```text
MAP-BE-003
├── MAP-BE-001 (status=review, owner=Codex, reviewer=Claude2)
│   └── Publishes coordinate provenance / resolve / reverse / service-area
│       contract types imported by @drts/api-client.
└── MAP-BE-002 (status=in_progress; parent next still abbreviates it as review)
    └── Publishes the geo gateway endpoints and normalized backend error
        behavior that the new client methods wrap.
```

Upstream rationale:

- `MAP-BE-001` is the contract and payload-shape dependency. Without those
  types, the client methods cannot stay type-safe.
- `MAP-BE-002` is the backend endpoint and error-shape dependency. Without the
  provider-neutral gateway, `MAP-BE-003` would only document fetch wrappers
  against an unstable backend surface.
- `MAP-BE-002` remains a live blocker because its own task record still reports
  review-failed findings on provider-neutral binding and direct-service invalid
  `limit` handling.

### 3.2 Direct downstream consumers

Machine-truth and planning references currently place `MAP-BE-003` under these
dependent slices:

- `MAP-BE-004` (`done`) depends on `MAP-BE-003` and consumes the service-area
  authority during booking creation
- `MAP-UI-001` (`in_progress`) depends on `MAP-BE-003` for shared
  `AddressMapPicker` typed client access
- `MAP-FE-OPS-001` (`done`) depends on `MAP-BE-003`, `MAP-BE-005`, and
  `MAP-UI-001` for the ops real map board
- `MAP-MOB-DRV-001` (`review`) depends on `MAP-BE-003` and `MAP-BE-005` for
  driver trip map/navigation

Planning anchors:

- `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md:123-136`
  lists `MAP-BE-003` with upstream dependencies `MAP-BE-001` and `MAP-BE-002`,
  and the downstream links to `MAP-BE-004`, `MAP-UI-001`, `MAP-FE-OPS-001`,
  and `MAP-MOB-DRV-001`
- `docs/03-runbooks/map-geofence-fleets-execution-tasks-20260701.md:73`
  includes `MAP-BE-003` under `FLEETS-MAP-001` coordinate-authority closeout
- `docs/03-runbooks/map-geofence-fleets-execution-tasks-20260701.md:76`
  includes `MAP-BE-003` under `FLEETS-MAP-004` ops real map
- `docs/03-runbooks/map-geofence-fleets-execution-tasks-20260701.md:78`
  includes `MAP-BE-003` under `FLEETS-MAP-006` driver map/navigation
- `docs/03-runbooks/map-geofence-fleets-execution-tasks-20260701.md:420`
  still lists `MAP-BE-003` among foundation tasks that prevent Gate A/C/D from
  counting as accepted

---

## 4. Acceptance Checklist With Evidence

The table below is intentionally split between what this sidecar directly
observed and what remains a parent-task requirement that this support branch did
not rerun.

| Parent acceptance item | Packet status | Evidence anchor / note |
| --- | --- | --- |
| `typed api-client methods added` | Observed in canonical-root working tree | `packages/api-client/src/index.ts:339-364` adds `ApiClientError`; `:483-512` parses backend error envelopes; `:594-653` adds `searchGeo`, `resolveGeo`, `reverseGeo`, `getServiceAreaDefinitions`, `getServiceAreaGeoJson`, and `evaluateServiceArea`. |
| `serviceable/manual_review/not_serviceable/provider_unavailable responses covered` | Observed in canonical-root working tree and QA artifact | `tests/unit/api-client-geo-service-area.test.ts:93-130` covers provider-neutral geo search query construction; `:133-195` covers resolve/reverse; `:197-213` covers definitions freshness; `:215-238` covers `serviceable` / `manual_review` / `not_serviceable`; `:240-266` preserves `GEO_PROVIDER_UNAVAILABLE`; `:268-298` preserves `INVALID_COORDINATE`; `support/sidecars/MAP-QA-002/artifacts/vitest-api-client-map-geofence-surface-provenance-20260701T0952Z.json:1` records `9/9` passing tests. |
| `api-client typecheck passes` | Not independently verified by this sidecar | `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md:280-283` lists `pnpm --filter @drts/api-client typecheck` as the parent verification bar. This support branch does not carry the parent delta, so the sidecar did not rerun it. |
| `endpoint docs updated` | Observed in canonical-root working tree | `docs/04-api/map-geofence-openapi-delta-20260630.md:13-43` defines shared envelope/error semantics; `:74-132` documents geo search/resolve/reverse; `:136-166` documents definitions/admin GeoJSON; `:202-247` documents evaluate semantics and the published client-method table. |

Supporting backend evidence for the service-area decision surface:

- `apps/api/tests/unit/service-area.service.test.ts:43-58` asserts
  `serviceable`
- `apps/api/tests/unit/service-area.service.test.ts:60-104` asserts
  `not_serviceable` and deny stop-policy behavior
- `apps/api/tests/unit/service-area.service.test.ts:106-131` asserts
  `manual_review`
- `apps/api/tests/unit/service-area.service.test.ts:156-179` asserts
  `INVALID_COORDINATE`
- `apps/api/tests/unit/service-area.service.test.ts:181-230` asserts
  definitions freshness and governed GeoJSON export metadata

---

## 5. Reviewer Walk

Recommended review order for `Codex2`:

1. Re-read live machine truth for `MAP-BE-003` and
   `MAP-BE-003-SIDECAR-ACCEPTANCE` before trusting any snapshot here.
2. Confirm the owner sidecar branch contains
   `support/sidecars/MAP-BE-003/MAP-BE-003-SIDECAR-ACCEPTANCE.md` and that the
   latest owner commit passes `git show --check`.
3. Inspect the canonical root worktree state listed in §2.3 instead of assuming
   the parent evidence exists on a pushed `MAP-BE-003` branch or on the reviewer
   branch.
4. Review `packages/api-client/src/index.ts:339-364`, `:483-512`, and `:594-653`
   to confirm the typed geo/service-area methods and structured error handling.
5. Review `tests/unit/api-client-geo-service-area.test.ts:93-298` plus the QA
   JSON artifact to confirm response coverage and preserved error metadata.
6. Review `docs/04-api/map-geofence-openapi-delta-20260630.md:74-247` to
   confirm endpoint delta documentation is aligned with the client surface.
7. Treat the parent `api-client typecheck passes` item as still requiring
   owner-side evidence or an independent rerun from the canonical root worktree.

---

## 6. Risks And Open Observations

- The parent implementation is still stranded in canonical-root working-tree
  state; without a parent task commit/branch, evidence can drift or be lost.
- The current sidecar branch still does not contain the parent api-client
  test/doc artifacts, so reviewer confusion is likely unless they follow the
  topology in §2.3.
- Parent `MAP-BE-003` still reports readiness failures and open dependencies in
  machine truth; this packet must not be used to justify a premature parent
  closeout.
- Parent `MAP-BE-003.next` currently says `MAP-BE-002=review owner=Claude2`,
  but the live `MAP-BE-002` task record remains `status=in_progress` with
  review-failed findings about provider-neutral binding and direct-service
  `limit` validation. This packet preserves that mismatch instead of
  normalizing it.

---

## 7. Reviewer Handoff Notes

This sidecar is complete once the reviewer confirms:

- the missing artifact has been recreated at the declared path on the owner
  sidecar branch
- the latest owner commit passes `git show --check`
- the packet stays support-only and does not mutate canonical truth
- the packet accurately distinguishes sidecar-branch evidence from
  canonical-root parent evidence
- the dependency map and acceptance checklist align with current machine truth,
  including the recorded `MAP-BE-002` status mismatch

Suggested approval wording:

> `審查通過：MAP-BE-003 acceptance packet 已在 owner sidecar branch 補齊，latest commit diff/check 乾淨，packet 正確記錄 parent MAP-BE-003 仍為 in_progress/readiness blocker，並明寫 parent next 與 MAP-BE-002 live status 的差異；support artifact only，未改 canonical truth。`

Suggested reopen wording:

> `packet needs revision: [missing artifact on owner branch / whitespace-check failure / incorrect topology / wrong evidence anchors / support-scope violation]`
