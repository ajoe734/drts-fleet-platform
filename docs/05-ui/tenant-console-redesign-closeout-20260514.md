# Tenant Console Redesign — Wave 3 Closeout (2026-05-14, refreshed 2026-05-18)

Owner: Codex · Reviewer of record (this closeout): Codex2
Task: `TEN-UI-RD-099`
Planning ref: [`docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`](./drts-ui-redesign-workbreakdown-20260510.md)
Parity decisions companion: [`docs/05-ui/tenant-console-parity-decisions-20260510.md`](./tenant-console-parity-decisions-20260510.md)
Branches of record: `origin/feat/claude2-ui-redesign-foundation` (Wave 3 baseline), the preserved `codex/be-cc-001-fu-seed` branch-of-record for `TEN-UI-RD-013`, and the two owner closeout branches that finalized late parity-fill tasks on 2026-05-18 (`origin/codex/ten-ui-rd-010` and `origin/codex/ten-ui-rd-014`).

Refresh note: this packet was originally drafted on 2026-05-14. The
2026-05-18 refresh aligns it with current canonical machine truth after
`TEN-UI-RD-010` and `TEN-UI-RD-014` were re-reviewed and closed out on new
owner branches, while `TEN-UI-RD-013` was restored to its original shipped
tuple through a control-plane repair rather than a new parent-source delta.

## Purpose

Wave 3 closeout for the tenant-console-web redesign. The thirteen
implementation tasks `TEN-UI-RD-001`..`TEN-UI-RD-004` and
`TEN-UI-RD-010`..`TEN-UI-RD-018` have all reached `done` in `ai-status.json`.
This document binds each shipped surface to:

- the **after** state (the shipped redesign commit on its push branch),
- the **before** state (the most recent commit that materially set the page's
  pre-redesign baseline so reviewers can `git diff <before>..<after>` and see
  the redesign delta in isolation),
- the **canvas** anchor in `docs/05-ui/drts-design-canvas/Tenant Console.html`
  (the design source of truth) and the matching `TN_*` artboard wrapping in
  `docs/05-ui/drts-design-canvas/tenant-screens.jsx`,
- the **parity story** under `packages/ui-web/src/tenant-*.stories.tsx` that
  renders the built page side-by-side with the canvas artboard,
- the **reviewer of record** and the UTC timestamp at which they posted the
  final `review_approved` event in `ai-activity-log.jsonl` for the task entry
  that was finalized into `done`.

The Wave 3 tenant-console surface set mirrors the Wave 2 ops-console packet
(`docs/05-ui/ops-console-redesign-closeout-20260510.md`) and the Wave 3
platform-admin packet (`docs/05-ui/platform-admin-redesign-closeout-20260513.md`):
shell adoption + CSS strip (`-001`), per-surface redesigns of the existing IA
(`-002`..`-004`), then parity-fill routes for surfaces that had been
placeholder or missing IA in the previous wave (`-010`..`-018`). The
parity-fill split between `shipped` and `blocked` was decided in
`tenant-console-parity-decisions-20260510.md` and tracked there; the 2026-05-14
companion update at the head of that file records that `TEN-UI-RD-010`,
`TEN-UI-RD-013`, and `TEN-UI-RD-014` reopened and shipped after the
`BE-CC-001` / `BE-RULE-001` / `BE-QUOTA-001` / `BE-APR-001` contract set
landed.

## Verification scope

This closeout does **not** rerun the per-task acceptance commands. Each
surface row cites the reviewer rerun summary recorded in the corresponding
`TEN-UI-RD-00x` task entry in `ai-status.json` (`review_notes_zh` and `next`
fields). The reviewer for `TEN-UI-RD-099` is asked to confirm only that:

1. each row's `commit_hash` is present on its cited push branch,
2. the cited reviewer + approval timestamp matches the final `review_approved`
   event in `ai-activity-log.jsonl` for that task,
3. each cited canvas anchor exists in
   `docs/05-ui/drts-design-canvas/Tenant Console.html`,
4. each cited parity story file exists on the cited branch of record under
   `packages/ui-web/src/` (with the one explicit exception called out under
   "Outstanding items" below for `TN_ApiKeys`, which is `Storybook N/A` per
   its task entry).

For tasks that required an owner-closeout branch after reviewer approval
(`TEN-UI-RD-010` and `TEN-UI-RD-014`), the matrix intentionally pairs the
final `review_approved` tuple from `ai-activity-log.jsonl` with the final
`commit_hash` / `push_branch` tuple from the `done` row in `ai-status.json`.
This keeps the reviewer signature and the canonical closeout branch visible in
one place. `TEN-UI-RD-013` is the inverse case: a 2026-05-18 machine-truth
repair restored the original 2026-05-14 shipped tuple without introducing a
replacement parent implementation commit.

The Wave 3 acceptance set per task is fixed by the planning ref:

- `pnpm --filter @drts/tenant-console-web typecheck`
- `pnpm --filter @drts/tenant-console-web build`
- `pnpm --filter @drts/tenant-console-web test`
- `pnpm --filter @drts/ui-web build-storybook` (for parity story validation)

The exact rerun set per surface is captured in each task entry's
`review_notes_zh` / `next` fields and at the matching `review_approved` event
in `ai-activity-log.jsonl`. Not every row reran all four legs — the
per-surface notes below cite what was actually rerun at `review_approved` time
and call out the variants. This packet does not re-execute any leg; it cites
what was rerun at review approval.

## Surface signoff matrix

| #             | Surface(s)                                | Owner   | Reviewer | Approved (UTC)       | Shipped commit | Push branch                           | Canvas anchor                                                                                               | Parity story                                                                                               |
| ------------- | ----------------------------------------- | ------- | -------- | -------------------- | -------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| TEN-UI-RD-001 | Shell adoption + globals.css strip        | Claude2 | Codex    | 2026-05-10T16:30:56Z | `515f271`      | `feat/claude2-ui-redesign-foundation` | `Tenant Console.html#home` (shell chrome wraps every `TN_*` artboard)                                       | `tenant-shell.stories.tsx`                                                                                 |
| TEN-UI-RD-002 | Home + Bookings list + Booking Detail     | Codex   | Codex2   | 2026-05-11T01:36:04Z | `aae6d02`      | `feat/claude2-ui-redesign-foundation` | `Tenant Console.html#home` (`TN_Home`), `#bookings` (`TN_Bookings`), `#booking-detail` (`TN_BookingDetail`) | `tenant-home.stories.tsx`, `tenant-bookings.stories.tsx`, `tenant-booking-detail.stories.tsx`              |
| TEN-UI-RD-003 | Audit + Users + Settings                  | Codex2  | Codex    | 2026-05-11T01:11:08Z | `f4d91bb`      | `feat/claude2-ui-redesign-foundation` | `Tenant Console.html#audit` (`TN_Audit`), `#users` (`TN_Users`), `#settings` (`TN_Settings`)                | `tenant-audit.stories.tsx`, `tenant-users.stories.tsx`, `tenant-settings.stories.tsx`                      |
| TEN-UI-RD-004 | Tenant shell internal-language copy strip | Codex2  | Claude2  | 2026-05-11T01:18:29Z | `051b68c`      | `feat/claude2-ui-redesign-foundation` | _(no new anchor — shell-only copy replacement; verified against `Tenant Console.html#home` shell chrome)_   | `tenant-shell.stories.tsx` (`brandSub` / footer / search-note copy)                                        |
| TEN-UI-RD-010 | TN_NewBooking parity-fill                 | Codex2 -> Codex | Codex    | 2026-05-18T15:18:15Z | `12616aa`      | `codex/ten-ui-rd-010`                 | `Tenant Console.html#newbooking` (`TN_NewBooking`)                                                          | `tenant-new-booking.stories.tsx`                                                                           |
| TEN-UI-RD-011 | TN_Passengers parity-fill                 | Codex   | Codex2   | 2026-05-10T20:19:03Z | `1ceb922`      | `feat/claude2-ui-redesign-foundation` | `Tenant Console.html#passengers` (`TN_Passengers`)                                                          | `tenant-passengers.stories.tsx`                                                                            |
| TEN-UI-RD-012 | TN_Addresses parity-fill                  | Claude2 | Codex2   | 2026-05-10T19:14:46Z | `4f3956b`      | `feat/claude2-ui-redesign-foundation` | `Tenant Console.html#addresses` (`TN_Addresses`)                                                            | `tenant-addresses.stories.tsx`                                                                             |
| TEN-UI-RD-013 | TN_CostCenter parity-fill (read-only)     | Codex2  | Claude2  | 2026-05-14T03:16:30Z | `921c456`      | `codex/be-cc-001-fu-seed`             | `Tenant Console.html#costcenter` (`TN_CostCenter`)                                                          | `tenant-cost-centers.stories.tsx`                                                                          |
| TEN-UI-RD-014 | TN_Rules parity-fill                      | Codex   | Codex2   | 2026-05-18T15:30:26Z | `41bdce1`      | `codex/ten-ui-rd-014`                 | `Tenant Console.html#rules` (`TN_Rules`)                                                                    | `tenant-rules.stories.tsx`                                                                                 |
| TEN-UI-RD-015 | TN_Invoices parity-fill                   | Codex2  | Codex2   | 2026-05-10T19:23:35Z | `3daab74`      | `feat/claude2-ui-redesign-foundation` | `Tenant Console.html#invoices` (`TN_Invoices`)                                                              | `tenant-invoices.stories.tsx`                                                                              |
| TEN-UI-RD-016 | TN_Reports parity-fill                    | Codex2  | Codex    | 2026-05-10T23:56:22Z | `f8857db`      | `feat/claude2-ui-redesign-foundation` | `Tenant Console.html#reports` (`TN_Reports`)                                                                | `tenant-reports.stories.tsx`                                                                               |
| TEN-UI-RD-017 | TN_ApiKeys completion                     | Codex   | Claude2  | 2026-05-12T14:19:22Z | `4d8ce97`      | `feat/claude2-ui-redesign-foundation` | `Tenant Console.html#apikeys` (`TN_ApiKeys`)                                                                | _(Storybook N/A — see Outstanding items; parity verified against the canvas artboard at the cited anchor)_ |
| TEN-UI-RD-018 | TN_Webhooks completion                    | Codex2  | Codex    | 2026-05-12T16:56:16Z | `ea0c49c`      | `feat/claude2-ui-redesign-foundation` | `Tenant Console.html#webhooks` (`TN_Webhooks`)                                                              | `tenant-webhooks.stories.tsx`                                                                              |

All thirteen rows are recorded in machine truth in `ai-status.json` as `done`
with `commit_hash`, `commit_subject`, `push_remote`, and `push_branch` fields
populated. Ten rows ship on `origin/feat/claude2-ui-redesign-foundation`; the
three parity-fill rows that needed late contract recovery or owner-closeout
branching now point to three non-baseline branches of record:
`codex/be-cc-001-fu-seed` for `TEN-UI-RD-013`,
`origin/codex/ten-ui-rd-010` for `TEN-UI-RD-010`, and
`origin/codex/ten-ui-rd-014` for `TEN-UI-RD-014`. Reviewers can reproduce the
redesign delta for any single surface with:

```bash
git diff <before>..<after> -- <artifact-paths>
```

## Per-surface notes

### TEN-UI-RD-001 — Shell adoption + globals.css strip

- Artifacts: `apps/tenant-console-web/app/layout.tsx`,
  `apps/tenant-console-web/components/*` shell composition,
  `apps/tenant-console-web/app/globals.css`,
  `packages/ui-web/src/tenant-shell.stories.tsx`.
- Reviewer Codex approval at 2026-05-10T16:30:56Z confirmed that
  `515f271` adds the `TN_Home` Storybook target via
  `packages/ui-web/src/tenant-shell.stories.tsx` and removes the dead
  `.page-hero` / `.surface-card` / `.subsurface-card` / `.callout-panel`
  rules from `apps/tenant-console-web/app/globals.css`; a dead-selector
  grep produced no matches. Reviewer rerun: `pnpm --filter @drts/ui-web
typecheck` / `test` / `lint` and `pnpm --filter @drts/ui-web exec
storybook build`, plus `pnpm --filter @drts/tenant-console-web typecheck`
  / `test` / `lint` / `build` — all PASS.

### TEN-UI-RD-002 — Home + Bookings list + Booking Detail

- Artifacts: `apps/tenant-console-web/app/page.tsx` (`TN_Home`),
  `apps/tenant-console-web/app/bookings/page.tsx` (`TN_Bookings`),
  `apps/tenant-console-web/app/bookings/[bookingId]/page.tsx`
  (`TN_BookingDetail`), plus parity stories
  `packages/ui-web/src/tenant-home.stories.tsx`,
  `packages/ui-web/src/tenant-bookings.stories.tsx`, and
  `packages/ui-web/src/tenant-booking-detail.stories.tsx`.
- Reviewer Codex2 approval at 2026-05-11T01:36:04Z. Reviewer rerun:
  `pnpm --filter @drts/tenant-console-web typecheck` / `build` / `test`
  (no test files, exits 0); `pnpm --filter @drts/ui-web typecheck` and
  `build-storybook`. All PASS per `next` field.

### TEN-UI-RD-003 — Audit + Users + Settings

- Artifacts: `apps/tenant-console-web/app/audit/page.tsx` (`TN_Audit`),
  `apps/tenant-console-web/app/users/page.tsx` (`TN_Users`),
  `apps/tenant-console-web/app/settings/page.tsx` (`TN_Settings`),
  plus parity stories `packages/ui-web/src/tenant-audit.stories.tsx`,
  `packages/ui-web/src/tenant-users.stories.tsx`, and
  `packages/ui-web/src/tenant-settings.stories.tsx`.
- Reviewer Codex approval at 2026-05-11T01:11:08Z. Reviewer rerun:
  `pnpm --filter @drts/tenant-console-web typecheck` / `test` / `build`
  PASS; `pnpm --filter @drts/ui-web build-storybook` PASS. Surface stays
  read-only and aligned with the published tenant audit / user / setting
  contracts (no new mutation surface invented).

### TEN-UI-RD-004 — Tenant shell internal-language copy strip

- Artifact: `apps/tenant-console-web/components/tenant-shell.tsx` plus the
  matching strings exposed in `packages/ui-web/src/tenant-shell.stories.tsx`
  (`brandSub`, footer text, and the search note).
- This row has no new canvas artboard — it is a copy-replacement pass that
  removes implementation language (`TEN-UI-001`, `XS-UI-004`,
  `Authority: /api/tenant/*`, `Phase 1`, `tenant-commute-hub`, `Route
topology`) from the user-facing shell chrome. Verification anchors on the
  shell rows of every artboard under `Tenant Console.html#home`-style anchors
  via the shared chrome.
- Reviewer Claude2 approval at 2026-05-11T01:18:29Z. Reviewer rerun:
  `pnpm --filter @drts/tenant-console-web typecheck` / `build` / `test`
  PASS (`test` runs `--passWithNoTests`); Storybook `tenant-shell.stories.tsx`
  `brandSub` matches the live shell text.

### TEN-UI-RD-010 — TN_NewBooking parity-fill (delegated reopen)

- Artifacts: `apps/tenant-console-web/app/bookings/new/page.tsx`,
  `apps/tenant-console-web/app/bookings/new/tenant-booking-create-form.tsx`,
  `apps/tenant-console-web/app/api/bookings/policy-preview/route.ts`,
  `apps/tenant-console-web/app/api/bookings/create/route.ts`, plus parity
  story `packages/ui-web/src/tenant-new-booking.stories.tsx`. The route
  composes the now-published booking, cost-center, quota-impact, and
  approval-evaluation contracts (`CreateTenantBookingCommand`,
  `TenantCostCenterRecord`, `TenantBookingQuotaImpactPreview`,
  `TenantApprovalEvaluationResult`) per
  `tenant-console-parity-decisions-20260510.md` § `TEN-UI-RD-010`.
- Reviewer Codex approval at 2026-05-18T15:18:15Z on the reviewed
  implementation branch `origin/codex2/ten-ui-rd-010` (`0232a1b`) reran
  `pnpm --filter @drts/tenant-console-web typecheck` / `test` / `build` plus
  `pnpm --filter @drts/ui-web build-storybook` — all PASS. The canonical
  `done` row then records merge closeout commit `12616aa` on
  `origin/codex/ten-ui-rd-010`, which preserves the reviewer-approved
  TN_NewBooking payload on top of current `origin/dev`. The scope guardrail
  (no tenant-side `quotedFare` submission, no invented draft-save or
  tenant-side approval override) remains enforced in the form-state logic and
  the BFF route handlers.

### TEN-UI-RD-011 — TN_Passengers parity-fill

- Artifacts: `apps/tenant-console-web/app/passengers/page.tsx`,
  `apps/tenant-console-web/lib/navigation.ts` (`Directory` group entry), and
  parity story `packages/ui-web/src/tenant-passengers.stories.tsx`. Route
  stays read-only against `TenantPassengerRecord` /
  `GET /api/tenant/passengers`; sunset consent-version / CSV-import / visitor
  semantics are intentionally not implemented per parity decision.
- Reviewer Codex2 approval at 2026-05-10T20:19:03Z. Reviewer rerun:
  `pnpm --filter @drts/tenant-console-web typecheck` / `test` / `build` PASS;
  `pnpm --filter @drts/ui-web build-storybook` PASS.

### TEN-UI-RD-012 — TN_Addresses parity-fill

- Artifacts: `apps/tenant-console-web/app/addresses/page.tsx`,
  `apps/tenant-console-web/lib/navigation.ts` (`Directory` group entry with
  `/addresses`), and parity story
  `packages/ui-web/src/tenant-addresses.stories.tsx`. Route stays read-only
  against `TenantAddressRecord` / `GET /api/tenant/addresses` plus the
  export-view list; inline mutation, geocode rewriting, and sensitive-flag
  toggles remain behind `UpsertTenantAddressCommand` and are not exposed.
- Reviewer Codex2 approval at 2026-05-10T19:14:46Z. Reviewer rerun:
  `pnpm --filter @drts/tenant-console-web typecheck` / `test` / `build` /
  `lint` PASS; `pnpm --filter @drts/ui-web typecheck` / `test` / `lint` and
  `build-storybook` PASS.

### TEN-UI-RD-013 — TN_CostCenter parity-fill (delegated reopen, read-only)

- Artifacts: `apps/tenant-console-web/app/cost-centers/page.tsx`,
  `apps/tenant-console-web/lib/navigation.ts` (`Directory` group entry), and
  parity story `packages/ui-web/src/tenant-cost-centers.stories.tsx`. Route
  composes `BE-CC-001`'s four newly-published read contracts (`listCostCenters`,
  `getTenantCostCenterQuota`, coverage helper, `listApprovalRules`) using
  `Promise.allSettled` + `CalloutPanel` to surface partial errors without
  inventing an unpublished editor surface. Navigation adds the `Directory →
Cost centers` entry; `tenant-rules.stories.tsx`-style warning chip status is
  used for over-quota rows.
- Reviewer Claude2 approval at 2026-05-14T03:16:30Z. Reviewer rerun:
  `pnpm --filter @drts/tenant-console-web typecheck` / `test` / `build` PASS;
  `pnpm --filter @drts/ui-web typecheck` / `test` PASS. Storybook parity
  story matches the seven-column `TN_CostCenter` artboard
  (`Code` / `Name` / `Owner` / `Quota` / `Used` / `Approval` etc.). The
  parity-decisions companion now records this row as `shipped`; the
  previously documented blocker has been resolved by `BE-CC-001`. A
  2026-05-18 control-plane repair reasserted this original shipped tuple in
  machine truth without replacing the parent route commit.

### TEN-UI-RD-014 — TN_Rules parity-fill (delegated reopen)

- Artifacts: `apps/tenant-console-web/app/rules/page.tsx`,
  `apps/tenant-console-web/app/rules/rules-manager.tsx`,
  `apps/tenant-console-web/app/rules/actions.ts`,
  `apps/tenant-console-web/app/rules/constants.ts`, and parity story
  `packages/ui-web/src/tenant-rules.stories.tsx`. Route composes the
  now-published rule, quota, approval-evaluation, and approval-rule listing
  contracts (`BE-RULE-001`, `BE-QUOTA-001`, `BE-APR-001`) per
  `tenant-console-parity-decisions-20260510.md` § `TEN-UI-RD-014`.
- Reviewer Codex2 approval at 2026-05-18T15:30:26Z re-ran
  `pnpm --filter @drts/tenant-console-web typecheck` / `build` / `test`
  successfully on the reviewed Rules route. The canonical `done` row now
  records owner closeout commit `41bdce1` on `origin/codex/ten-ui-rd-014`;
  the reviewed implementation payload remains `412116b` on the same branch,
  and owner closeout verification additionally recorded
  `pnpm --filter @drts/ui-web typecheck` and
  `pnpm --filter @drts/ui-web build-storybook` as PASS. The parity-decisions
  companion now records this row as `shipped`; the previously documented
  blocker has been resolved by the late-Wave-3 rule + quota + approval
  contract trio.
- Branch note: both `41bdce1` (closeout evidence) and `412116b`
  (reviewed implementation payload) are reachable from
  `origin/codex/ten-ui-rd-014`. Reviewer can
  `git fetch origin codex/ten-ui-rd-014 && git diff <before>..412116b -- apps/tenant-console-web/app/rules`
  to reproduce the redesign delta.

### TEN-UI-RD-015 — TN_Invoices parity-fill

- Artifacts: `apps/tenant-console-web/app/invoices/page.tsx`,
  `apps/tenant-console-web/lib/navigation.ts` (`Billing` group entry with
  `/invoices`), `apps/tenant-console-web/lib/source-domain.ts` (invoice
  source-authority helpers), and parity story
  `packages/ui-web/src/tenant-invoices.stories.tsx`. Route stays read-only
  against `TenantBillingProfile` + `TenantInvoiceRecord` (no inferred `due`
  or `expiresAt` fields, no inline reconciliation workflow).
- Reviewer Codex2 approval at 2026-05-10T19:23:35Z. Reviewer rerun:
  `pnpm --filter @drts/tenant-console-web typecheck` / `build` / `test` PASS;
  `pnpm --filter @drts/ui-web typecheck` PASS.

### TEN-UI-RD-016 — TN_Reports parity-fill

- Artifact: `apps/tenant-console-web/app/reports/page.tsx`, plus parity
  story `packages/ui-web/src/tenant-reports.stories.tsx`. Route stays
  read-only against the published tenant report contract; reviewer re-approval
  restored after a closeout drift confirms no source delta beyond pushed
  commit `f8857db`.
- Reviewer Codex approval at 2026-05-10T23:56:22Z. Reviewer rerun: per task
  `next` field, no source delta beyond the pushed commit, review-approved
  contract boundary remains intact.

### TEN-UI-RD-017 — TN_ApiKeys completion

- Artifacts: `apps/tenant-console-web/app/api-keys/page.tsx`,
  `apps/tenant-console-web/app/api-keys/api-key-manager.tsx`,
  `apps/tenant-console-web/app/api-keys/actions.ts`,
  `apps/tenant-console-web/app/api-keys/constants.ts`. Plaintext API keys
  stay scoped to a client island; active/expiring helper excludes expired
  keys; scope/expiry semantics match the governance contract.
- Reviewer Claude2 re-approval at 2026-05-12T14:19:22Z after a
  progress-state regression; owner closeout cleared with verified commit
  `4d8ce97` on `origin/feat/claude2-ui-redesign-foundation` and the correct
  trailers. Reviewer rerun: `pnpm --filter @drts/tenant-console-web
typecheck` / `build` / `test` PASS; **Storybook N/A** (recorded in machine
  truth: `apps/tenant-console-web` has no `.storybook` directory and
  `TN_ApiKeys` has no `packages/ui-web/src/tenant-api-keys.stories.tsx` parity
  file — see Outstanding items below).

### TEN-UI-RD-018 — TN_Webhooks completion

- Artifacts: `apps/tenant-console-web/app/webhooks/page.tsx` (now delegates to
  a client-side `WebhookManager`), WH-3 api-client helpers, and parity story
  `packages/ui-web/src/tenant-webhooks.stories.tsx`.
- Reviewer Codex approval at 2026-05-12T16:56:16Z. Reviewer-approved
  verification recorded in machine truth; refreshed acceptance sidecar
  finalized in same close-out. The webhook delivery-log view stays read-only;
  signature-rotation and retry-policy controls remain inside the published
  webhook governance contract.

## Outstanding items

None blocking Wave 3. Items intentionally deferred or worth flagging for the
reviewer:

- **TN_ApiKeys has no parity story file.** `TEN-UI-RD-017`'s machine-truth
  `review_notes_zh` and `next` fields record `Storybook N/A` because
  `apps/tenant-console-web` has no `.storybook` directory and there is no
  `packages/ui-web/src/tenant-api-keys.stories.tsx`. The `TN_ApiKeys` canvas
  artboard at `Tenant Console.html#apikeys` is the parity reference of record
  for this surface, and the live `/api-keys` route is exercised by the
  reviewer rerun (`typecheck` / `build` / `test`). This is not a regression
  versus Wave 2 ops (`OPS-UI-RD-001` also has no per-surface parity story for
  the shell-only row).
- This closeout records reviewer signatures for each surface; it does not
  rerun acceptance commands, by design — re-running acceptance was completed
  during each upstream task's `review_approved` event and is the basis of the
  reviewer signature on this packet.
- Visual-diff screenshots are not embedded. The design canvas
  (`docs/05-ui/drts-design-canvas/Tenant Console.html`) and the parity
  Storybook stories (`packages/ui-web/src/tenant-*.stories.tsx`) provide the
  living comparison surface and are reproducible from the listed commits.
- `TEN-UI-RD-013` remains the only parity-fill row whose 2026-05-18 repair
  intentionally restored an earlier 2026-05-14 shipped tuple rather than
  creating a new parent route commit. `TEN-UI-RD-014` later finalized on
  `origin/codex/ten-ui-rd-014`; both rows now have a coherent closeout story
  and no Wave 3 blocker remains.

## Parity-fill decision crosswalk

| Task          | Parity-decisions § | 2026-05-10 status | 2026-05-18 canonical status |
| ------------- | ------------------ | ----------------- | --------------------------- |
| TEN-UI-RD-010 | `TN_NewBooking`    | blocked           | shipped (`12616aa`)         |
| TEN-UI-RD-011 | `TN_Passengers`    | shipped           | shipped (`1ceb922`)             |
| TEN-UI-RD-012 | `TN_Addresses`     | shipped           | shipped (`4f3956b`)             |
| TEN-UI-RD-013 | `TN_CostCenter`    | blocked           | shipped (`921c456`)             |
| TEN-UI-RD-014 | `TN_Rules`         | blocked           | shipped (`41bdce1`)         |
| TEN-UI-RD-015 | `TN_Invoices`      | shipped           | shipped (`3daab74`)             |

The companion file
`docs/05-ui/tenant-console-parity-decisions-20260510.md` has been updated
with 2026-05-14 and 2026-05-18 head notes that record the three reopen
decisions (`TEN-UI-RD-010` / `TEN-UI-RD-013` / `TEN-UI-RD-014`), the contract
publications that unblocked them (`BE-CC-001`, `BE-RULE-001`,
`BE-QUOTA-001`, `BE-APR-001`), and the later owner-closeout / machine-truth
repair tuples that now govern this refreshed packet.

## Reviewer signoff for TEN-UI-RD-099

The reviewer (Codex2) is asked to confirm only that the matrix above is
internally consistent with `ai-status.json` and `ai-activity-log.jsonl` —
i.e. each `(reviewer, approved-at, commit_hash, push_branch)` tuple in the
matrix matches the machine truth on the cited branches, the cited canvas
anchors exist in `docs/05-ui/drts-design-canvas/Tenant Console.html`, and
the cited parity story files exist on their branch of record under
`packages/ui-web/src/` (with the one explicit `Storybook N/A` exception for
`TN_ApiKeys`).
