# S3-FIX-DRIVER-SOS-VOCAB-001 — S-3 design decision

Task: the Driver SOS home (`apps/driver-app/app/sos.tsx`) rendered three §1.3
forbidden terms in the 當前訂單情境 card, with no runtime-profile gate, so a
`multi_taxi_direct` driver saw cross-platform vocabulary and identifiers.

The board registered this as needing an S-3 design decision: **realm-conditional
card, or relabel?**

## Decision: realm-conditional card. Relabel alone was not an available option.

The decision was not open. Two canonical sources already constrain it, and they
agree:

1. `docs/05-ui/drts-design-canvas/driver-sos.jsx` — `SosCtx` (L13–25) is the
   design truth for this card. Its row set is
   行程編號 / 車牌 / 駕駛 / 目前位置 / 原始觸發時間 — entirely owned-domain.
   There is **no** platform row, no external order row, and no platform-status
   row in the canvas at all. The file header states outright:
   「禁止多平台/外部詞彙。」 The shipped card had invented five rows the canvas
   never had.
2. `source_specs/02_ui_visual_design_team_brief_20260720.md` §1.3 L80 —
   「不得以 CSS 隱藏既有多平台元件後交稿；Figma layer / component tree 也不應包含
   上述元件。」 This rules out a style/visibility gate explicitly: the elements
   must be **absent from the component tree**, not hidden.

So the card is gated on the capability contract, and the aggregation rows are
never constructed under a profile that forbids them. A rename would have left
the cross-platform *data* — `MIRROR-9001`, `EXT-77421`, the external platform
display name — in front of a `multi_taxi_direct` driver under friendlier labels,
which is the failure mode the acceptance criterion "a cosmetic rename alone is
not accepted as closure" names.

## What was actually wrong (beyond the three labels)

`pickSosTaskContext` did not merely *label* cross-platform orders — it
**preferred** them:

```ts
const selectedTask =
  prioritizedTasks.find(
    (task) =>
      !isOwnedPlatformCode(task.sourcePlatform) &&
      !isUnifiedTaskPlatformClosed(task),
  ) ?? prioritizedTasks[0] ?? null;
```

Given both an owned trip and an aggregated one, the SOS screen picked the
aggregated one as the safety context. `multi_taxi_direct` declares
`orderDomains: ["owned"]`, so that task is not in the realm at all. Relabelling
would have left this selection intact — the driver would still have escalated
with a cross-platform order attached, under a nicer name.

## Implementation

- `apps/driver-app/lib/driver-runtime-profile.ts` (new) — the gate. Imports
  `MULTI_TAXI_FORBIDDEN_CAPABILITIES` from `@drts/contracts` rather than
  re-declaring the list, so the contract stays the single edit site. Mirrors
  `GET /regulatory-registry/passenger-runtime-profiles/:code`.
  - Resolves **synchronously**: the first consumer is the SOS surface, which
    must render with no network (「撥號功能不依賴行動網路」). An HTTP-resolved gate
    would either block SOS or flash the forbidden UI before the response landed.
  - **Fails closed**: unset, empty, or unrecognised
    `EXPO_PUBLIC_DRTS_RUNTIME_PROFILE` resolves to `multi_taxi_direct`, the most
    restrictive profile. A typo in the build env cannot unlock a forbidden
    surface.
- `apps/driver-app/app/sos.tsx`
  - `SosTaskContext` moves the cross-platform fields into an optional
    `crossPlatform` group. When the capability is forbidden it is `null`, so the
    card has nothing to render the rows *from* — they cannot be reintroduced by
    an unrelated edit.
  - `pickSosTaskContext` filters to owned-domain tasks under the gate, using the
    contract field `orderDomain` (falling back to the existing
    `isOwnedPlatformCode` heuristic).
  - The card's owned rows follow the canvas: 行程編號 / 任務編號 / 目前狀態 /
    目前位置. Aggregation rows are *spread in* only when `crossPlatform` is set.
  - No §1.3 term literal remains anywhere in the file, for any profile — §1.3
    binds the whole S-3 screen, not just the `multi_taxi_direct` branch. For
    profiles that do permit aggregation the rows are labelled 來源平台 /
    平台狀態 / 平台訂單編號.

The aggregating realm's own screens (`jobs.tsx`, `platform-presence.tsx`,
`earnings.tsx`) are untouched: `forwarded` is that profile's real domain term and
those screens are outside the S-3 scan scope by the scanner's own documented
scoping rule.

## Verification

| Check | Result |
| --- | --- |
| `node support/sidecars/S3-VERIFY-001/scan-forbidden-vocabulary.mjs` | **0 BLOCKING**, exit 0 (was 3 BLOCKING, exit 1) |
| `npx tsc --noEmit -p apps/driver-app/tsconfig.json` | exit 0 |
| `npx vitest run` (driver-app) | 26 files / 125 tests passed |

`tests/unit/sos-screen-runtime-profile-gate.test.ts` renders the **real** screen
against **real** `UnifiedDriverTaskView` rows and reads the rendered tree. A
source-level assertion would have passed for a screen that kept the rows and hid
them with a style — the exact thing §1.3 L80 forbids — so only the rendered tree
can distinguish "absent" from "hidden".

Mutation-checked, not just green: forcing `aggregationForbidden = false` fails
5 of the 6 tests. The suite also covers the un-gated profile (rows return under
`ordinary_taxi`, proving the gate is conditional rather than a blanket deletion)
and the fail-closed path for an unrecognised profile override.

The scanner was copied byte-identical from
`origin/claude2/s3-verify-001:support/sidecars/S3-VERIFY-001/scan-forbidden-vocabulary.mjs`
(verified by `diff`) — it is vendored here so the acceptance check is
reproducible on this branch, and was not adjusted to make the fix pass.
