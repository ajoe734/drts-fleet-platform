# I18N-ADM-11 Unblock Planning Decision

## Scope

- Task: `I18N-ADM-11-UNBLOCK-PLANNING-DECISION`
- Parent: `I18N-ADM-11`
- Owner: `Codex2`
- Reviewer: `Codex`
- Decision date: `2026-06-04`

## Diagnosis

`I18N-ADM-11` was routed into a planning-decision helper because the
adapter-registry i18n sweep appeared blocked on a missing product / contract
answer: whether the Platform Admin body should render bilingual `zh · en`
labels in zh locale, or split primary labels by locale.

The ambiguity came from a drift between two existing planning artifacts:

- `docs/05-ui/platform-admin-body-parity-audit-20260602.md` §10 still listed
  the bilingual-label behavior as an open decision.
- Higher-precedence Platform Admin i18n guidance had already resolved the
  intended production behavior:
  - `docs/05-ui/system-design-answers-all-apps-20260524.md` `Q-X17`
  - `docs/05-ui/platform-admin-design-handoff-packet-20260525.md` §3.1

This blocker was therefore not a missing product decision. It was an
unrecorded planning reconciliation: the audit backlog had not yet been updated
to reflect the accepted i18n rule.

## Decision

No new product choice is required. The canonical resolution is:

1. Platform Admin primary UI labels are split by locale, not duplicated as
   `zh · en` in zh locale.
2. `zh` locale renders zh-TW primary labels.
3. `en` locale renders en primary labels.
4. Raw backend/domain codes remain API values only and must be translated
   before becoming primary user-facing copy.
5. Raw codes may still appear as secondary detail in developer tooltip,
   detail drawer, or equivalent inspection surfaces when useful for debugging
   or reconciliation, consistent with `Q-X17`.
6. Canvas/mock `BiLabel` usage is a design reference, not a requirement to
   duplicate every production body label bilingually.

This decision is now recorded directly in
`docs/05-ui/platform-admin-body-parity-audit-20260602.md` §10 so the backlog
matches the accepted i18n contract.

## Scope Cut And Routing

- `I18N-ADM-11` remains an implementation/i18n-centralization task for
  `apps/platform-admin-web/app/adapter-registry/`.
- This unblock does not require a new locale model, a new contract enum, or a
  bilingual-body component family for Platform Admin.
- This unblock does not expand the parent into broader Platform Admin copy
  cleanup outside the adapter-registry page, modal, and layout surfaces.
- Any remaining failures on the parent after this packet are implementation or
  workspace-validation blockers, not product/contract blockers.

## Parent Unblocked Next Step

`I18N-ADM-11.next` should route to:

Resume adapter-registry i18n centralization using locale-split primary labels
and translation-map rendering. Keep `adapter -> 轉接器`, `credential -> 憑證`,
and related operational vocabulary in translation keys rather than raw inline
copy. Do not wait for a separate bilingual-label product decision. Any
remaining closeout risk stays with the shared typecheck/build blockers already
recorded on the parent task.

## Verification Basis

- `docs/05-ui/system-design-answers-all-apps-20260524.md` `Q-X17`
- `docs/05-ui/platform-admin-design-handoff-packet-20260525.md` §3.1
- `docs/05-ui/platform-admin-body-parity-audit-20260602.md` §10
- `apps/platform-admin-web/lib/i18n.tsx`
- `apps/platform-admin-web/lib/translations.ts`
- `apps/platform-admin-web/app/adapter-registry/page.tsx`
