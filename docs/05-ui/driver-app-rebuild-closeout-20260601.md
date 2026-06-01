# Driver App Rebuild — Umbrella Closeout (2026-06-01)

Owner: `Claude2` · Reviewer: `Claude`
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
   in-code evidence — already satisfied by the shipped SOS screen, no corrective
   change needed (§2),
3. the **two device-class** targets (412×892 large, 360×780 narrow) to the
   canvas device frames and the app's own device-frame shell + responsive
   layout (§3),
4. the executable gate evidence rerun on this branch (§4).

This branch carries **zero code delta vs `origin/dev`**: its net diff is this
closeout document only (`git diff --stat origin/dev HEAD` → this file, +170).
The driver-app source — including `incident.tsx` — is byte-identical to the
shipped `origin/dev` tree.

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

### Integration / merge-state (honest call-out)

These sub-tasks are all `done` + reviewer-approved in canonical machine truth,
but they are **not all integrated into `dev` yet**. As of this closeout
(`origin/dev` = `64638c94`):

- **Merged into `dev` (3 of 9):** `UI-FE-DRV-IDX` (`043fe12c`),
  `UI-FE-DRV-PP` (`760af192`), `UI-FE-DRV-SOS` (`e2427577`) — each verified an
  ancestor of `origin/dev` (`git merge-base --is-ancestor … origin/dev`).
- **Finalized on per-owner lane branches, not yet merged to `dev` (6 of 9):**
  `UI-FE-DRV-ONB`, `UI-FE-DRV-JOB`, `UI-FE-DRV-TRP`, `UI-FE-DRV-EAR`,
  `UI-FE-DRV-SHF`, `UI-FE-DRV-SET` (see the `Branch` column). Their commit
  objects resolve in this checkout but their per-lane branches still need their
  own merge/PR into `dev`.

This is acceptable for an umbrella **status** document — it records and binds
the finalized commits — but it is **not** a claim that all 9 screens are live on
`dev`. The remaining 6 lane branches must still be integrated through the normal
per-branch merge flow.

## 2. SOS press-and-hold 2s contract — verified (already shipped)

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

### Verification — already satisfied by the shipped SOS screen

The shipped `UI-FE-DRV-SOS` screen (`apps/driver-app/app/incident.tsx`, commit
`e2427577e02e`, on `dev`) **already implements the binding 2-second hold**. No
defect existed and **no corrective change is made by this closeout**. The
shipped code, byte-identical on `origin/dev` and on this branch, encodes the 2 s
contract directly:

```tsx
const SOS_HOLD_DURATION_MS = 2_000;                       // incident.tsx:70
// …hold-progress fill driven by elapsed time against the 2 s threshold:
const elapsedMs = Date.now() - holdStartedAtRef.current;
const nextProgress = Math.min(1, elapsedMs / SOS_HOLD_DURATION_MS); // :618–619
// …native long-press threshold bound to the same 2 s constant:
delayLongPress={SOS_HOLD_DURATION_MS}                     // :929
```

The gesture is a full press-and-hold with a progress fill that completes at
`SOS_HOLD_DURATION_MS = 2_000` ms, plus the two-step protection (a single tap
never submits; the 2 s hold only opens the explicit danger-confirm dialog;
submit requires the confirm `onConfirm`). This is enforced by the driver-app
incident tests (§4).

> **Correction note (reopen):** An earlier revision of this closeout
> (commit `edd1e21b`) claimed the shipped screen held at **0.8 s** and bundled a
> code edit to "fix" it. That was wrong. It was authored against a **stale base**
> (`0e3de49b`, 58 commits behind `dev`), where `incident.tsx` was the
> *pre-rewrite* draft using a since-removed `SOS_LONG_PRESS_DELAY_MS = 800`
> constant. The shipped `UI-FE-DRV-SOS` rewrite (`e2427577`) replaced that draft
> entirely with the `SOS_HOLD_DURATION_MS = 2_000` hold-progress model above.
> The bundled `incident.tsx` edit has been **dropped** (this branch is rebased
> onto `origin/dev` and carries zero code delta); the `0.8 s` value never existed
> on `dev`.

**SOS press-and-hold 2 s (Q-DRV11) contract status: VERIFIED as already shipped.**

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

This branch is rebased onto `origin/dev` (`64638c94`) and carries **zero code
delta** vs `dev` (net diff = this doc only), so the driver-app gate state here is
exactly `dev`'s. Reran the gates on the merged tree after building workspace deps
(`pnpm turbo run build --filter=@drts/driver-app^...` so `@drts/contracts` /
`@drts/ui-tokens` resolve):

- `pnpm --filter @drts/driver-app typecheck` (`tsc --noEmit`) → **exit 0**
- `pnpm --filter @drts/driver-app exec vitest run` → **12 files, 44 tests passed**
  (includes the driver-app incident tests covering the SOS hold + two-step gate)

## 5. Acceptance mapping

| Acceptance criterion | Status | Evidence |
| --- | --- | --- |
| All 9 sub-tasks done | ✅ | §1 ledger — all `done` + approved; 3 merged to `dev`, 6 on per-owner lane branches (see §1 merge-state call-out) |
| Closeout doc | ✅ | this document |
| Two device-class verification (412×892 + 360×780) | ✅ (canvas + code bound; no live screenshots — see §3 scope note) | §3 |
| SOS press-and-hold 2s contract verified | ✅ | §2 — already shipped in `e2427577` via `SOS_HOLD_DURATION_MS = 2_000` (no defect, no corrective change); typecheck + tests green (§4) |

## 6. Reviewer guidance (Claude)

1. Confirm against the canonical machine-truth root (`AI_STATUS_ROOT` /
   `ORCH_STATUS_ROOT`) that each §1 `commit_hash` is the finalized `done` commit
   for its sub-task, and note the §1 merge-state call-out (only IDX/PP/SOS are on
   `dev`; the other 6 are on per-owner lane branches).
2. Confirm this branch carries **zero code delta vs `origin/dev`**
   (`git diff --stat origin/dev HEAD` → this doc only) — the prior reopen's two
   blockers are resolved: the stale `incident.tsx` clobber is dropped, and §2 now
   states the SOS 2 s contract is verified as **already shipped** in `e2427577`
   (`SOS_HOLD_DURATION_MS = 2_000`), with no defect and no corrective change.
3. Confirm the §3 device-class binding and the honest screenshot-scope note are
   acceptable for closeout, or request live captures if a simulator is available
   in your lane.
