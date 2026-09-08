# SR-ENTERPRISE-FORM-001 — 2026-09-08 owner recovery evidence

## Resumed dispatch at 22:42 UTC — fresh verification, still blocked

- Fetched base `origin/dev`: `eb684f176b1d3b46553a0f6f0556c79452fbac3c`; tested implementation HEAD and remote task head: `71b8325a181deb30cb97bb36e754c23d3f3a2337`. Candidate SHA: none; the new documentation anchor is not a delivery candidate.
- `git fetch origin`: exit 0. `git rebase origin/dev`: exit 1 at historical `93d7f83a7`, with six conflicts in task-owned files. The branch already contains original and rebased patch series joined by `c0e02eb0f`; replaying them again produces duplicate-application conflicts. `git rebase --abort`: exit 0, restoring the clean original branch and published history. No conflict resolution or product changes were retained.
- Read merged helper `support/unblock/SR-ENTERPRISE-FORM-001/SR-ENTERPRISE-FORM-001-UNBLOCK-HISTORY-REPAIR.md`; ancestry check for `7d1272fc85a7f4d2a20f4ccd2d01716e873cca5e` against fetched dev exits 0. That audit covers `codex2/sr-enterprise-form-001` at `b97be8a00`, not this dispatch's `codex/sr-enterprise-form-001`. Its continuation step 4 requires supervisor routing of an unpublished replacement branch when dev advances. No replacement branch is assigned here. The helper is history evidence, not proof that this branch's policy/identity issues are resolved.
- Source recheck: frontend still defines `MIN_LEAD_TIME_MINUTES = 15` and seeds `bookedBy` with 林宜君. Owned-mobility's configurable minimum is specific backend evidence, not proof of an authoritative enterprise policy endpoint. `ai-status.sh show SR-BOOKING-VERIFY`: exit 1, Task not found. `show SR-ENTERPRISE-DATA-001`: exit 0, now in_progress, not completed; its listed scope still does not deliver authenticated form identity. Supervisor must identify the enterprise policy/identity producers and register the corresponding dependency/scope decisions.
- `pnpm --filter @drts/enterprise-dispatch-web typecheck`: exit 0.
- `pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-form-001/`: exit 1, zero tests. Vite resolves ui-tokens into retired `codex-sr-qa-webhook-001/packages/ui-tokens/src/index.ts` and cannot load its tsconfig.
- `pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-form-001/ --config tests/unit/system-remediation/sr-enterprise-form-001/vitest.config.ts`: exit 0, one file / 30 tests passed. Existing task-local configuration only; no dependency installation or shared configuration mutation.
- `git diff --check`: exit 0 before this evidence update; rerun before commit.
- No product/dev/browser server or Docker infrastructure started (dispatch VM restriction). No 390px browser or physical-device keyboard/CTA acceptance; no live API booking and no bookingId/orderId/resource IDs. No new review, candidate CI, merge, or deployment evidence. Only this scoped evidence document changed; normal push and machine blocker record identify the resulting anchor.

The sections below are historical dispatch records; their base and status observations are superseded by this section.

Owner: Codex. Reviewer: Codex2. Status: implementation incomplete; no candidate handoff.

## Git evidence

- Current dispatch base origin/dev: `a24045986ac29231d34657df3a343b02d9fbb770`.
- Inherited published task head: `7ff140019bd9e847afc71f0b2859adfbeb18139a`.
- Rebased existing implementation onto current dev, then preserved the already-published ancestry with an ours merge (`c0e02eb0f`) to permit a normal non-force push. This retains the rebased tree.
- Strict calendar fix anchor: `297c16207`; normal push succeeded.
- Candidate SHA: not assigned; this is progress evidence, not review/CI/merge acceptance. Final evidence commit is identified by the canonical task progress/blocker record.
- Branch: `codex/sr-enterprise-form-001` in the supervisor-assigned isolated worktree.

## Traceability and current findings

Read execution task and task spec; findings R20/R21/R22 and capabilities C015/C016/C019/C120. Historical audit is not current truth. Current dev lacks validateReservationWindow; the inherited task branch supplies entry handling, placard serialization, review-time validation, and responsive classes. Preserve those changes rather than reimplement them.

Read canvas `Enterprise Dispatch.html`, `ent-screens-1.jsx` and `packages/ui-tokens/src/realms.ts`. No new visual design or palette introduced in this dispatch.

Additional reproducible defect: JavaScript accepts `2027-02-29T10:00:00+08:00` and converts it to `2027-03-01T02:00:00.000Z`. The inherited validator accepted this normalization. Strict date/time shape and Taipei round-trip validation now reject impossible dates and 24:00, including direct review parameters and command construction. Regression cases cover non-leap February, impossible leap February, April 31, 24:00 and a valid leap day.

## Actual commands

- `git fetch origin`: exit 0.
- `git rebase origin/dev`: exit 0.
- `node -e 'const d = new Date("2027-02-29T10:00:00+08:00"); console.log(d.toISOString())'`: exit 0; output `2027-03-01T02:00:00.000Z`.
- `pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-form-001/`: exit 1, zero tests executed. Shared node_modules resolves ui-tokens into retired `codex-sr-qa-webhook-001` worktree, whose tsconfig is absent.
- `pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-form-001/ --config tests/unit/system-remediation/sr-enterprise-form-001/vitest.config.ts`: exit 0; 1 file, 30 tests passed. Task-local config extends root config and aliases real local ui-tokens source; no mocked values or shared config changes.
- `pnpm --filter @drts/enterprise-dispatch-web typecheck`: exit 0, rerun after calendar fix.
- `git diff --check`: exit 0.
- `git push origin codex/sr-enterprise-form-001`: exit 0 for implementation anchors; no force push.

## Remaining acceptance and scope coordination

1. The inherited frontend constant `MIN_LEAD_TIME_MINUTES = 15` is not an imported authoritative configuration, contrary to the previous evidence. Backend owned-mobility `getMinLeadTimeMinutes()` uses SCHEDULED_BOOKING_MIN_LEAD_TIME_MINUTES / MULTI_TAXI_MIN_LEAD_TIME_MINUTES with a default of 15. Service contracts require minimum lead checks, but the tenant form has no verified API-fed value. Supervisor must coordinate SR-BOOKING-VERIFY / API contract ownership and authorize dependencies/scope before this task can claim policy parity.
2. The inherited getSeedEnterpriseDraft still seeds bookedBy with 林宜君; this is not proof of authenticated identity. Existing estimated fare/budget helpers are display fixtures, not verified server approval/quota. Coordinate SR-ENTERPRISE-DATA-001; do not treat these as real booking evidence.
3. No browser 390px run or physical-device keyboard/zoom/error/CTA check was performed in this dispatch. The existing static responsive classes and long-string unit tests do not prove mobile acceptance.
4. No live booking was created; bookingId/orderId/resource IDs: none. No API delivery, CI, PR merge or deployment claim. Historical evidence claiming complete repair is superseded by this report.

Only declared write scopes were changed. Shared dependencies and API contracts were not modified.

## Follow-up dispatch: routing blocker confirmed

- `git fetch origin`: exit 0; origin/dev remains `a24045986ac29231d34657df3a343b02d9fbb770`. Local HEAD and origin/codex/sr-enterprise-form-001 both resolve to `8ad8136935067f5edbb3568f4004cd6ed1841d58` before this evidence-only update. No rebase needed; worktree was clean.
- Current source still uses frontend `MIN_LEAD_TIME_MINUTES = 15` and seeded bookedBy, while backend `getMinLeadTimeMinutes()` reads environment configuration. The policy/identity gaps above remain reproducible by source inspection.
- Canonical `ai-status.sh show SR-BOOKING-VERIFY` and `show SR-BOOKING-VERIFY-001` both exit 1: Task not found. The execution table contains SR-QA-BOOKING-001, a downstream verification task depending on this task, so it cannot be substituted as the missing implementation dependency.
- `ai-status.sh show SR-ENTERPRISE-DATA-001`: exit 0; status blocked, waiting_for Codex2, with no identity-source scope expansion. Its current scope does not supply an authenticated booking identity integration.
- Supervisor adjudication needed: register/identify the minimum-lead policy API producer referenced by the brief, assign the authenticated identity integration producer, and add the necessary scopes/dependencies. Route through known reviewer Codex2; do not use the unregistered task name as a waiting-for agent.
- `git diff --check`: exit 0. No implementation changes in this follow-up; earlier test results above are retained, not represented as rerun. No new browser, physical-device, live booking, resource ID, CI or merge evidence; no candidate handoff.
