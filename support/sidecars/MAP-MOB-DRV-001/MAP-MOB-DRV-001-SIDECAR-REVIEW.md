# MAP-MOB-DRV-001-SIDECAR-REVIEW

**Support-only review packet for `MAP-MOB-DRV-001`**

- Sidecar task: `MAP-MOB-DRV-001-SIDECAR-REVIEW`
- Sidecar owner / reviewer: `Codex` / `Codex2`
- Sidecar status at packet update: `in_progress` (`last_update: 2026-07-01T02:30:04Z`)
- Parent task: `MAP-MOB-DRV-001` - Driver trip map and navigation
- Parent owner / reviewer: `Codex2` / `Claude2`
- Parent status at packet time: `review` (`last_update: 2026-07-01T01:42:31Z`)
- Parent branch / head: `codex/map-mob-drv-001-driver-navigation` @ `e5b4e925078f37b1e4d178d7bd820e10b8634657`
- Scope guardrail: support-only artifact; no edits to canonical truth, parent implementation, tests, or governance state
- Parent evidence packet anchors:
  - `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-FINAL-EVIDENCE.md`
  - `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-GATE-D-UAT.md`

This packet repairs the failed first review handoff. At `2026-07-01T02:29:31Z`,
`Codex2` reopened the sidecar because this branch still matched
`origin/dev@f452f019f9d887850c907a28a60ce627b930049b` and the declared artifact
did not exist on the branch. The goal of this file is narrower than the parent
task: make the review evidence branch-visible and isolate what the parent branch
does prove versus what it still leaves external-gated.

## 1. Machine-Truth Snapshot

- `AI_NAME=Codex scripts/ai-status.sh list --status in_progress` now shows
  `MAP-MOB-DRV-001-SIDECAR-REVIEW` as the only `Codex`-owned active task in the
  current queue slice.
- `AI_NAME=Codex scripts/ai-status.sh show MAP-MOB-DRV-001` records the parent
  as `review`, not `done`. The binding machine-truth summary says the parent
  branch implements coordinate-based driver trip navigation handoff, route
  authority copy, degraded fallback, and heartbeat coexistence evidence, but it
  explicitly leaves Android/iOS simulator or device UAT external-gated.
- Relevant activity-log trail:
  - `2026-07-01T02:24:08Z` - `Codex` started the sidecar: "Preparing review packet and evidence summary in sidecar artifact".
  - `2026-07-01T02:27:30Z` - `Codex` handed off a review summary to `Codex2`,
    but the packet was not committed onto this branch.
  - `2026-07-01T02:29:31Z` - `Codex2` reopened the sidecar because the packet
    was absent on `codex2/map-mob-drv-001-sidecar-review`, this branch still
    matched `origin/dev`, and the parent evidence still described
    coordinate-handoff mode with no native map SDK and no simulator/device UAT.
  - `2026-07-01T02:30:04Z` - `Codex` recorded progress to rebuild the packet
    from committed parent evidence.

Review implication:

- The main failure was branch verifiability, not a proven contradiction in the
  parent implementation.
- This sidecar must therefore commit the reviewer packet itself and keep every
  claim tied to parent branch files, machine truth, or activity-log evidence.

## 2. Parent Branch Evidence That Is Actually Committed

Two parent commits matter for review:

| Commit | Subject | Review relevance |
| ------ | ------- | ---------------- |
| `285bf4f552f2a5e82fe3664bd574187757aa613c` | `MAP-MOB-DRV-001: add driver navigation handoff` | Main implementation commit. Adds `apps/driver-app/components/driver-trip-map.tsx`, `apps/driver-app/lib/driver-navigation.ts`, related driver-app tests, and the first final-evidence packet. |
| `e5b4e925078f37b1e4d178d7bd820e10b8634657` | `MAP-MOB-DRV-001: clean final evidence whitespace` | Follow-up cleanup only. Changes `MAP-MOB-DRV-001-FINAL-EVIDENCE.md` formatting and does not alter runtime behavior. |

`git show --stat --format=fuller` on those commits confirms:

- both commit subjects include the parent task id
- both commit bodies carry `Task-ID: MAP-MOB-DRV-001`
- the implementation surface is the driver-app plus support evidence, not a
  hidden native SDK integration elsewhere in the repo

Committed evidence from the parent packet and codebase is consistent on three
points that the reviewer should treat as binding:

1. The shipped scope is **coordinate handoff mode**, not a native map SDK
   integration.
2. External navigation is built from backend pickup/dropoff coordinates, not
   from address-string guesses.
3. Android/iOS simulator or device UAT is still missing and remains an external
   gate.

The parent evidence says this explicitly:

- `MAP-MOB-DRV-001-FINAL-EVIDENCE.md` states the branch "does not add a native
  map SDK dependency" and "does not claim native map rendering."
- The same packet records: "Android/iOS simulator UAT was not run in this
  repo-local pass."
- `MAP-MOB-DRV-001-GATE-D-UAT.md` says not to claim Gate D or driver-map
  production readiness without simulator/device proof for actual app launch,
  navigation handoff, and degraded behavior.

## 3. Acceptance-To-Evidence Map

| Parent acceptance item | Committed branch evidence | Reviewer note |
| ---------------------- | ------------------------- | ------------- |
| `driver sees real pickup/dropoff points` | `apps/driver-app/app/trip.tsx` integrates `DriverTripMap`; `apps/driver-app/components/driver-trip-map.tsx` builds a navigation model from backend `pickup` / `dropoff` coordinates and renders coordinate labels plus route-authority copy; `apps/driver-app/tests/unit/driver-trip-map.test.ts` asserts the screen shows pickup/dropoff addresses and exact coordinate strings. | Evidence supports coordinate visibility and honest fallback copy. It does **not** prove a real provider-backed native map render. |
| `external navigation opens correct coordinates` | `apps/driver-app/lib/driver-navigation.ts` builds Apple Maps, Google Maps app/web, and Android navigation URLs from coordinate pairs; `openDriverNavigation(...)` returns `missing_coordinates` instead of falling back to address guesses; `apps/driver-app/tests/unit/driver-navigation.test.ts` asserts Google web URLs use lat/lng, Android dropoff opens `google.navigation:q=25.0697,121.5525&mode=d`, and missing coordinates block handoff. | Branch evidence is strong for coordinate-accurate deep links. The branch scope is external-navigation handoff, not in-app turn-by-turn routing. |
| `heartbeat still works` | `apps/driver-app/tests/unit/driver-location-heartbeat.test.ts` includes a case named "keeps active trip heartbeat running after external navigation handoff" and asserts the active task id stays `task-001` with work state `on_trip`. | This is automated evidence only; it does not replace mobile UAT, but it does directly cover the coexistence claim the parent makes. |
| `driver-app checks and mobile UAT evidence recorded` | `MAP-MOB-DRV-001-FINAL-EVIDENCE.md` records PASS for `pnpm --filter @drts/driver-app typecheck`, `lint`, `test`, and `git diff --check`. The same file also records that Android/iOS simulator UAT was **not** run and that Gate D remains external-gated. | Driver-app checks are recorded. Mobile UAT evidence is recorded as **missing**, not as passed. This is the main open review decision on the parent. |

## 4. Review Conclusions This Sidecar Can Safely Support

This packet supports the following reviewer conclusions:

- the sidecar branch now has a concrete artifact for review instead of a
  handoff that existed only in chat or a lost working tree
- the parent branch genuinely implements a coordinate-based navigation handoff
  surface with route-authority copy, degraded fallback, and heartbeat-aware
  tests
- the parent branch does **not** pretend to ship a native map SDK or a verified
  provider-backed map surface
- the parent branch does **not** contain Android/iOS simulator or physical
  device UAT proof

This packet does **not** support the following claims:

- "native map SDK integration is complete"
- "driver map production-ready"
- "Gate D pass"
- "Android and iOS validated"
- "simulator/device evidence attached"

## 5. Reviewer Hotspots For `Codex2`

1. Verify the original reopen cause is fixed in the branch itself:
   `support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-SIDECAR-REVIEW.md` now
   exists on `codex/map-mob-drv-001-sidecar-review` instead of only in a prior
   local handoff.
2. Judge the parent on its actual committed scope:
   coordinate-based navigation handoff plus honest map limitations, not a claim
   of native map rendering.
3. Decide whether the parent acceptance bullet
   `driver-app checks and mobile UAT evidence recorded` is acceptable while the
   evidence packet explicitly records mobile UAT as missing/external-gated, or
   whether the parent should stay reopened until simulator/device proof lands.
4. Keep `MAP-MOB-DRV-001-GATE-D-UAT.md` as the binding do-not-claim checklist.
   That file explicitly rejects Gate D or production-readiness claims without
   simulator/device evidence.
5. Treat this packet as support-only. It must not mutate parent code, L1/L2
   product truth, or the parent task lifecycle by itself.

## 6. Sidecar Scope Compliance

- [x] Create support artifacts only
- [x] Do not edit canonical truth
- [x] Prepare a reviewer-facing handoff packet scoped to branch-visible evidence

Recommended handoff summary after commit + push:

```text
Created support/sidecars/MAP-MOB-DRV-001/MAP-MOB-DRV-001-SIDECAR-REVIEW.md on codex/map-mob-drv-001-sidecar-review and fixed the prior reopen cause by making the packet branch-visible. The packet anchors parent review evidence to codex/map-mob-drv-001-driver-navigation@e5b4e925078f37b1e4d178d7bd820e10b8634657, confirms coordinate-handoff scope plus heartbeat/deep-link tests, and explicitly preserves the open review question that mobile simulator/device UAT is still missing/external-gated and no native map SDK is claimed.
```
