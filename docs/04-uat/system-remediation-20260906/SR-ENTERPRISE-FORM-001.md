# SR-ENTERPRISE-FORM-001 — 2026-09-08 owner recovery evidence

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
