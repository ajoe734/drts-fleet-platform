# I18N-ADM-11 — Unblock Planning Decision

**Task ID:** `I18N-ADM-11-UNBLOCK-PLANNING-DECISION`
**Parent task:** `I18N-ADM-11`
**Owner:** `Codex`
**Reviewer:** `Codex2`
**Decision date:** 2026-06-04
**Decision type:** Routing decision (no new product/contract change)

---

## 1. Decision

`I18N-ADM-11` is **not** blocked on a missing product or contract decision.
The canonical Platform Admin planning artifacts already decide the
`/adapter-registry` authority split, credential handling, and operational
action vocabulary that the i18n-centralization task must preserve while moving
inline copy into `t()`.

This unblock task therefore resolves to:

- **No new L1/L2 product decision**
- **No contract/schema change**
- **No scope cut**
- **Explicit resume guidance for the parent task**

The parent task should treat the remaining failures as implementation-surface
issues outside this planning helper: shared workspace/module-resolution
breakage during `typecheck` and `build`, not unresolved product semantics.

## 2. Canonical Evidence

| Source | Finding |
| --- | --- |
| `docs/05-ui/system-design-answers-all-apps-20260524.md` `Q-ADM17` | `/adapter-registry` write authority is already settled: Platform Admin owns create/config/credential/enable-disable; Ops owns pause-resume operational traffic and retry failed callback; secrets are never shown after creation. |
| `docs/05-ui/platform-admin-design-handoff-packet-20260525.md` §5.18 | The page brief already fixes the exact adapter-registry data model and action vocabulary, including credential status, operational pause, and split `availableActions[]` behavior. |
| `apps/platform-admin-web/app/adapter-registry/page.tsx` | The current rebuilt route already reflects the `Q-ADM17` split in UI copy and action grouping; the i18n task is centralizing that copy rather than inventing new semantics. |
| `apps/platform-admin-web/app/adapter-registry/layout.tsx` and `components/EditAdapterModal.tsx` | The parent summary correctly identifies these as untranslated surfaces, but those files do not introduce a new business decision. They need localization wiring only. |
| `ai-status` task `I18N-ADM-11` | The parent was blocked on `waiting_for=Codex` even though its last recorded implementation note already attributes the remaining acceptance failure to shared `@drts/contracts` / `@drts/ui-tokens` workspace resolution problems. |

## 3. Why This Is Not A Planning-Semantics Blocker

The open issue is not "what does adapter / credential / pause / retry mean?".
Those meanings are already fixed by the canonical admin planning stack.

What remains for `I18N-ADM-11` is strictly execution:

- centralize the remaining modal/layout strings through `t()`
- preserve the already-decided authority split from `Q-ADM17`
- keep glossary wording aligned with the parent brief:
  `adapter -> 轉接器`, `credential -> 憑證`
- rerun validation once the shared workspace import-resolution failures no
  longer poison `typecheck` and `build`

Treating this as a missing product/contract decision would duplicate planning
work that the canonical artifacts already completed.

## 4. Parent Task Next Step

The concrete next step for `I18N-ADM-11` is:

> Resume `I18N-ADM-11` using the existing `/adapter-registry` contract from
> `Q-ADM17` and handoff packet §5.18. Keep `EditAdapterModal` and
> `layout.tsx` in scope for translation centralization only; do not relitigate
> authority semantics. After the shared `@drts/contracts` /
> `@drts/ui-tokens` workspace resolution failures are cleared, rerun
> `pnpm --filter @drts/platform-admin-web typecheck` and
> `pnpm --filter @drts/platform-admin-web build` to close acceptance.

This means the parent is no longer blocked on missing product/contract truth.
Its remaining work is owner execution plus shared validation-surface recovery.

## 5. Acceptance Mapping

| Acceptance item | Result |
| --- | --- |
| Resolve or route the missing product/contract decision through canonical planning artifacts | Resolved as routing-only: canonical planning already defines `/adapter-registry` semantics via `Q-ADM17` and packet §5.18. |
| Record the decision | Recorded here: no new product/contract decision is needed; resume against existing adapter-registry authority and vocabulary. |
| scope cut | Not needed. `EditAdapterModal` and `layout.tsx` remain in scope for localization wiring. |
| or explicit follow-up needed by the parent task | Recorded in §4 as resume-on-existing-contract plus rerun validation after shared workspace blockers clear. |
| Produce task-scoped commit/push/PR evidence for any canonical change | To be filled with branch, commit, push, and PR evidence on this task branch. |
| Update the parent task with the concrete unblocked next step | The parent should point at the resume guidance in §4 instead of waiting on a new planning decision. |

## 6. Review And Verification Evidence

- `AI_COLLABORATION_GUIDE.md` reviewed for machine-truth and unblock-closeout
  rules.
- Canonical planning sources inspected:
  - `docs/05-ui/system-design-answers-all-apps-20260524.md` `Q-ADM17`
  - `docs/05-ui/platform-admin-design-handoff-packet-20260525.md` §5.18
- Implementation surfaces inspected:
  - `apps/platform-admin-web/app/adapter-registry/page.tsx`
  - `apps/platform-admin-web/app/adapter-registry/layout.tsx`
  - `apps/platform-admin-web/app/adapter-registry/components/EditAdapterModal.tsx`
- Machine-truth task slices inspected:
  - `I18N-ADM-11`
  - `I18N-ADM-11-UNBLOCK-PLANNING-DECISION`
