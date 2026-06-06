# DH-FLP-DEPLOY SIDECAR ACCEPTANCE PACKET

- Parent Task: `DH-FLP-DEPLOY`
- Sidecar Task: `DH-FLP-DEPLOY-SIDECAR-ACCEPTANCE`
- Owner: `Codex`
- Reviewer: `Claude2`
- Parent Owner / Reviewer: `Claude2` / `Codex2`
- Scope Guardrail: support artifact only; no canonical truth or runtime implementation changes

## 1. Purpose

This packet prepares reviewer-facing acceptance support for `DH-FLP-DEPLOY`.
It does not change canonical truth. It packages:

- the current machine-truth snapshot for the sidecar and parent task
- the dependency edge from `DH-FLP-UI-WIRE`
- the deploy / Docker / cross-app-link seams the parent owner must close
- repo-visible evidence anchors the reviewer can spot-check during handoff

## 2. Machine-Truth Snapshot

Snapshot source: task-slice reads via `scripts/ai-status.sh show`, captured during
this pass on `2026-06-06`.

### Sidecar task

- `DH-FLP-DEPLOY-SIDECAR-ACCEPTANCE`
- status: `in_progress`
- owner / reviewer: `Codex` / `Claude2`
- acceptance:
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`

### Parent task

- `DH-FLP-DEPLOY`
- status: `in_progress`
- owner / reviewer: `Claude2` / `Codex2`
- depends on: `DH-FLP-UI-WIRE`
- recorded acceptance:
  - `Dockerfile builds standalone; deploy-dev builds+pushes+deploys the portal service; cross-app link registered; deploy-dev workflow valid`

### Upstream dependency already closed

- `DH-FLP-UI-WIRE`
- status: `done`
- closeout commit: `bf7dc31a6d573a33a9817f351ee58f8e95f16091`
- integration status: `branch_pushed`
- recorded result: all 10 fleet-partner portal routes render live partner-scoped
  data with graceful fallback; `typecheck`, `lint`, and `build` passed on the
  dependency branch

## 3. Scope Boundary

- Allowed: reviewer support for the Fleet Partner Portal deploy slice.
- Allowed: acceptance checklist, dependency map, evidence index, and reviewer
  instructions.
- Not allowed: edits to `.github/workflows/deploy-dev.yml`, app Dockerfiles,
  cross-app navigation runtime code, contracts, or machine-truth closeout for
  `DH-FLP-DEPLOY`.

## 4. Dependency Map

### 4.1 Hard upstream dependency

| Dependency | Status | Why it matters to deploy acceptance |
| --- | --- | --- |
| `DH-FLP-UI-WIRE` | `done` | Deploy acceptance assumes the portal app already exists as a runnable Next app with live `/api/fleet-partner/*` seams, route inventory, and port `3007` scripts on the dependency branch. |

### 4.2 Canonical product / architecture dependencies

| Source | Reviewer use |
| --- | --- |
| `docs/05-ui/fleet-partner-portal-design-handoff-20260604.md:12-19` | Confirms this is a brand-new portal surface and that deploy work must not invent missing product contracts. |
| `docs/05-ui/fleet-partner-portal-design-handoff-20260604.md:70-84` | Confirms the portal is read-first, fleet-partner-scoped, and must keep contract gaps visible. |
| `docs/05-ui/fleet-partner-portal-design-handoff-20260604.md:355-372` | Confirms the current portal endpoint matrix and the P0 pages that still lack explicit portal APIs. |
| `docs/02-architecture/cross-app-navigation-and-shell-topology-20260524.md:96-99` | Confirms cross-app links are an explicit acceptance surface and must obey access / hidden-disabled rules. |

### 4.3 Repo seams the parent task must close

| Surface | Current repo-visible state | Parent acceptance expectation |
| --- | --- | --- |
| `apps/fleet-partner-portal-web` app | Not present on `dev`, but present on `origin/claude/dh-flp-ui-wire` with package name `@drts/fleet-partner-portal-web` and `3007` dev/start scripts. | Parent reviewer must evaluate deploy work against the branch that includes the UI-wire dependency, not `dev` alone. |
| `apps/fleet-partner-portal-web/Dockerfile` | No repo-visible Dockerfile on `dev` or on the shared refs inspected during this pass. | Parent must add a standalone Dockerfile for the portal, following existing control-plane web deploy conventions and honoring port `3007`. |
| `.github/workflows/deploy-dev.yml` | Current workflow prepares, builds, deploys, waits for readiness, and resolves URLs only for `api`, `platform-admin-web`, and `ops-console-web`. | Parent must extend prepare/build/deploy/health-check stages for the Fleet Partner Portal service without regressing existing services. |
| cross-app navigation registration | Repo currently exposes existing cross-app helpers such as `apps/ops-console-web/lib/ops-cross-app-links.ts`; no fleet-portal registration seam is repo-visible on `dev` in this pass. | Parent must register at least one valid cross-app link where appropriate, and the reviewer should verify it follows the shared cross-app contract rules. |
| shared app identity surface | `packages/shared-types/src/index.ts:1-6` currently lists `tenant-portal-web`, `platform-admin-web`, `ops-console-web`, `driver-app`, and `api` only. | If Fleet Partner Portal integration requires a new shared surface identifier, reviewer should confirm the parent task updates the correct shared seam rather than hardcoding app identity ad hoc. |

## 5. Acceptance Checklist For Parent Review

- [ ] Portal deploy review is performed against a tree that includes the
      `DH-FLP-UI-WIRE` app surface, not `dev` alone.
- [ ] `apps/fleet-partner-portal-web/Dockerfile` exists and follows the same
      standalone deployment pattern used by existing control-plane web apps.
- [ ] The Dockerfile builds the portal app package
      `@drts/fleet-partner-portal-web`.
- [ ] Runtime port alignment is consistent end-to-end:
      app scripts use `3007`, Docker runtime exposes `3007`, and Cloud Run
      deploy uses the same public port.
- [ ] `.github/workflows/deploy-dev.yml` adds Fleet Partner Portal service
      config to `prepare` outputs / defaults, image build+push, Cloud Run
      deploy, readiness wait loop, and URL resolution.
- [ ] Existing `api`, `platform-admin-web`, and `ops-console-web` deploy steps
      remain intact.
- [ ] Any shared app-surface registration needed for cross-app navigation is
      done in the canonical shared seam, not only inside one page component.
- [ ] At least one valid cross-app link for the Fleet Partner Portal is
      registered where product rules allow it.
- [ ] Parent verification evidence covers the workflow as edited, not only the
      new Dockerfile in isolation.
- [ ] This sidecar task changed only support material.

## 6. Repo-Visible Evidence Anchors

These anchors are reviewer aids only. They do not replace the parent owner's
own handoff evidence.

### 6.1 Existing deploy workflow baseline on `dev`

- `.github/workflows/deploy-dev.yml:68-85`
  current prepare outputs expose only `api_service`, `platform_admin_service`,
  and `ops_console_service`
- `.github/workflows/deploy-dev.yml:151-160`
  current default service-name / origin resolution has no Fleet Partner Portal
  service slot
- `.github/workflows/deploy-dev.yml:233-279`
  current image build phase has `api`, `migrate`, `platform-admin-web`,
  `ops-console-web` only
- `.github/workflows/deploy-dev.yml:409-486`
  current deploy phase targets only the three existing services
- `.github/workflows/deploy-dev.yml:507-557`
  current health-check / URL resolution loops include only the same three
  services

### 6.2 UI-wire dependency evidence

- `origin/claude/dh-flp-ui-wire:apps/fleet-partner-portal-web/package.json:2-12`
  proves the dependency branch defines `@drts/fleet-partner-portal-web` and
  runs on port `3007`
- `origin/claude/dh-flp-ui-wire:apps/fleet-partner-portal-web/lib/fleet-portal-nav.ts:11-86`
  shows the 9-page portal navigation inventory expected to survive deploy
  packaging
- `docs/05-ui/fleet-partner-portal-design-handoff-20260604.md:88-100`
  lists the same 9 P0 pages
- `docs/05-ui/fleet-partner-portal-design-handoff-20260604.md:355-372`
  lists the current portal endpoint matrix and unresolved contract-dependent
  pages

### 6.3 Shared cross-app / app-identity seams

- `docs/02-architecture/cross-app-navigation-and-shell-topology-20260524.md:96-99`
  defines cross-app link acceptance behavior
- `apps/ops-console-web/lib/ops-cross-app-links.ts:1-54`
  is the existing pattern for app-scoped cross-app link helpers
- `packages/shared-types/src/index.ts:1-6`
  is the current shared `ProductSurface` union and does not yet list a Fleet
  Partner Portal surface on `dev`

## 7. Reviewer Notes

- Treat `dev` as the current deploy baseline, not as proof the parent task is
  missing required files. `DH-FLP-UI-WIRE` is closed on a branch-pushed ref, so
  the deploy reviewer must evaluate the owner handoff tree that composes with
  that dependency.
- During this sidecar pass, no repo-visible committed Dockerfile or cross-app
  registration for Fleet Partner Portal was visible on the shared refs inspected
  from this worktree. If the parent owner has those changes only in a working
  tree, the reviewer should insist on normal branch evidence during handoff.
- Because this is a support-only slice, this packet intentionally does not claim
  the deploy workflow is already valid. It identifies the exact seams the owner
  must prove.

## 8. Sidecar Verification

This pass changes only:

- `support/sidecars/DH-FLP-DEPLOY/DH-FLP-DEPLOY-SIDECAR-ACCEPTANCE.md`

Verification performed for this sidecar artifact:

- task-slice machine-truth review via `AI_NAME=Codex scripts/ai-status.sh show`
  for `DH-FLP-DEPLOY-SIDECAR-ACCEPTANCE`, `DH-FLP-DEPLOY`, and
  `DH-FLP-UI-WIRE`
- repo-visible anchor scan for deploy workflow, shared app identity, cross-app
  link helper pattern, design handoff constraints, and UI-wire branch package
  metadata
- `git diff --check -- support/sidecars/DH-FLP-DEPLOY/DH-FLP-DEPLOY-SIDECAR-ACCEPTANCE.md`

No runtime checks were run for this sidecar itself because it does not change
executable behavior.
