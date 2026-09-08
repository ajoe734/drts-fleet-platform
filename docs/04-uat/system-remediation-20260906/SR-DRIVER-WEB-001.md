# SR-DRIVER-WEB-001 verification — 2026-09-08

Status: partial implementation; web export blocked. No review candidate locked.

## Dispatch recheck — 2026-09-08 14:55 UTC

- Fresh `origin/dev` base: `c4c4a35f88907df6bf68e781059dde397c06ba03`, including planning PR #1768 (helper candidate `5d0fd50955e68738c09b4a59c0fd62a66831d58d`). The helper explicitly routes authorization to supervisor and says the parent remains blocked; it supplies no Metro implementation or scope authorization. The parent task slice still permits only the original four scopes and has no producer dependency. Its automatic reset to `todo` does not resolve the engineering blocker.
- Ran `git fetch origin` and `git rebase origin/dev` (both exit 0). Then `git merge --no-edit origin/codex2/sr-driver-web-001` (exit 0, clean merge) retained published anchor ancestry so this rebased rail can be pushed normally without force. Tested head: `8e5ceae86ac1ab8454503d568be668380b512160`. Candidate remains unassigned.
- `pnpm --filter @drts/driver-app typecheck`: exit 0.
- `pnpm exec vitest run tests/unit/system-remediation/sr-driver-web-001/`: exit 0, one file / five tests.
- `git diff --check`: exit 0.
- Actual web reproduction command, from the assigned worktree:

  ```sh
  NODE_OPTIONS=--require="$PWD/tests/unit/system-remediation/sr-driver-web-001/metro-worktree-harness.cjs" pnpm --filter @drts/driver-app exec expo export --platform web --max-workers 2 --source-maps --output-dir /tmp/sr-driver-web-001-web-dispatch-1452 > /tmp/sr-driver-web-001-web-dispatch-1452.log 2>&1
  ```

  Exit 1: `Unable to resolve module ./wa-sqlite/wa-sqlite.wasm` from `expo-sqlite/web/worker.ts`. The import chain still reaches the app root through the persistent location queue. Log resource: `/tmp/sr-driver-web-001-web-dispatch-1452.log` (ephemeral); the exact failure and command are preserved here.
- No application code changed in this dispatch. Native export and the 91 existing repair tests below are historical checks, not rerun results at this head. Web browser routes, live services, and physical devices remain unverified. No SOS was sent.
- Required next action: supervisor must authorize `apps/driver-app/metro.config.js` and reconcile reviewed scopes/dependencies, or register a bundler producer and parent dependency. See `support/unblock/SR-DRIVER-WEB-001/SR-DRIVER-WEB-001-UNBLOCK-PLANNING-DECISION.md`. Do not redispatch solely because the planning helper merged.

## Revisions and scope

- Freshly fetched `origin/dev` base: `3b60a3757238663572f16f010c94f446f2c71eaa`.
- Tested application code anchor: `e574e11a3a956960aba11a1ee21b2ab6af5fe03d`, already pushed to `codex2/sr-driver-web-001`. Subsequent report/test-only anchor is recorded by the task status command; application code is identical.
- Candidate SHA: **not assigned**, because `/`, `/onboarding`, `/sos` cannot yet pass the real web bundle gate. Do not interpret the anchor as a candidate or deployment.
- Sources: execution task and runbook, findings `R30`, capabilities `C049`/`C062`, and `scope-and-coverage.md` driver repair provenance. The historical audit is not the current base.
- Current base still statically imports `react-native-maps` in `driver-trip-map.tsx`, even though rendering checks `Platform.OS`. The native entry is byte-for-byte unchanged from base (last changed by `bdd7af68b`, DRV-RWD-001).
- Added `.web.tsx` preserves the existing coordinate-handoff layout, forwarded-route authority, missing-coordinate handling, freshness and offline messaging. It imports no native maps. Native map implementation and navigation/SOS API models remain unchanged.
- Read `packages/ui-tokens/src/realms.ts` and the canonical Driver App canvas/screens. No new palette is introduced; the web copy uses the existing `driverCanvasTheme`. That shared theme currently has legacy platform/blue overrides; correcting the shared theme is outside this task's scope and this report does not claim a full canvas-conformance audit.

## Executed checks

All commands run from the assigned isolated worktree unless noted.

| Command | Exit | Actual result |
| --- | --- | --- |
| `git fetch origin` | 0 | Base above; already ancestor of branch |
| `git diff --check` | 0 | No whitespace errors |
| `pnpm --filter @drts/driver-app typecheck` | 0 | `tsc --noEmit` |
| `pnpm exec vitest run tests/unit/system-remediation/sr-driver-web-001/` | 0 | 1 file, 5 tests |

The five tests exercise real component/navigation code with host APIs mocked: original entry fails when native maps are forbidden on web; web entry renders coordinates and opens coordinate-based Google navigation; forwarded route lock/offline guidance and missing-coordinate suppression; iOS and Android retain Google provider and synced markers. This is a unit-level reproduction, not a browser observation of the original audit exception.

Existing-repair regression command (exit 0, 11 files / 91 tests):

```sh
pnpm --filter @drts/driver-app exec vitest run tests/unit/driver-navigation.test.ts tests/unit/driver-trip-map.test.ts tests/unit/driver-root-navigator.test.ts tests/unit/driver-bottom-tab-bar.test.ts tests/unit/driver-auth-token-lifecycle.test.ts tests/unit/driver-auth-states.test.ts tests/unit/driver-sos-no-os-dialer.test.ts tests/unit/driver-sos-end-to-end-platform.test.ts tests/unit/keyboard-avoiding-container.test.ts tests/unit/responsive-layout-and-overflow.test.ts tests/unit/driver-route-guards-and-feature-entries.test.ts
```

These retain DRV-NAV (`1d4f34d92`), AUTH (`332db5119`), SOS (`6f5d34510`), KBD (`a095698a6`), RWD (`bdd7af68b`) behavior. Despite the existing SOS test filename, this is unit verification of command/state behavior, not live platform receipt or emergency delivery. No SOS was sent.

## Metro bundle results

The worktree uses supervisor-provided symlinks to canonical dependencies. Initial exports failed resolving `react` / `@babel/runtime`. The local harness only exposes those dependency directories via Metro `watchFolders` and `nodeModulesPaths`; it does not stub modules, add WASM support, or alter platform resolution. Exact harness used is preserved at `tests/unit/system-remediation/sr-driver-web-001/metro-worktree-harness.cjs` (copy of `/tmp/sr-driver-web-001-metro.cjs`). It is diagnostic setup for this workspace, not product configuration.

```sh
NODE_OPTIONS=--require=/tmp/sr-driver-web-001-metro.cjs pnpm --filter @drts/driver-app exec expo export --platform web --max-workers 2 --source-maps --output-dir /tmp/sr-driver-web-001-web-recheck > /tmp/sr-driver-web-001-web-recheck.log 2>&1
NODE_OPTIONS=--require=/tmp/sr-driver-web-001-metro.cjs pnpm --filter @drts/driver-app exec expo export --platform ios --platform android --max-workers 2 --source-maps --output-dir /tmp/sr-driver-web-001-native-recheck > /tmp/sr-driver-web-001-native-recheck.log 2>&1
```

- Web exit **1**: `Unable to resolve module ./wa-sqlite/wa-sqlite.wasm` from `expo-sqlite/web/worker.ts`. The WASM file exists in the installed package. Import chain is `_layout.tsx` → `driver-location-heartbeat` → `driver-location-offline-queue` → `expo-sqlite` → web worker. Native-map isolation alone cannot resolve this independent bundler issue.
- Native exit **0**: Android 1,488 modules; iOS 1,499 modules. Hermes exports:
  - Android `_expo/static/js/android/entry-6d3cd38b662e13eb4de52057a49306a8.hbc`.
  - iOS `_expo/static/js/ios/entry-526ee0fa33548965acc67a869651f50e.hbc`.
- Parsed both generated `.hbc.map` files with Python JSON: each contains 22 `react-native-maps/` sources and `/apps/driver-app/components/driver-trip-map.tsx`; neither selects the `.web.tsx` entry. Output metadata: `/tmp/sr-driver-web-001-native-recheck/metadata.json`. These local outputs/logs are ephemeral; durable resource IDs and results are recorded here.

## Blocker and unperformed acceptance

Supervisor must authorize an additional producer/scope for the shared driver Metro configuration (likely `apps/driver-app/metro.config.js`) and register necessary dependency edges before product configuration is changed. Diagnose/configure actual SQLite WASM handling; do not replace the offline queue with fixtures or a no-op. Current write scopes permit only map entries, this test directory, and this report.

`/`, `/onboarding`, `/sos` have **not** been browser-validated at this revision because web export fails. No live API test identities, orders, SOS incidents, delivery receipts, real map provider sessions, signed APK/IPA, physical devices, GPS lifecycle checks, CI, merge, or deployment evidence was produced. Native export is JavaScript/Hermes import validation, not a device build or device acceptance. Continue with web bundler producer, then browser regression and same-candidate handoff.
