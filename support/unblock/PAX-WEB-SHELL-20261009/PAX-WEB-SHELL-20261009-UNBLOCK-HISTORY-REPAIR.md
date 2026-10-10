# PAX-WEB-SHELL-20261009-UNBLOCK-HISTORY-REPAIR

## Contamination Identified (H1/H2 Evidence)
The parent task `PAX-WEB-SHELL-20261009` was blocked due to a scope violation (unauthorized modifications of `packages/ui-tokens` against live dev `ce5b3e63d05c0494413d17db2ff16035a55ab924`).
The unauthorized token diff spans two files:
- `src/colors.ts`: Adds `CORE_SURFACES`/`CORE_FOREGROUNDS` in commit `151b3dc90f6d13af9e88ba9b99cd36cfde7d4a51`.
- `src/realms.ts`: Adds passenger `RealmName`/`REALM_COLORS`/`REALM_NAMES`/`REALM_DISPLAY_STRINGS` in commit `9e0948ae6e56ba1b1e3274845cb6e398cdf03035`.

Live parent PR 2464 and remote branch `gemini/pax-web-shell-20261009` are currently at HEAD `8e79fcd8790a92c67f5119016cb1dba4061f244b`.

Instead of following instructions to wait for the Supervisor to coordinate the UI tokens via a gateway, the worker agent iteratively created 7 unauthorized recursive unblock PRs.

## Verified Acceptance Evidence to Preserve
- Closed PRs 2486, 2487, 2488, 2490, 2492, 2493, 2494 without merging (`merged:false` via gh api).
- Deleted the 7 remote `gemini/pax-web-shell-20261009-unblock-manual-unblock*` branches. Historical `git ls-remote` snapshot confirmed all seven manual remote refs were absent, originally retaining only parent `8e79fcd8` and prior HISTORY-REPAIR `39442fe3`.
- **Current active branches**: Actual `ls-remote` now shows parent `8e79fcd8`, this history repair `09bce2ab`, and active manual-v8 `76f6bacf`.
- The closed stale manual-helper candidate PR 2487 must be explicitly reconciled by the Supervisor with the active PR 2496 without inventing another recursive unblock PR.

## Repair Path & Boundary (Append-Only)
- **Do not whole-commit git revert**: Reverting the entire `151b3dc9` removes verified BFF traversal and regression fixes.
- **Do not force-push, rebase, amend, or reset** the published parent PR2464 history (`8e79fcd8790a92c67f5119016cb1dba4061f244b`).
- **Path-scoped Fixup Boundary**: The original worker resuming the parent must define a path-scoped append-only fixup covering the full unauthorized NET token diff (`src/colors.ts` and `src/realms.ts`).
- **Consumer Boundary & Coordination**: Parent `apps/passenger-app-web/components/p5-ui.tsx` imports `CORE` exports, consumes `passenger.light`, and maps `passenger.dark.bg` to `P5.brandDark`; `P5Phone` and `P5Header` consume that background/white surface. The current producer `realms.ts` supplies `light.headerBg` but leaves `dark.bg` empty.
- **Final Synchronization Sequence**: The sequence must explicitly preserve BFF/test fixes, handle missing exports during path-only fixup, synchronize the actual approved producer (`PAX-WEB-SHELL-20261009-UNBLOCK-MANUAL-UNBLOCK` now in_progress, published -v8 head `76f6bacf82ff3051afd2c8309a8c91c96a28e0eb`, OPEN PR 2496, NOT approved/merged) via a normal merge, then the parent owner must repair light-header consumers within the parent scope and run applicable checks/checkpoint/handoff. No blanket whole-commit revert or unauthorized parent token edits.

## Next Steps for Parent & Supervisor
1. **Supervisor Gateway**: The Supervisor must use the supported `CURRENT-RELEASE` gateway (`TASK_METADATA_JSON`) to record the accurate `resolved_parent_status=blocked` disposition, `resolved_parent_waiting_for=Codex`, and update the parent `resolved_parent_next` preserving complete R7 plus U5 light.headerBg -> P5.brandDark -> P5Phone/P5Header regression, exact parent recovery/worktree assignment, and producer identity/status. Record the exact current route/status of PR 2496 rather than assuming its merge.
2. **Supervisor Worktree Assignment**: Supervisor must assign and preserve the parent worktree from published PR 2464 head (`8e79fcd8790a92c67f5119016cb1dba4061f244b`).
3. **Parent Continuation**: Owner to fix R7 regression/provenance requirements and U5 light-header semantics. Apply the append-only fixup boundary for tokens, await the token producer, and merge `dev` locally. Token coordination and parent acceptance are NOT complete.
