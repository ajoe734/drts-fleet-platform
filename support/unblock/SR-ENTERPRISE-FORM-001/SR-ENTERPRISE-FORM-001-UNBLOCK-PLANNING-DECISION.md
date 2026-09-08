# SR-ENTERPRISE-FORM-001 — planning decision routing

Date: 2026-09-08. Helper owner: Codex2. Reviewer: Codex.
Disposition: explicit follow-up routed; parent remains blocked.
Canonical question: `Q-SR-ENTERPRISE-FORM-001` in `PHASE1_OPEN_QUESTIONS.md`.

## Evidence

Fresh fetched base: `f372e4a6a0dd16204ccbd660f23013601357c224` (`origin/dev`).
Parent published head inspected: `093734506e591e6aac7f75a72163a31a3ed4db8f`;
this is historical implementation evidence, not this helper's candidate.

- `AI_COLLABORATION_GUIDE.md` §2 routes unresolved product choices to the open
  questions board. L1 truth takes precedence over UI skeletons and placeholders.
- `phase1_prd_detailed_v1.md` §9.1.2 distinguishes booker, actual passenger and
  onsite contact. `phase1_service_contracts_v1.md` §4.1 requires minimum lead-time
  prechecks; it does not authorize a new frontend constant. L2 decision tables
  §1 classify enterprise portal bookings as owned/business_dispatch/reservation.
- Parent runbook Execution prompt and the execution task packet's shared-file
  rules require supervisor scope expansion and necessary dependencies first.
  Current parent machine slice excludes `lib/enterprise-theme.ts` and
  `lib/translations.ts` from `write_scopes`.
- Current `apps/enterprise-dispatch-web/lib/enterprise-theme.ts` defaults to
  `#2457D6` and explicitly describes a port of the enterprise canvas.
  `docs/05-ui/drts-design-canvas/ent-kit.jsx` `buildEnt` uses that same accent.
  `packages/ui-tokens/src/realms.ts` instead defines tenant foreground light
  `#0F766E` / dark `#5EEAD4`. The parent's evidence requests tenant tokens.
  This difference needs an explicit applicability decision; the canvas is not
  evidence of a new authorization to retain or replace shared branding.
- `tools/ci/check_ui_realm_tokens.py` documents a globals.css raw-hex scan;
  passing such a scan would not prove a TypeScript theme is conformant.
- Comparing parent head with the current base shows three additional keys in
  both English and Chinese in `lib/translations.ts`:
  `review.blocked.incompleteFields`, `review.blocked.pastReservation`,
  `booking.earliestBookable`. These are the concrete historical scope exception
  to review; this helper neither edits nor silently reverts them.
- Parent evidence at the published head reports 18 passing tests, typecheck,
  eslint and 390px headless width checks. These were not rerun by this helper.
  True-device keyboard, API-error/CTA, live backend, CI and integration evidence
  remain outstanding. The evidence file is not present in this helper's base;
  it was read using `git show <parent-head>:docs/04-uat/system-remediation-20260906/SR-ENTERPRISE-FORM-001.md`.

## Recorded routing decision and responsible follow-up

Preserve all parent acceptance; no scope cut is approved. The immediate blocker
is shared UI scope/design applicability, not a newly discovered booking contract.

1. **Supervisor/Chairman, with reviewer Codex:** confirm the governing design
   source for enterprise branding. Record whether tenant tokens govern the
   shared theme or an explicitly approved enterprise-brand exception applies.
   If existing accepted design instructions do not settle this, route that
   single visual-policy question to the human design owner; do not invent a
   palette or use local CSS overrides to evade the decision.
2. **Supervisor/Chairman:** inspect concurrent enterprise theme/translations
   writers and authorize `apps/enterprise-dispatch-web/lib/enterprise-theme.ts`
   plus the three translation keys above under the parent, with cycle-free
   dependency sequencing. Alternatively identify/register a shared-theme
   producer with named owner/reviewer and wait for its accepted merge. Update
   machine scope/dependencies through current task-board commands and reconcile
   the runbook/manifest. This helper grants no scope and registers no new task.
   Do not add `SR-DESIGN-001` merely by name: its runbook covers leave, academy
   and Host contracts, not enterprise branding.
3. **Parent owner Codex2:** once redispatched after the above gate, fetch/rebase
   current dev, inspect the published form work against that base, apply only
   the authorized shared-theme/translation change or consume the merged producer,
   and preserve passenger/contact/placard and expiry behavior. Keep minimum
   lead-time policy under the parent's existing backend routing; do not claim
   the textual `SR-BOOKING-VERIFY` reference proves a registered dependency.
4. **Codex2 then Codex:** rerun the parent task's tests and typecheck, validate
   new/review at 390px with focused inputs and API-error/CTA states, and record
   any unavailable true-device/live checks explicitly. Commit, normal push and
   handoff a fresh exact parent candidate; this helper's review does not accept
   the parent implementation.

Resume gate: the recorded design decision plus machine-authorized shared scopes
and ordering, or an accepted/merged producer providing the required shared change.
The open follow-up stays on `SR-ENTERPRISE-FORM-001`; helper review/merge alone
does not unblock it or waive its outstanding validation.

## Helper validation and delivery

- `git fetch origin` and `git rebase origin/dev`: exit 0, already up to date.
- Read-only comparison of current source, parent published diff and both single
  task slices completed. No product code, contract, schema or task scope changed.
- `git diff --check`: required before commit. Only this record and the canonical
  open-question entry are delivered; application tests are not relevant to this
  documentation-only routing change.
- Exact helper candidate SHA, normal push and PR evidence are recorded in the
  task lifecycle/handoff and PR, avoiding a self-referential commit hash here.
