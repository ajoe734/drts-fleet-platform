# Platform Admin · Sandbox Governance — v9 Canvas Parity Verification

> Task: `P2-V9-UI-ADM-001`
> Date: 2026-06-28
> Owner: Claude · Reviewer: Codex2
> Phase: `phase2-tesla-fsd-sandbox-v9-ui-20260628`
> Planning ref: `docs/02-architecture/phase2_tesla_fsd_sandbox_v9_ui_execution_wave_20260628.md`

## Design authority (provenance)

- IA / visual authority: `docs/05-ui/drts-design-canvas/archive/driver-app-9-20260628/Platform Admin.html`
  (section `03d · FSD 沙盒治理 Sandbox Governance`) and `platform-sandbox.jsx`.
- Archive source SHA-256: `3dfec6b873e09ef456cc62a52d0ad12fd4cea0224dc0db684320a3225d14b8ce`.
- Runtime target: `apps/platform-admin-web/`.

## Status summary

The Sandbox Governance runtime surface was first landed under `P2-UI-ADM-001`
(#946, reachable from `origin/dev@589df2125`). This v9 wave re-verifies the
runtime against the archived v9 canvas and closes one faithful parity gap. The
runtime already covers every Sandbox Governance screen defined in the v9 canvas
using `@drts/ui-web` canvas primitives + realm tokens (`buildCanvasTheme({
surface: "platform" })`). No bespoke design system or raw hex palette is
introduced.

## Canvas → runtime parity checklist

| v9 canvas component (`platform-sandbox.jsx`) | Runtime implementation | Status |
|---|---|---|
| `PA_Experiments` (Experiments list, route `/sandbox/experiments`) | `app/sandbox/page.tsx` (section root `/sandbox`); ID/名稱/主管轄區/區域/車輛/安全員/期間/狀態 columns; 全部 + 進行中 tabs | ✅ parity |
| `PA_ExperimentDetail` (tabbed detail) | `app/sandbox/[experimentId]/page.tsx`; tabs areas/vehicles/operators/tesla/capabilities/policies via `?tab=` | ✅ parity |
| `PSB_AreasEditor` (PostGIS polygon/route map) | `AreasTab` + `components/sandbox/sandbox-geometry-map.tsx` (renders real `ApprovedOperatingAreaRecord`/`ApprovedRouteRecord` geometry; toolbar present) | ⚠️ read-only — see API gaps |
| `PSB_VehicleEnroll` | `VehiclesTab` (vehicle/provider/areas/maxTrips/effective/status from `VehicleEnrollmentRecord`) | ✅ parity |
| `PSB_OperatorQual` | `OperatorsTab` (operator/certs/areas/effective/status from `SafetyOperatorQualificationRecord`) | ✅ parity |
| `PSB_TeslaIntegration` (capability flags) | `TeslaTab` (`evaluateCapabilityGates` → enabled/gated rows + fail-closed banner) | ✅ parity |
| `PSB_Capabilities` (jurisdiction profile) | `CapabilitiesTab` (jurisdiction/profile/regulator/leadTime/window/maxVehicles + policy-snapshot note) | ✅ parity |
| `PSB_Policies` (evidence + reporting) | `PoliciesTab` (retention / reporting cards) | ✅ parity |
| `PA_SandboxSuspend` (Suspension/Resume) | `app/sandbox/suspend/page.tsx` (per-experiment suspend/resume wired to client; effects card) | ✅ parity |

## Acceptance evidence

1. **Sandbox governance routes match v9 canvas** — list (`/sandbox`), tabbed
   detail (`/sandbox/[experimentId]?tab=…`), and suspend/resume
   (`/sandbox/suspend`) all present and nav-wired (`components/admin-shell.tsx`
   `sandbox` section; `components/assistant/route-context.ts`). The canvas's
   prototype `/sandbox/experiments` URL maps to the runtime section root
   `/sandbox`; all canvas screens exist.
2. **version / effective-date visible** — `VersionSummary` card on the detail
   page renders version no, lifecycle, authorization, effective window
   (`effectiveWindow`), and published date. The list shows the effective window
   per experiment.
3. **capability-gated states visible** — `TeslaTab` renders
   `evaluateCapabilityGates(version.requiredCapabilities)` as enabled vs `gated`
   pills, plus the fail-closed banner; vehicle/operator/experiment status pills
   show suspended/revoked tones.
4. **suspend/resume flow present** — `/sandbox/suspend` calls
   `client.suspendSandboxExperiment` / `resumeSandboxExperimentAuthorizations`
   with reason, then reloads and surfaces a success banner.
5. **area/route editor implemented or API gap recorded** — `SandboxGeometryMap`
   renders real PostGIS polygon/linestring geometry read-only with the toolbar
   from the canvas; mutable editing is recorded as an API gap below.
6. **typecheck/build evidence recorded** — see below.

## v9 parity change in this wave

- `app/sandbox/[experimentId]/page.tsx`: the experiment-detail header subtitle
  now composes `name · jurisdiction · area` (matching canvas
  `PA_ExperimentDetail` subtitle e.g. `台北 FSD 監理沙盒一期 · 台北市 · 信義 / 南港`)
  from already-loaded jurisdiction-version and operating-area records, instead of
  showing the version name only. No new data fetch; no visual redesign.

## API / backend gaps (recorded, not invented)

- **Create experiment CTA**: canvas `PA_Experiments` shows a primary `建立實驗`
  action. No create-experiment mutation is exposed by the platform-admin client,
  so the runtime does not render a non-functional CTA (v9 rule: state-changing
  CTAs must resolve from `availableActions`). The list instead links to the
  suspend console.
- **Approval-documents CTA**: canvas `PA_ExperimentDetail` shows a `核准文件`
  action; no corresponding read/write endpoint is wired, so it is omitted.
- **Mutable area/route editing**: canvas `PSB_AreasEditor` implies draw/edit of
  PostGIS polygons/routes + `儲存並送審核准`. The runtime renders geometry
  read-only because no approved-operating-area write/submit endpoint exists in
  the admin client; the editor toolbar is shown for IA parity and a read-only
  note banner is surfaced.

## Build / typecheck evidence

- `pnpm --filter @drts/platform-admin-web typecheck` → **PASS** (`tsc --noEmit`,
  exit 0).
- `npx eslint "app/sandbox/[experimentId]/page.tsx" --max-warnings=0` → **PASS**
  (exit 0).
- `pnpm --filter @drts/platform-admin-web build` (Next 16 default Turbopack) →
  **FAILS in the isolated task worktree only** with
  `TurbopackInternalError: Symlink [project]/apps/platform-admin-web/node_modules
  is invalid, it points out of the filesystem root`. This is a worktree
  environment limitation (the worktree's `node_modules` are symlinks into the
  canonical repo, which Turbopack refuses to follow), not a code defect.
- `npx next build --webpack` → used to obtain a real production build from the
  worktree, bypassing the Turbopack symlink restriction (see task evidence /
  `INTEGRATION_STATUS`). CI on `dev` builds this surface with the standard
  pipeline.
