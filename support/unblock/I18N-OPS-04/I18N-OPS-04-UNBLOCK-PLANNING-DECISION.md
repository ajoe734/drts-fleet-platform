# I18N-OPS-04 Unblock Planning Decision

## Scope

- Task: `I18N-OPS-04-UNBLOCK-PLANNING-DECISION`
- Parent: `I18N-OPS-04`
- Owner: `Codex2`
- Reviewer: `Codex`
- Decision date: `2026-06-04`

## Diagnosis

`I18N-OPS-04` was routed into a planning-decision helper because the task brief
referenced `docs/05-ui/i18n-remediation-implementation-20260604.md`, but that
canonical planning artifact did not exist yet.

Without that file, the parent task had no recorded authority for two questions
that directly affect the driver list/detail/platform-actions i18n cleanup:

1. Should touched Ops Console body copy become simultaneous `zh · en`
   bilingual labels, or stay single-locale and zh-primary in `zh` mode?
2. Which glossary terms are binding for `re-auth`, `suppression`, and
   `binding` in the driver ops surfaces?

The blocker was therefore a missing planning artifact for a task-local copy
policy, not a missing backend contract or unresolved product semantics.

## Decision

No scope cut is needed.

The canonical resolution is:

1. Materialize `docs/05-ui/i18n-remediation-implementation-20260604.md` as the
   planning authority for this i18n wave.
2. Treat `I18N-OPS-04` as a **zh-primary localization centralization** task for
   the touched driver ops surfaces.
3. Keep runtime copy single-language per locale; do not block the task on
   simultaneous bilingual body rendering.
4. Use the following binding glossary in the parent scope:
   - `re-auth` → `re-auth`
   - `suppression` → `派遣抑制`
   - `binding` → `綁定`
   - `bound` → `已綁定`
   - `unbound` → `未綁定`
5. Treat `CanvasBiLabel` as explicit follow-up for the broader body-parity
   program, not as a prerequisite for this task.

## Scope Cut And Routing

- `I18N-OPS-04` stays in scope as the driver list/detail/platform-actions i18n
  centralization slice.
- This helper does not introduce a product/API contract change.
- This helper does not require reopening the broader Ops Console body-parity
  design packet.
- No `PHASE1_OPEN_QUESTIONS.md` entry is needed because the copy policy is now
  recorded in a canonical planning artifact.

## Parent Unblocked Next Step

Update the parent task to proceed as follows:

Resume `I18N-OPS-04` by centralizing the remaining inline copy in
`app/drivers/page.tsx`, `app/drivers/[driverId]/page.tsx`, and
`components/driver-platform-actions.tsx` into shared translations/localized
helpers under the zh-primary policy recorded in
`docs/05-ui/i18n-remediation-implementation-20260604.md`. Do not wait for
`CanvasBiLabel` or a broader bilingual-body redesign.

## Verification Basis

- `docs/05-ui/i18n-remediation-implementation-20260604.md`
- `docs/05-ui/system-design-answers-all-apps-20260524.md`
- `docs/05-ui/ops-console-design-handoff-packet-20260525.md`
- `docs/05-ui/ops-console-body-parity-audit-20260602.md`
- `docs/05-ui/drts-design-canvas/mgmt-tokens.jsx`
- `docs/05-ui/drts-design-canvas/ops-screens-1.jsx`
