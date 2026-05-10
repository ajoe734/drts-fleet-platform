# DRV-MP-007 SIDECAR ACCEPTANCE

Status: review
Owner: Codex
Reviewer: Claude2
Last Update: 2026-05-08

> Snapshot note: this packet is written for the owner handoff state of `DRV-MP-007-SIDECAR-ACCEPTANCE` (`review`, awaiting `Claude2`). Authoritative lifecycle state lives in `ai-status.json`; treat this header as a reviewer-facing summary only.

## 目的

為 `DRV-MP-007`（Earnings Authority Redesign）準備非侵入式 acceptance 支援包。本檔只整理 acceptance checklist、dependency map、live review snapshot 與 evidence anchors，不修改 canonical truth。

Parent task live snapshot at refresh time:

- `DRV-MP-007` status: `review`
- Parent owner / reviewer: `Codex2` / `Claude2`
- Parent write scope: `apps/driver-app/app/earnings.tsx`, `apps/driver-app/components/earnings-by-platform.tsx`, `apps/driver-app/lib/money.ts`
- Latest parent implementation handoff in machine history: `2026-05-08T06:19:29Z`
- Latest parent reviewer reassignment in machine history: `2026-05-08T06:21:20Z` (`reviewer` rebalanced from `Codex` to `Claude2`)

This sidecar does not claim parent closeout, commit evidence, or canonical approval on behalf of the parent owner.

## Canonical 來源 (read-only references)

- Product spec: `docs/01-product/driver-app-multi-platform-product-spec-20260507.md:491-496`
- Execution packet: `docs/03-runbooks/driver-app-multi-platform-execution-packet-20260507.md:274-292`
- Parent machine truth: `ai-status.json` entries for `DRV-MP-007`, `DRV-MP-007-SIDECAR-ACCEPTANCE`, `DRV-MP-001`, `API-MP-001`
- Parent latest review/handoff history: `ai-status.json` handoff entries for `DRV-MP-007` at `2026-05-08T06:17:55Z`, `2026-05-08T06:19:29Z`, `2026-05-08T06:21:13Z`
- Contract/read-model anchors:
  - `packages/contracts/src/platform-earnings.ts:4-25`
  - `packages/contracts/src/platform-codes.ts:1-62`
  - `packages/contracts/src/platform-adapter-registry.ts:48-61`
  - `apps/api/src/modules/platform-earnings/platform-earnings.service.ts:27-138`
- Live parent implementation snapshot:
  - `apps/driver-app/app/earnings.tsx`
  - `apps/driver-app/components/earnings-by-platform.tsx`
  - `apps/driver-app/lib/money.ts`

## Acceptance Checklist

- [x] Support-only acceptance packet refreshed to the current machine-truth assignment (`Codex` -> `Claude2`)
- [x] Dependency map limited to `DRV-MP-007` and its declared prerequisites (`DRV-MP-001`, `API-MP-001`)
- [x] Reviewer-facing notes updated from the old pre-fix gap snapshot to the current parent review snapshot
- [x] Canonical truth remains untouched outside sidecar lifecycle updates through `scripts/ai-status.sh`
- [x] Owner handoff prepared for `AI_NAME=Codex scripts/ai-status.sh handoff DRV-MP-007-SIDECAR-ACCEPTANCE Claude2 ...`

### Parent verification steps (`Codex2` / `Claude2`)

1. Confirm the canonical write scope is still limited to `apps/driver-app/app/earnings.tsx`, `apps/driver-app/components/earnings-by-platform.tsx`, and `apps/driver-app/lib/money.ts`.
2. Confirm platform breakdown rows label both settlement and payout authority explicitly in `apps/driver-app/components/earnings-by-platform.tsx:85-104,157-171`.
3. Confirm forwarded values are split correctly:
   - `外部平台結算` totals at `apps/driver-app/app/earnings.tsx:294-300,398-401`
   - `Shadow-only 鏡像` totals at `apps/driver-app/app/earnings.tsx:301-305,404-407`
   - `shadow-only` rows remain reference-only at `apps/driver-app/components/earnings-by-platform.tsx:87-104`
4. Confirm pending payout vs paid still comes from DRTS statement status, not platform totals, at `apps/driver-app/app/earnings.tsx:306-313,408-417`.
5. Confirm partial stale-data warnings are still preserved at `apps/driver-app/app/earnings.tsx:317-329,373-375,482-487`.
6. Run the recorded acceptance command: `pnpm --filter @drts/driver-app typecheck`.

### Sidecar reviewer checklist (`Claude2`)

- Confirm this packet matches the live machine-truth snapshot: parent `DRV-MP-007` is `review` under `Codex2` / `Claude2`; sidecar is handed to `Claude2`.
- Confirm the packet distinguishes the resolved UI regression from the remaining design constraint: the contract still lacks a row-level `financeAuthorityMode`, so the current parent patch derives authority from shared registry metadata instead of API payload shape.
- Confirm the packet does not over-claim commit/push/done state for `DRV-MP-007`.
- Confirm this sidecar only updates `support/sidecars/DRV-MP-007/DRV-MP-007-SIDECAR-ACCEPTANCE.md`.
- Approve with:

```bash
AI_NAME=Claude2 scripts/ai-status.sh approve DRV-MP-007-SIDECAR-ACCEPTANCE \
  "Reviewed: acceptance packet aligned to current DRV-MP-007 review snapshot, dependency map, and reviewer evidence without mutating canonical truth."
```

## Dependency Map

### Hard prerequisites

| Source       | Status | Why it matters                                                                                                                                                                |
| ------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DRV-MP-001` | `done` | Supplies the shared driver-app UI primitives used on `/earnings`, including `AuthorityBanner`, `InfoTile`, `ListCard`, `SegmentedControl`, `StatusChip`, and `PlatformBadge`. |
| `API-MP-001` | `done` | Owns the unified driver-safe contracts consumed by `/earnings`, including `PlatformEarningsItem`, `PlatformEarningsByPlatformResponse`, and `PlatformEarningsSummary`.        |

### Practical / co-evolving dependencies

| Anchor | Location                                                                          | Why it matters now                                                                                                                                                                                                                              |
| ------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-1    | `packages/contracts/src/platform-earnings.ts:4-25`                                | `PlatformEarningsItem` still contains only `platformCode` plus money fields. There is no row-level `financeAuthorityMode` in the payload.                                                                                                       |
| D-2    | `packages/contracts/src/platform-adapter-registry.ts:48-61`                       | `FinanceAuthorityMode` (`OWNED`, `EXTERNAL`, `SHADOW`) exists canonically here, but it is not emitted by the current earnings payload.                                                                                                          |
| D-3    | `packages/contracts/src/platform-codes.ts:21-62`                                  | The current parent patch derives authority from `PLATFORM_CODE_REGISTRY.status` and `forwarderAdapterKey`: known catalog entries default to external, `forwarder_stub` entries become shadow-only, uncatalogued/native rows fall back to owned. |
| D-4    | `apps/api/src/modules/platform-earnings/platform-earnings.service.ts:27-138`      | The API producer still emits only `platformCode` and money amounts, so the parent patch stays within driver-app write scope by deriving authority client-side.                                                                                  |
| D-5    | `apps/driver-app/components/earnings-by-platform.tsx:18-49`                       | The old hard-coded `OWNED_PLATFORM_CODES` allow-list is gone. Authority is now computed via `getFinanceAuthorityModeForPlatformCode`, `isOwnedPlatformCode`, and `isShadowOnlyPlatformCode`.                                                    |
| D-6    | `apps/driver-app/app/earnings.tsx:287-305,392-443`                                | Summary tiles and authority banners now split DRTS statement-backed totals, external-platform settlement totals, and shadow-only mirror totals.                                                                                                 |
| D-7    | `docs/03-runbooks/driver-app-multi-platform-execution-packet-20260507.md:282-292` | Defines the four acceptance bullets and the sole recorded verification command.                                                                                                                                                                 |
| D-8    | `docs/01-product/driver-app-multi-platform-product-spec-20260507.md:493-496`      | Product requirement anchor: owned trips and forwarded shadow trips must not be mixed without labels; shadow ledger data must be marked reference-only.                                                                                          |

### Out of scope for this sidecar

- Extending `PlatformEarningsItem` or API producer shape.
- Editing `packages/contracts/*`, `apps/api/*`, L1/L2 spec files, or execution packet text.
- Claiming parent review approval, task-scoped commit, push, or `done` closeout.

## Live Parent Review Snapshot

Compared with the earlier packet draft, the parent implementation state has moved forward:

- The old `OWNED_PLATFORM_CODES = ["owned", "direct", "drts"]` heuristic is no longer the live baseline.
- Current `/earnings` code derives finance authority from the shared platform registry helper in `apps/driver-app/components/earnings-by-platform.tsx:18-49`.
- Current summary tiles no longer label every non-owned amount as mirror-only; they split `外部平台結算` and `Shadow-only 鏡像` in `apps/driver-app/app/earnings.tsx:392-417`.
- Current row accessibility labels no longer announce every forwarded row as shadow-only; `EXTERNAL` rows use `外部平台淨額`, while `SHADOW` rows use `shadow-only 淨額` in `apps/driver-app/components/earnings-by-platform.tsx:100-104,127-130`.

Reviewer should explicitly evaluate whether the registry-driven derivation is acceptable for this task, given that the contract still has no `financeAuthorityMode` field. That is the main remaining design tradeoff surfaced by the current patch.

## Acceptance Mapping

| Acceptance bullet                                                          | Live implementation anchor                                                                                                 | Reviewer focus                                                                                                       |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Platform breakdown labels payout/settlement authority.                     | `apps/driver-app/components/earnings-by-platform.tsx:85-104,157-171`                                                       | Confirm both settlement and payout labels are visible and semantically correct for owned vs external/shadow rows.    |
| Forwarded shadow-only values are not presented as payable DRTS settlement. | `apps/driver-app/app/earnings.tsx:294-305,398-407,433-440` and `apps/driver-app/components/earnings-by-platform.tsx:87-99` | Confirm external-platform totals and shadow-only mirror totals are distinct; shadow-only rows remain reference-only. |
| Pending payout vs paid remains clear.                                      | `apps/driver-app/app/earnings.tsx:306-313,408-417` and `apps/driver-app/app/earnings.tsx:357-365`                          | Confirm payout status is still driven by DRTS statement rows, not platform by-platform totals.                       |
| Partial stale-data warnings are preserved.                                 | `apps/driver-app/app/earnings.tsx:317-329,373-375,482-487`                                                                 | Confirm full error, partial stale-data banner, and pull-to-refresh/retry paths still exist.                          |

## Evidence Inventory

- Sidecar artifact: `support/sidecars/DRV-MP-007/DRV-MP-007-SIDECAR-ACCEPTANCE.md`
- Parent machine truth: `ai-status.json` entry for `DRV-MP-007`
- Sidecar machine truth: `ai-status.json` entry for `DRV-MP-007-SIDECAR-ACCEPTANCE`
- Latest parent handoff message: `ai-status.json` handoff entry at `2026-05-08T06:19:29Z`
- Latest parent reviewer reassignment: `ai-status.json` handoff/rebalance entry at `2026-05-08T06:21:13Z` / `2026-05-08T06:21:20Z`
- Dependency closure:
  - `DRV-MP-001` done with commit `3db8394ebd872b50c3ccbbcd3352fc4c41845adb`
  - `API-MP-001` done with push commit `3ed7c89`
- Parent worktree delta snapshot at packet refresh: `git diff --stat -- apps/driver-app/app/earnings.tsx apps/driver-app/components/earnings-by-platform.tsx apps/driver-app/lib/money.ts` -> `3 files changed, 220 insertions(+), 89 deletions(-)`
- Last committed baseline touching the parent write scope: `git log -1 --oneline -- apps/driver-app/app/earnings.tsx apps/driver-app/components/earnings-by-platform.tsx apps/driver-app/lib/money.ts` -> `823f134 feat(driver-app): rebuild multi-platform execution surfaces`

## Handoff / Evidence

Owner action log for this sidecar:

1. `AI_NAME=Codex scripts/ai-status.sh progress DRV-MP-007-SIDECAR-ACCEPTANCE "Refreshing acceptance packet to match current machine truth for DRV-MP-007 and latest reviewer-facing dependency evidence before reviewer handoff."`
2. Refresh this support artifact so it no longer describes the old `Claude2 -> Codex` packet draft or the pre-fix hard-coded allow-list baseline.
3. Handoff to `Claude2` for review after verifying the support file is well-formed and canonical truth remains untouched outside sidecar lifecycle updates.

Reviewer reopen command if changes are needed:

```bash
AI_NAME=Claude2 scripts/ai-status.sh reopen DRV-MP-007-SIDECAR-ACCEPTANCE \
  "<reason>"
```

---

Support artifact refreshed by `Codex`. No canonical files modified.
