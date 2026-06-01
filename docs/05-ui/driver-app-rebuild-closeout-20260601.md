# Driver App Rebuild — Umbrella Closeout (2026-06-01)

Owner: `Claude2` · Reviewer: `Codex2`
Task: `UI-FE-DRV-UMBRELLA`
Phase: `phase1-ui-implementation-wave-202605`
Design authority (visual): [`docs/05-ui/drts-design-canvas/Driver App.html`](./drts-design-canvas/Driver%20App.html) v0.6
Behaviour / data / API authority: [`docs/05-ui/driver-app-design-handoff-packet-20260525.md`](./driver-app-design-handoff-packet-20260525.md)

Machine-truth note: reviewer verification must read the canonical status files
via `AI_STATUS_ROOT` / `ORCH_STATUS_ROOT`. The worktree-local status snapshots on
this isolated branch are not authoritative for the already-shipped sub-tasks.

## Purpose

This is the umbrella closeout for the **driver-app rebuild** against the v0.6
visual canvas + the 2026-05-25 design handoff packet. The driver app uses an
**independent design system** (`drts-design-canvas/driver-tokens.jsx`,
`driver-primitives.jsx`) and **cannot** import `@drts/ui-web` per answer Q-X04;
its on-device primitives live under `apps/driver-app/components/` (canvas
primitives + `ui-rn/`).

This document binds:

1. each of the 9 implementation sub-tasks to its shipped `commit_hash` and the
   reviewer that approved it (§1),
2. the **SOS press-and-hold 2-second** binding contract (Q-DRV11) to verified
   in-code evidence — including a contract defect found during this closeout and
   the corrective change made here (§2),
3. the **two device-class** targets (412×892 large, 360×780 narrow) to the
   canvas device frames and the app's own device-frame shell + responsive
   layout (§3),
4. the executable gate evidence rerun on this branch (§4).

## 1. Sub-task completion ledger

All 9 dependency sub-tasks are `done` in canonical machine truth. Every
`commit_hash` below resolves to a commit object in this checkout
(`git cat-file -t` = `commit`).

| Sub-task | Route / artifact | Owner | Reviewer | `commit_hash` | Branch |
| --- | --- | --- | --- | --- | --- |
| `UI-FE-DRV-ONB` | `/onboarding` · `apps/driver-app/app/onboarding.tsx` | Claude | Claude2 | `92d4f3954ae00d47ed448a4e7ef6347d28e93a1f` | `claude/ui-fe-drv-onb` |
| `UI-FE-DRV-IDX` | `/index` (cockpit) · `apps/driver-app/app/index.tsx` | Codex | Codex2 | `043fe12c5d8adf3b6af49738b42d350bc78f10a2` | `dev` |
| `UI-FE-DRV-JOB` | `/jobs` (unified inbox) · `apps/driver-app/app/jobs.tsx` | Claude2 | Claude | `6b50ef543664da44263314eee01ee741715e47ee` | `claude2/ui-fe-drv-job` |
| `UI-FE-DRV-TRP` | `/trip` · `apps/driver-app/app/trip.tsx` | Claude | Claude2 | `2b9857325edaa949af8b690e4f1a914684a073fb` | `claude/ui-fe-drv-trp` |
| `UI-FE-DRV-PP` | `/platform-presence` · `apps/driver-app/app/platform-presence.tsx` | Codex2 | Codex | `760af192c7f22519753f578f8180b947331eceea` | `dev` |
| `UI-FE-DRV-EAR` | `/earnings` · `apps/driver-app/app/earnings.tsx` | Claude | Claude2 | `ad663bd31674e0326da85756a234b30e92a67043` | `claude/ui-fe-drv-ear` |
| `UI-FE-DRV-SHF` | `/shift` · `apps/driver-app/app/shift.tsx` | Claude | Claude2 | `491bb708973be45593e42bbdaddd8257645d1951` | `claude/ui-fe-drv-shf` |
| `UI-FE-DRV-SOS` | `/incident` (SOS) · `apps/driver-app/app/incident.tsx` | Claude2 | Codex2 | `e2427577e02e42cb75bd80b96b4d6fb1d489e130` | `dev` |
| `UI-FE-DRV-SET` | `/settings` · `apps/driver-app/app/settings.tsx` | Claude2 | Claude | `61bf77c3b20d732a911956d114cbf3a360cddbf8` | `claude2/ui-fe-drv-set` |

All 10 canvas routes (`/onboarding`, `/index`, `/jobs`, `/trip`,
`/platform-presence`, `/earnings`, `/shift`, `/incident`, `/settings`, plus the
`_layout` tab shell) are present under `apps/driver-app/app/`.

## 2. SOS press-and-hold 2s contract — verification + corrective change

### Binding contract

Per the design handoff packet, the SOS submit gesture is a **binding** behaviour
contract, not a visual choice:

- §5 high-danger table: "SOS submit (press-and-hold **2s** per Q-DRV11)"
- §5 `/incident` Submit action: "per Q-DRV11 two-step: tap opens this sheet →
  **press-and-hold 2 seconds** → submit. … the press-and-hold contract is
  **binding (cannot reduce to single tap)**."
- §7.24 `/incident`: "**press-and-hold 2s visual** (Q-DRV11) … (cannot reduce to
  single tap)."

The canvas encodes the gesture as a visual state (`incident-tap` progress=0,
`incident-hold` press-and-hold 55%).

### Defect found during closeout

The shipped `UI-FE-DRV-SOS` screen (`apps/driver-app/app/incident.tsx`,
commit `e2427577e02e`) implemented the long-press threshold at **800 ms (0.8s)**,
not the binding 2 seconds. The gesture itself (two-step: long-press → explicit
confirm dialog) was correct, but the duration violated the Q-DRV11 contract. It
appeared in four places: the `delayLongPress` constant and three Traditional
Chinese copy strings ("約 0.8 秒" / "需長按 0.8 秒").

### Corrective change (made in this closeout)

Brought `incident.tsx` into contract compliance on this branch:

- `SOS_LONG_PRESS_DELAY_MS` `800` → `2000`
- review-section body copy: "長按底部按鈕約 0.8 秒" → "約 2 秒"
- bottom-bar hint: "請長按右側按鈕約 0.8 秒…" → "約 2 秒…"
- CTA eyebrow: "需長按 0.8 秒" → "需長按 2 秒"

The two-step protection (single tap never submits; long-press only opens the
confirm dialog; submit requires the danger-confirm `onConfirm`) is unchanged and
remains enforced by `tests/unit/incident-screen.test.ts`. The `delayLongPress`
prop now enforces the 2-second hold before `onLongPress` fires, satisfying the
binding contract.

**Post-change SOS contract status: VERIFIED (2 s).**

## 3. Device-class verification (412×892 + 360×780)

Per packet §9, the driver app targets two device classes. The canvas renders
every route on both device frames:

- `docs/05-ui/drts-design-canvas/Driver App.html` device-frame switch:
  `const dim = tw.device === 'narrow' ? { w: 360, h: 800 } : { w: 412, h: 915 };`
  (outer frame; the content viewport targets are **412×892 large** and
  **360×780 narrow**).

The app's own device-frame shell encodes the large class explicitly and degrades
the narrow class responsively rather than clipping:

- `apps/driver-app/components/canvas-primitives/index.tsx` `shellWebCenter`:
  `{ width: 412, maxWidth: "100%", height: 892 }` — the **412×892** large frame,
  with `maxWidth: "100%"` so a **360**-wide device shrinks to fit (no horizontal
  clip). On native, `shellBackdrop` / `shellFrame` use `flex: 1`, so both 360-
  and 412-wide device widths fill the screen via flex layout.

Layout audit: a repo-wide scan of `apps/driver-app/app/*.tsx` and
`components/**` for fixed pixel widths in the 3xx–4xx range found no
content-width hardcoding that would break the narrow class — the only `width:
412` is the intentional large-frame shell above, which is `maxWidth: "100%"`
bounded. Screens use flex / token spacing, so both device classes reflow.

### Screenshot artifact note (honest scope statement)

Live React-Native simulator/device captures were **not** produced in this worker
sandbox: there is no iOS/Android simulator, no Expo runtime, and no headless
browser binary available to this worker (only the apparmor profile, no Chromium;
no Playwright browser cache). Per the established closeout precedent in
[`driver-app-redesign-closeout-20260512.md`](./driver-app-redesign-closeout-20260512.md)
("This closeout does not rerun the per-task acceptance commands … binds each
shipped surface to … the canvas anchor"), the device-class evidence is bound to
the canvas device frames (design authority, both classes rendered) plus the
in-app `shellWebCenter` 412×892 frame and the responsive narrow handling above,
rather than to rasterized screenshots. A reviewer with a simulator/Expo or a
browser can confirm pixel rendering by opening the canvas frames and the
`expo start --web` shell at 412×892 and 360×780.

## 4. Executable gate evidence (rerun on this branch)

Reran the driver-app gates after building workspace deps
(`pnpm turbo run build --filter=@drts/driver-app^...` so `@drts/contracts` /
`@drts/ui-tokens` resolve):

- `pnpm --filter @drts/driver-app typecheck` (`tsc --noEmit`) → **exit 0**
- `pnpm --filter @drts/driver-app exec vitest run` → **11 files, 39 tests passed**
  (includes `tests/unit/incident-screen.test.ts` covering the SOS two-step gate)

## 5. Acceptance mapping

| Acceptance criterion | Status | Evidence |
| --- | --- | --- |
| All 9 sub-tasks done | ✅ | §1 ledger — all `done`, commits resolve |
| Closeout doc | ✅ | this document |
| Two device-class verification (412×892 + 360×780) | ✅ (canvas + code bound; no live screenshots — see §3 scope note) | §3 |
| SOS press-and-hold 2s contract verified | ✅ | §2 — defect found at 0.8s, corrected to 2s, typecheck + tests green |

## 6. Reviewer guidance (Codex2)

1. Confirm against the canonical machine-truth root (`AI_STATUS_ROOT` /
   `ORCH_STATUS_ROOT`) that each §1 `commit_hash` is the finalized `done` commit
   for its sub-task.
2. Review the §2 SOS corrective diff in `apps/driver-app/app/incident.tsx` (the
   `0.8s → 2s` change). This modifies a file previously finalized under
   `UI-FE-DRV-SOS`; it is intentionally reopened here because the binding Q-DRV11
   2s contract — which this umbrella exists to verify — was not met by the
   shipped 0.8s value.
3. Confirm the §3 device-class binding and the honest screenshot-scope note are
   acceptable for closeout, or request live captures if a simulator is available
   in your lane.
