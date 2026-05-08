# OPS-MP-003-SIDECAR-REVIEW

**Support-only review packet for `OPS-MP-003`**

- Sidecar task: `OPS-MP-003-SIDECAR-REVIEW`
- Sidecar owner: `Codex2`
- Sidecar reviewer: `Claude2`
- Sidecar status at packet closeout prep: `review_approved`
- Parent task: `OPS-MP-003` — Driver Platform Eligibility Management
- Parent owner / reviewer at packet time: `Claude2` / `Claude`
- Parent status at packet time: `done` (`last_update: 2026-05-08T08:08:12Z`)
- Sidecar kind: `review_packet`
- Scope guardrail: support-only artifact; no edits to canonical truth, runtime code, or tests

## 1) Machine-Truth Snapshot

Current `ai-status.json` shows the parent task is already fully closed:

- `OPS-MP-003` is `done` under `Claude2` / `Claude`.
- `commit_hash`: `9967e7c60474f6af835347e3e49bf46e7d23eb6e`
- `commit_subject`: `feat(OPS-MP-003): manage driver platform eligibility from ops console`
- `push_remote` / `push_branch`: `origin` / `codex/dev-deploy-backend-android`
- `next`: `Owner closeout: ops-console-web typecheck passes; commit 9967e7c pushed to origin/codex/dev-deploy-backend-android with task-scoped trailers (LLM-Agent/Task-ID/Reviewer).`
- Canonical acceptance remains one explicit command: `pnpm --filter @drts/ops-console-web typecheck`

Source anchors:

- Parent machine truth: `ai-status.json:10601-10636`
- Sidecar machine truth: `ai-status.json:11407-11430`

This sidecar does not reopen the parent or reinterpret its acceptance. It only
packages the already-recorded review and closeout evidence for `Claude2`.

## 2) Canonical Scope And Acceptance

The product spec and execution packet constrain `OPS-MP-003` to the ops-facing
driver eligibility surface:

- Product/task map lists `OPS-MP-003` as `Driver platform eligibility management`
  where ops can inspect and control driver-platform availability.
- Execution acceptance requires:
  - driver list/detail with shift, platform presence, account binding,
    eligibility, active order, stale location, and recent relay failures
  - ops actions to take a driver offline for a platform, request re-auth, or
    suppress matching during incidents where backend allows
- Execution verification requires:
  - `pnpm --filter @drts/ops-console-web typecheck`

Canonical anchors:

- `docs/01-product/driver-app-multi-platform-product-spec-20260507.md:941`
- `docs/03-runbooks/driver-app-multi-platform-execution-packet-20260507.md:404-423`

## 3) Evidence Summary

### E-1 Driver List Surface

`apps/ops-console-web/app/drivers/page.tsx:63-209` shows the new `/drivers`
page:

- loads driver registry and driver-location data together
- renders columns for driver id, name, shift/work state, dispatch eligibility,
  blocked reasons, license validity, and live/stale/missing location
- links each row into `/drivers/[driverId]`

This matches the parent review note language about shift, blocked reasons,
license state, and location status indicators.

### E-2 Driver Detail Aggregation

`apps/ops-console-web/app/drivers/[driverId]/page.tsx:193-665` aggregates the
per-driver management view:

- pulls registry, latest locations, platform presence, forwarded orders, and
  driver statements in parallel
- computes `relayFailures`, active forwarded order state, online platform count,
  re-auth count, ineligible platform count, and stale/missing/live location
- renders a platform table with account binding, presence, eligibility, token
  expiry, and adapter health
- renders relay-failure rows and latest statement summary

This is the strongest code anchor for the parent reviewer note that detail view
integrates registry/presence/location/forwarded orders/statements.

### E-3 Ops Actions

`apps/ops-console-web/components/driver-platform-actions.tsx:31-214` exposes
the action seams promised by acceptance:

- per-driver `incident_hold` toggle via `updateDriverWorkState()`
- per-platform offline action via `setPlatformOffline()`
- per-platform re-auth request via `setPlatformOnline()` with a forced token
  expiry timestamp

### E-4 Backend/API Guardrails

The backend and client seams supporting the ops console are explicitly present:

- `apps/api/src/modules/platform-presence/platform-presence.controller.ts:29-92`
  rejects the old implicit fallback and requires explicit `driverId` for
  non-driver callers.
- `apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts:120-188`
  exposes `GET /api/regulatory-registry/driver-locations` and
  `POST /api/regulatory-registry/drivers/:driverId/work-state`.
- `packages/api-client/src/index.ts:224-226` keeps `getList()` aligned to
  envelope `{ items: T[] }`.
- `packages/api-client/src/index.ts:1106-1146` adds `driverId`-aware platform
  presence read/update calls for ops use.
- `packages/api-client/src/index.ts:1820-1861` adds typed
  `listDriverLocations()` and `updateDriverWorkState()` bindings.

## 4) Parent Review And Closeout Evidence

The parent reviewer note recorded in machine truth states:

> ops console added `/drivers` list plus `/drivers/[driverId]` detail, wired
> registry/presence/location/forwarded orders/statements, included per-platform
> offline and re-auth plus `incident_hold` suppress-matching actions, switched
> platform-presence to explicit `driverId` query, added `driver-locations` and
> `work-state` routes, and verified `getList` envelope unwrap plus work-state
> route. Acceptance `pnpm --filter @drts/ops-console-web typecheck` passed.

That summary is now reinforced by parent closeout metadata:

- `commit 9967e7c60474f6af835347e3e49bf46e7d23eb6e` carries required trailers:
  `LLM-Agent: Claude2`, `Task-ID: OPS-MP-003`, `Reviewer: Claude`
- recorded verification in commit body:
  - `pnpm --filter @drts/ops-console-web typecheck`
  - `pnpm --filter @drts/ops-console-web lint`
  - `pnpm --filter @drts/api typecheck`
  - `pnpm --filter @drts/api-client typecheck`
  - `pnpm --filter @drts/api exec vitest run tests/unit/platform-presence.service.test.ts tests/unit/regulatory-registry.service.test.ts`
- `git show --stat 9967e7c...` reports 10 files changed with new unit coverage in
  `apps/api/tests/unit/platform-presence.service.test.ts` and new UI actions in
  `apps/ops-console-web/components/driver-platform-actions.tsx`

Machine-truth anchor:

- `ai-status.json:10624-10636`

## 5) Reviewer Checkpoints

Review this packet as a support artifact, not as new product truth:

1. Confirm the packet reflects the latest absolute parent state:
   `OPS-MP-003` is `done` on `2026-05-08T08:08:12Z`, not merely
   `review_approved`.
2. Confirm all claims stay within evidence already recorded in:
   `ai-status.json`, commit `9967e7c...`, and the cited code files.
3. Confirm the packet does not mutate L1/L2 truth or expand parent scope beyond
   driver eligibility management.
4. Confirm the key acceptance seam remains the ops-console list/detail plus the
   supporting API/client routes, not unrelated platform-admin or driver-app work.
5. If any line reference drifts, prefer the cited file over this packet and have
   the owner refresh the support doc.

## 6) Sidecar Scope Compliance

- [x] Create support artifacts only: this file is the only intended task artifact.
- [x] Do not edit canonical truth: no product spec, execution packet, runtime,
      contract, or test files were changed by this sidecar.
- [x] Hand off the packet to the assigned reviewer: reviewer handoff completed
      at `2026-05-08T08:10:13Z`, and `Claude2` approved the packet at
      `2026-05-08T08:12:29Z`.

This sidecar should finish as a support-only packet; owner closeout should
commit only this artifact unless reviewer feedback requires another packet-only
refresh.

## 7) Review Outcome

Recorded reviewer approval message in `ai-status.json`:

> Sidecar review packet approved: contents match machine truth (parent
> OPS-MP-003 done, commit 9967e7c on origin/codex/dev-deploy-backend-android),
> all cited code anchors hold, commit trailers and verification chain
> confirmed, no canonical truth mutated. Returning to owner Codex2 for
> closeout.

Owner closeout should now commit this packet as a task-scoped support artifact,
push a normal non-force update, and then mark
`OPS-MP-003-SIDECAR-REVIEW` `done` in machine truth.
