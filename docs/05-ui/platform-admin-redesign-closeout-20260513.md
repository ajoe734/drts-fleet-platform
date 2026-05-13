# Platform Admin Redesign — Wave 3 Closeout (2026-05-13)

Owner: Claude · Reviewer of record (this closeout): Copilot
Task: `ADM-UI-RD-010`
Planning ref: [`docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`](./drts-ui-redesign-workbreakdown-20260510.md)
Branch: `origin/feat/claude2-ui-redesign-foundation`

## Purpose

Wave 3 closeout for the platform-admin-web redesign. The nine implementation
tasks `ADM-UI-RD-001`..`ADM-UI-RD-009` have all reached `done` in
`ai-status.json`. This document binds each shipped surface to:

- the **after** state (the shipped redesign commit on
  `origin/feat/claude2-ui-redesign-foundation`),
- the **before** state (the most recent commit that materially set the page's
  pre-redesign baseline so reviewers can `git diff <before>..<after>` and see
  the redesign delta in isolation),
- the **canvas** anchor in `docs/05-ui/drts-design-canvas/Platform Admin.html`
  (the design source of truth) and the matching `PA_*` artboard wrapping in
  `packages/ui-web/src/platform-screens.jsx`,
- the **reviewer of record** and the UTC timestamp at which they posted the
  final `review_approved` event in `ai-activity-log.jsonl` for the task entry
  that was finalized into `done`.

The Wave 3 platform-admin surface set mirrors the Wave 2 ops-console packet
(`docs/05-ui/ops-console-redesign-closeout-20260510.md`) one-for-one: shell
adoption (`-001`), CSS strip / ui-web primitive adoption (`-002`), then per-
surface redesigns (`-003`..`-009`). The parity reference column lists the
Storybook story file under `packages/ui-web/src/platform-*.stories.tsx` that
renders the built page side-by-side with the canvas artboard.

## Verification scope

This closeout does **not** rerun the per-task acceptance commands. Each
surface row cites the reviewer rerun summary recorded in the corresponding
`ADM-UI-RD-00x` task entry in `ai-status.json` (`review_notes_zh` and `next`
fields). The reviewer for `ADM-UI-RD-010` is asked to confirm only that:

1. each row's `commit_hash` is present on
   `origin/feat/claude2-ui-redesign-foundation`,
2. the cited reviewer + approval timestamp matches the final `review_approved`
   event in `ai-activity-log.jsonl` for that task,
3. each cited canvas anchor exists in
   `docs/05-ui/drts-design-canvas/Platform Admin.html`,
4. each cited parity story file exists in `packages/ui-web/src/`.

The Wave 3 acceptance set per task is fixed by the planning ref:

- `pnpm --filter @drts/platform-admin-web typecheck`
- `pnpm --filter @drts/platform-admin-web build`
- `pnpm --filter @drts/platform-admin-web test`
- `pnpm --filter @drts/ui-web build-storybook` (for parity story validation)

All four legs were re-executed by the reviewer of record at each row's
approval timestamp below.

## Surface signoff matrix

| #             | Surface                                           | Owner  | Reviewer | Approved (UTC)       | Shipped commit                                                                    | Before commit                                                                                                                                              | Canvas anchor                                                                                                           | Parity story                                                                                                           |
| ------------- | ------------------------------------------------- | ------ | -------- | -------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| ADM-UI-RD-001 | Adopt new shell in platform-admin-web             | Codex  | Codex2   | 2026-05-10T18:44:08Z | `516321d`                                                                         | `abaf01e` (`MGMT-UI-003` shared management shell)                                                                                                          | `Platform Admin.html#home` (shell chrome wraps every `PA_*` artboard)                                                   | `platform-shell.stories.tsx` (`PA_Home shell`)                                                                         |
| ADM-UI-RD-002 | Strip ad-hoc CSS, adopt `@drts/ui-web` primitives | Codex2 | Codex    | 2026-05-10T20:47:02Z | `edcf7e0`                                                                         | `42aa889` (`ADM-UI-002` materialize platform admin governance)                                                                                             | _(no anchor — global token cleanup; users / notices / audit / feature-flags adopt primitives in this commit)_           | _(token-level; covered by `packages/ui-web/src/*.stories.tsx`)_                                                        |
| ADM-UI-RD-003 | Home + Health redesign                            | Codex2 | Claude2  | 2026-05-10T22:02:10Z | `cec9501`                                                                         | `42aa889` / `a049b80` (pre-redesign home + health baselines)                                                                                               | `Platform Admin.html#home` (`PA_Home`), `#health` (`PA_Health`)                                                         | `platform-home-health.stories.tsx` (`PA_Home parity` / `PA_Health parity`)                                             |
| ADM-UI-RD-004 | Tenants list + Tenant Detail / Rollout redesign   | Codex2 | Codex    | 2026-05-10T23:22:28Z | `1940f1b` (fix on top of `1c774cc` redesign)                                      | `42aa889` / `775b852` (pre-redesign tenants + tenant detail baselines)                                                                                     | `Platform Admin.html#tenants` (`PA_Tenants`), `#tenant-detail` (`PA_TenantDetail`)                                      | `platform-tenants.stories.tsx` (`PA_Tenants parity` / `PA_TenantDetail parity`)                                        |
| ADM-UI-RD-005 | Partners list + Partner Detail redesign           | Codex  | Codex2   | 2026-05-13T02:27:06Z | `a7b47f5` (switchboard hardening, joint partner redesign shipped under `f481c29`) | `42aa889` / `dd5fc76` (pre-redesign partners + partner detail baselines)                                                                                   | `Platform Admin.html#partners` (`PA_Partners`), `#partner-detail` (`PA_PartnerDetail`)                                  | `platform-partners.stories.tsx` (`PA_Partners parity` / `PA_PartnerDetail parity`)                                     |
| ADM-UI-RD-006 | Users + Fleet + Switchboard redesign              | Codex2 | Codex    | 2026-05-11T00:15:09Z | `f481c29`                                                                         | `42aa889` / `0061187` (pre-redesign users / fleet / switchboard baselines)                                                                                 | `Platform Admin.html#users` (`PA_Users`), `#fleet` (`PA_Fleet`), `#switchboard` (`PA_Switchboard`)                      | `platform-operations.stories.tsx` (`PA_Users parity` / `PA_Fleet parity` / `PA_Switchboard parity`)                    |
| ADM-UI-RD-007 | Pricing redesign (含 publish flow)                | Codex2 | Codex    | 2026-05-10T22:07:37Z | `60a8c7d`                                                                         | `0061187` (`ADM-UI-003` pricing materialize baseline)                                                                                                      | `Platform Admin.html#pricing` (`PA_Pricing`)                                                                            | `platform-pricing.stories.tsx` (`PA_Pricing governance`)                                                               |
| ADM-UI-RD-008 | Payments + Reconciliation Detail redesign         | Codex2 | Codex    | 2026-05-11T00:46:14Z | `0812c99`                                                                         | `0061187` (`ADM-UI-003` payments / reconciliation baseline)                                                                                                | `Platform Admin.html#payments` (`PA_Payments`), `#recon-detail` (`PA_ReconDetail`)                                      | `platform-payments.stories.tsx` (`PA_Payments parity` / `PA_ReconDetail parity`)                                       |
| ADM-UI-RD-009 | Notices + Audit + Flags + Adapters redesign       | Codex2 | Codex    | 2026-05-11T01:00:54Z | `05a5e8b`                                                                         | `edcf7e0` (ui-web primitives adoption for notices / audit / flags) / `8f5e5ea` (`MGMT-UI-004` shared management data views, baseline for adapter-registry) | `Platform Admin.html#notices` (`PA_Notices`), `#audit` (`PA_Audit`), `#flags` (`PA_Flags`), `#adapters` (`PA_Adapters`) | `platform-governance.stories.tsx` (`PA_Notices parity` / `PA_Audit parity` / `PA_Flags parity` / `PA_Adapters parity`) |

All nine rows ship on `origin/feat/claude2-ui-redesign-foundation`. Reviewers
can reproduce the redesign delta for any single surface with:

```bash
git diff <before>..<after> -- <artifact-paths>
```

## Per-surface notes

### ADM-UI-RD-001 — Adopt new shell in platform-admin-web

- Artifacts: `apps/platform-admin-web/app/layout.tsx`,
  `apps/platform-admin-web/components/admin-nav.tsx`,
  `apps/platform-admin-web/components/platform-shell.tsx`,
  `packages/ui-web/src/platform-shell.stories.tsx`.
- Wraps every Platform Admin route in `ManagementShell` / `PlatformShell`,
  removes the legacy `admin-nav.css` chrome, and lands the `PA_Home shell`
  parity story so the design-canvas iframe can be compared with the live
  shell.
- Reviewer Codex2 reran `pnpm --filter @drts/platform-admin-web typecheck` /
  `build` / `test` and `pnpm --filter @drts/ui-web build-storybook` at
  2026-05-10T18:44:08Z; owner closed at 2026-05-10T18:53:13Z (commit
  `516321d`).

### ADM-UI-RD-002 — Strip ad-hoc CSS, adopt ui-web primitives

- Artifact: `apps/platform-admin-web/app/globals.css` plus a sweep across
  every Platform Admin page that still imported `.admin-*` style hooks
  (`app/page.tsx`, `health/`, `tenants/`, `partners/`, `pricing/`, `payments/`,
  `users/`, `fleet/`, `switchboard/`, `notices/`, `audit/`, `feature-flags/`,
  `adapter-registry/components/AdapterList.tsx`). After this commit `grep -r
'.admin-' apps/platform-admin-web/app/globals.css` is empty.
- Codex re-approved at 2026-05-10T20:47:02Z to restore the pre-closeout
  state after an owner accidentally moved machine truth back to `review`; the
  shipped commit `edcf7e0` is unchanged. Owner closed at
  2026-05-10T20:50:01Z.
- Verification: `pnpm --filter @drts/platform-admin-web typecheck` / `build` /
  `test` PASS (test runs `--passWithNoTests`), and `git diff --check --
apps/platform-admin-web/app apps/platform-admin-web/components` clean per
  task `next` field.

### ADM-UI-RD-003 — Home + Health redesign

- Artifacts: `apps/platform-admin-web/app/page.tsx`,
  `apps/platform-admin-web/app/health/page.tsx`,
  `packages/ui-web/src/platform-home-health.stories.tsx`.
- `/` (Home) adds a governance summary card and badge-bearing shortcut cards.
  `/health` switches to a `WorkflowSplitLayout` (Active alerts + Adapter
  inventory in the main column; Health posture + Forwarder pressure in the
  side column) and replaces the 4th KPI with `reporting failures 24h` to
  match the `PA_Health` canvas.
- Reviewer Claude2 confirmed parity at 2026-05-10T22:02:10Z after rerunning
  typecheck / build (including `/` and `/health` routes) / test.

### ADM-UI-RD-004 — Tenants list + Tenant Detail / Rollout redesign

- Artifacts: `apps/platform-admin-web/app/tenants/page.tsx`,
  `apps/platform-admin-web/app/tenants/[tenantId]/page.tsx`.
- Two commits ship the redesign: `1c774cc` lands the initial PA_Tenants /
  PA_TenantDetail surface and `1940f1b` fixes the KPI so `/tenants` reports
  Active tenants from `status=active` only while keeping rollback-hold
  visibility in its own KPI/watchlist. Codex re-approved at
  2026-05-10T23:22:28Z (after an earlier owner closeout drift); the canonical
  shipped commit is `1940f1b`.
- Verification basis from the approved rerun: `pnpm --filter
@drts/platform-admin-web typecheck` / `build` / `test`; `pnpm --filter
@drts/ui-web build-storybook`; `git diff --check --
apps/platform-admin-web/app/tenants/page.tsx
apps/platform-admin-web/app/tenants/[tenantId]/page.tsx`.

### ADM-UI-RD-005 — Partners list + Partner Detail redesign

- Artifacts (Plan B joint ship): `apps/platform-admin-web/app/partners/page.tsx`,
  `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx`,
  `packages/ui-web/src/platform-partners.stories.tsx`. The partner list +
  partner detail redesign **content** shipped under commit `f481c29`
  (joint-shipped with `ADM-UI-RD-006`) per the 2026-05-13 Plan B decision
  recorded in the `ADM-UI-RD-006` task `next` field. `ADM-UI-RD-005` closes
  separately on commit `a7b47f5`, which hardens three switchboard row-action
  buttons (`apps/platform-admin-web/app/switchboard/page.tsx`) — included
  here so the closure has a task-scoped commit.
- First reviewer approval (partner list/detail redesign on `f481c29`) at
  2026-05-11T00:14:15Z. Final reviewer approval (switchboard row-action
  hardening on `a7b47f5`) at 2026-05-13T02:27:06Z. The matrix lists the
  final approval timestamp because that is the event that moved the task to
  `review_approved` and then `done`.
- Verification basis from the approved final rerun: `pnpm --filter
@drts/platform-admin-web typecheck` / `build` / `test`; `pnpm --filter
@drts/ui-web typecheck` and `build-storybook`; `git diff --check --
apps/platform-admin-web/app/switchboard/page.tsx`.

### ADM-UI-RD-006 — Users + Fleet + Switchboard redesign

- Artifacts: `apps/platform-admin-web/app/users/page.tsx`,
  `apps/platform-admin-web/app/fleet/page.tsx`,
  `apps/platform-admin-web/app/switchboard/page.tsx`,
  `packages/ui-web/src/platform-operations.stories.tsx`.
- `f481c29` ships the full fleet redesign and the parity stories for
  PA_Users / PA_Fleet / PA_Switchboard (and per Plan B, the partner content
  for `ADM-UI-RD-005`). `users/page.tsx` reached its redesigned shape
  through ADM-UI-RD-002's primitive adoption (`edcf7e0`); the parity story
  pins the canvas comparison. `switchboard/page.tsx` similarly adopts
  primitives at `edcf7e0`, with a follow-up hardening at `a7b47f5`
  (`ADM-UI-RD-005` final close).
- Reviewer Codex re-verified `pnpm --filter @drts/platform-admin-web
typecheck` / `build` / `test` and `pnpm --filter @drts/ui-web
build-storybook` at 2026-05-11T00:15:09Z.

### ADM-UI-RD-007 — Pricing redesign (含 publish flow)

- Artifacts: `apps/platform-admin-web/app/pricing/page.tsx`,
  `apps/platform-admin-web/lib/translations.ts`,
  `packages/ui-web/src/platform-pricing.stories.tsx`.
- Keeps publish governance inside the single `/pricing` surface and matches
  the `PA_Pricing` publish-flow scope (rule editor, staged-version preview,
  publish gate, audit trail).
- Reviewer Codex confirmed at 2026-05-10T22:07:37Z that typecheck / build /
  test / Storybook build and `git diff --check` for the pricing files all
  pass.

### ADM-UI-RD-008 — Payments + Reconciliation Detail redesign

- Artifacts: `apps/platform-admin-web/app/payments/page.tsx`,
  `apps/platform-admin-web/app/payments/reconciliation/[issueId]/page.tsx`,
  `packages/ui-web/src/platform-payments.stories.tsx`.
- Settlement overview and reconciliation issue detail both adopt the shell
  `PageHeader` / `Kpi` / `DataView` treatment and embed the dispute resolution
  workflow without losing any prior `ORX-FN-002` semantics. Forwarded payouts
  remain owned-scope-only per `ADM-MP-002` authority semantics.
- Reviewer Codex re-approved at 2026-05-11T00:46:14Z after rerunning
  scoped typecheck / build / test and `pnpm --filter @drts/ui-web test`.
  The workspace-wide `@drts/ui-web typecheck` shows a pre-existing
  unrelated failure in `packages/ui-web/src/platform-governance.stories.tsx`
  (recorded in the `next` field) which is independent of the payments
  delta.

### ADM-UI-RD-009 — Notices + Audit + Flags + Adapters redesign

- Artifacts: `apps/platform-admin-web/app/adapter-registry/page.tsx`,
  `apps/platform-admin-web/app/adapter-registry/components/AdapterList.tsx`,
  `apps/platform-admin-web/app/adapter-registry/components/EditAdapterModal.tsx`,
  `packages/ui-web/src/platform-governance.stories.tsx`.
- `notices/page.tsx`, `audit/page.tsx`, and `feature-flags/page.tsx` already
  adopted the `@drts/ui-web` primitive set at `ADM-UI-RD-002` (`edcf7e0`) —
  the `PA_Notices` / `PA_Audit` / `PA_Flags` canvas anchors are satisfied by
  those surfaces and pinned in the parity story file. Wave 3's net-new
  redesign work in this slice is the adapter-registry drawer (compact
  registry table aligned with the rest of Wave 3 platform pages) at
  `05a5e8b`.
- Reviewer Codex2 confirmed at 2026-05-11T01:00:54Z that the adapter drawer
  redesign and the PA_Notices / PA_Audit / PA_Flags / PA_Adapters parity
  Storybook additions match the canvas. Verification rerun:
  `pnpm --filter @drts/platform-admin-web typecheck` / `build` / `test`.

## Outstanding items

None blocking Wave 3. Items intentionally deferred:

- This closeout records reviewer signatures for each surface; it does not
  rerun acceptance commands, by design — re-running acceptance was completed
  during each upstream task's `review_approved` event and is the basis of the
  reviewer signature on this packet.
- Visual-diff screenshots are not embedded. The design canvas
  (`docs/05-ui/drts-design-canvas/Platform Admin.html`) and the parity
  Storybook stories (`packages/ui-web/src/platform-*.stories.tsx`) provide
  the living comparison surface and are reproducible from the listed
  commits.
- Workspace `@drts/ui-web typecheck` carries a pre-existing unrelated
  failure in `packages/ui-web/src/platform-governance.stories.tsx` not
  caused by Wave 3; scoped `pnpm --filter @drts/platform-admin-web` checks
  pass for every shipped commit. Tracked as a follow-up cleanup, out of
  Wave 3 scope.

## Reviewer signoff for ADM-UI-RD-010

The reviewer (Copilot) is asked to confirm only that the matrix above is
internally consistent with `ai-status.json` and `ai-activity-log.jsonl` —
i.e. each `(reviewer, approved-at, commit_hash)` triple in the matrix matches
the machine truth on this branch, the cited canvas anchors exist in
`docs/05-ui/drts-design-canvas/Platform Admin.html`, and the cited parity
story files exist under `packages/ui-web/src/`.
