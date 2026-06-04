# I18N-WP0 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `I18N-WP0` - i18n foundation: guard lint + ops default zh + dict gap fill + key-block skeletons  
**Parent Owner:** `Claude2`  
**Parent Reviewer:** `Codex2`  
**Sidecar Owner:** `Codex`  
**Sidecar Reviewer:** `Claude2`  
**Generated:** `2026-06-04` (UTC)  
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` - support-only; does not modify canonical truth, runtime behavior, or the parent implementation.

This packet is the reviewer-facing acceptance companion for `I18N-WP0`. The parent task is still
recorded as `backlog`, so this artifact does not summarize a completed closeout. Instead it fixes
the acceptance contract, dependency posture, and evidence anchors that the parent owner and
reviewer should use when the implementation slice begins and when it later comes back for review.

---

## 1. Scope Boundary

In scope:

- capture the machine-truth anchors for `I18N-WP0-SIDECAR-ACCEPTANCE`
- restate the parent task's recorded acceptance contract without mutating it
- document the direct dependency posture for `I18N-WP0`
- pin concrete evidence anchors for the expected implementation surfaces:
  - `scripts/i18n-guard.mjs`
  - `apps/ops-console-web/lib/i18n.tsx`
  - `apps/ops-console-web/lib/translations.ts`
  - `apps/platform-admin-web/lib/translations.ts`
- give `Claude2` a reviewer checklist for the future parent handoff

Out of scope:

- editing L1/L2 product truth, `ai-status.json`, or the parent task record
- implementing the guard, locale-default change, translation rewrites, or key-block additions
- reassigning machine-truth ownership of `I18N-WP0` or any sibling i18n slice

---

## 2. Machine-Truth Anchors

### Sidecar - `I18N-WP0-SIDECAR-ACCEPTANCE`

- owner=`Codex`
- reviewer=`Claude2`
- status=`in_progress` at packet creation time
- depends_on=`[]`
- task_class=`sidecar`
- helper_parent=`I18N-WP0`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/I18N-WP0/I18N-WP0-SIDECAR-ACCEPTANCE.md`

Live workflow fields such as `status`, `next`, and `last_update` remain authoritative only in
`ai-status.json`.

### Parent - `I18N-WP0`

Machine-truth snapshot observed during this dispatch:

- owner=`Claude2`
- reviewer=`Codex2`
- status=`backlog`
- depends_on=`[]`
- artifacts:
  - `scripts/i18n-guard.mjs`
  - `apps/ops-console-web/lib/i18n.tsx`
  - `apps/ops-console-web/lib/translations.ts`
  - `apps/platform-admin-web/lib/translations.ts`
- acceptance:
  - `i18n-guard runs in CI and pre-commit and emits file:line list`
  - `ops i18n.tsx default is zh`
  - `listed zh==en keys translated`
  - `both translations.ts have per-domain key-block headers`
  - `typecheck + build pass for both apps`

Interpretation:

- The parent task is not blocked by upstream machine-truth dependencies; it is simply not started.
- This packet should therefore be read as a pre-implementation acceptance map, not as closeout
  evidence.
- Any later reviewer conclusion must still come from the parent implementation branch plus live
  machine truth, not from this packet alone.

---

## 3. Dependency Map

### Direct machine-truth dependencies

`I18N-WP0` currently records no direct dependencies.

| Task                            | Status        | Relationship to this packet |
| ------------------------------- | ------------- | --------------------------- |
| `I18N-WP0`                      | `backlog`     | Parent implementation slice this packet prepares for review. |
| `I18N-WP0-SIDECAR-ACCEPTANCE`   | `in_progress` | Support-only acceptance packet; no canonical implementation authority. |

Assertion:

- No prerequisite task must reach `done` before `I18N-WP0` can start according to current machine
  truth.

### Planned downstream fan-out context

The repo already contains the later i18n execution slices as separate backlog tasks:

- `I18N-OPS-01` through `I18N-OPS-14`
- `I18N-ADM-01` through `I18N-ADM-13`
- `I18N-VERIFY`

These are execution-wave context only. This packet does not add dependency edges between them and
`I18N-WP0`.

---

## 4. Expected Delivery Surface

The parent task brief names four canonical implementation surfaces:

- `scripts/i18n-guard.mjs`
- `apps/ops-console-web/lib/i18n.tsx`
- `apps/ops-console-web/lib/translations.ts`
- `apps/platform-admin-web/lib/translations.ts`

Current repo observations relevant to those surfaces:

- `apps/ops-console-web/lib/i18n.tsx` still defaults `LanguageContext` and `LanguageProvider` to
  `en`, so the `ops default zh` acceptance point is currently unmet and reviewable.
- `apps/platform-admin-web/lib/i18n.tsx` already defaults `LanguageContext` and
  `LanguageProvider` to `zh`, giving the parent owner an in-repo reference posture for the ops fix.
- `apps/ops-console-web/lib/translations.ts` still contains multiple English-only carryovers in
  the target vocabulary named by the parent brief, including:
  - `dashboard.platformOps.metrics.syncFailed`
  - `dashboard.platformOps.metrics.acceptPending`
  - `dashboard.platformOps.metrics.manualFallback`
  - `revenue.tab.insight`
  - `revenue.tab.channelMix`
  - `revenue.tab.matrix`
  - `revenue.tab.mismatch`
  - `revenue.channelMix.title`
  - `revenue.mismatch.title`
  - `revenue.mismatch.drawer.title`
- `apps/platform-admin-web/lib/translations.ts` still contains English-only carryovers in the
  target vocabulary named by the parent brief, including:
  - `payments.matrix.title`
  - `payments.col.channelMix`
  - `audit.policies.legalHold`
  - `audit.holds.title`
- neither translations file currently shows the requested `i18n remediation 20260604` per-domain
  key-block headers.
- `apps/ops-console-web/lib/localized-labels.ts` and
  `apps/platform-admin-web/lib/localized-labels.ts` expose `formatOpsCodeLabel` and
  `formatPlatformCodeLabel`, which the parent brief explicitly calls out for caveat tagging rather
  than immediate semantic rewrite.

---

## 5. Acceptance Checklist

Legend: `[REQUIRED]` = direct parent acceptance contract. `[DERIVED]` = support gate for reviewer
handoff quality.

### A. Guard rail delivery `[REQUIRED]`

- [ ] `scripts/i18n-guard.mjs` exists.
- [ ] The guard is wired into CI.
- [ ] The guard is wired into pre-commit.
- [ ] Guard failures emit actionable `file:line` output rather than generic summaries.
- [ ] The guard covers the parent brief's prohibited patterns for app/component source files.

### B. Locale default alignment `[REQUIRED]`

- [ ] `apps/ops-console-web/lib/i18n.tsx` uses `zh` as the `LanguageContext` default locale.
- [ ] `apps/ops-console-web/lib/i18n.tsx` uses `zh` as the `LanguageProvider` default locale.
- [ ] The ops default aligns with server-locale behavior instead of diverging on first render.

### C. Translation remediation `[REQUIRED]`

- [ ] The named zh==en carryovers from the parent brief are translated in
      `apps/ops-console-web/lib/translations.ts`.
- [ ] The named zh==en carryovers from the parent brief are translated in
      `apps/platform-admin-web/lib/translations.ts`.
- [ ] Reviewer spot-check confirms both apps no longer leave the target terms as English literals
      in the zh map.

### D. Key-block scaffolding `[REQUIRED]`

- [ ] `apps/ops-console-web/lib/translations.ts` includes per-domain header markers for the
      remediation wave.
- [ ] `apps/platform-admin-web/lib/translations.ts` includes per-domain header markers for the
      remediation wave.
- [ ] The markers are structural only and do not claim new product semantics.

### E. Caveat tagging and verification `[REQUIRED]`

- [ ] `formatOpsCodeLabel` is explicitly left as dictionary-backed caveat surface rather than
      treated as already-fully-localized truth.
- [ ] `formatPlatformCodeLabel` is explicitly left as dictionary-backed caveat surface rather than
      treated as already-fully-localized truth.
- [ ] `typecheck` passes for `@drts/ops-console-web`.
- [ ] `build` passes for `@drts/ops-console-web`.
- [ ] `typecheck` passes for `@drts/platform-admin-web`.
- [ ] `build` passes for `@drts/platform-admin-web`.

### F. Sidecar packet readiness `[DERIVED]`

- [x] This packet is confined to `support/sidecars/I18N-WP0/`.
- [x] This packet does not edit canonical truth or runtime implementation.
- [x] The packet records that the parent is still `backlog`, avoiding false closeout language.
- [x] The packet converts the parent brief into reviewer-addressed spot checks and evidence anchors.

---

## 6. Evidence Anchors For Future Review

Use these anchors when `I18N-WP0` comes back for review:

- `apps/ops-console-web/lib/i18n.tsx`
  - currently shows `locale: "en"` and `defaultLocale = "en"`
- `apps/platform-admin-web/lib/i18n.tsx`
  - currently shows the target reference posture `locale: "zh"` and `defaultLocale = "zh"`
- `apps/ops-console-web/lib/translations.ts`
  - current untranslated carryovers include `Sync failed`, `Accept pending`, `Manual fallback`,
    `Settlement matrix`, `Insight`, `Channel mix`, `Mismatch review`, and
    `Forwarded reconciliation`
- `apps/platform-admin-web/lib/translations.ts`
  - current untranslated carryovers include `Settlement matrix`, `Channel mix`, `Legal Hold`,
    and `Active Legal Holds`
- `apps/ops-console-web/lib/localized-labels.ts`
  - current caveat helper surface: `formatOpsCodeLabel(...)`
- `apps/platform-admin-web/lib/localized-labels.ts`
  - current caveat helper surface: `formatPlatformCodeLabel(...)`
- `scripts/i18n-guard.mjs`
  - expected new surface; absent at packet creation time

---

## 7. Reviewer Handoff Notes

For `Claude2` when reviewing this sidecar packet:

1. Reconfirm `ai-status.json` still shows `I18N-WP0` as `backlog` or later, with no newly-added
   prerequisite dependencies that would invalidate §3.
2. Treat this packet as the acceptance scaffold for the parent implementation, not as proof that
   the parent is already delivered.
3. When the parent owner later hands off `I18N-WP0`, check the implementation diff against the
   four named surfaces in §4 before relying on prose.
4. Reconfirm the final handoff evidence includes the four required app-toolchain checks:
   - `pnpm --filter @drts/ops-console-web typecheck`
   - `pnpm --filter @drts/ops-console-web build`
   - `pnpm --filter @drts/platform-admin-web typecheck`
   - `pnpm --filter @drts/platform-admin-web build`
5. If the parent implementation broadens beyond the four named surfaces, require the owner to
   explain why that expansion was necessary because this wave is supposed to stay foundational.
6. If the parent task's acceptance contract changes in machine truth, refresh this packet before
   approving the sidecar.

---

## 8. Sidecar-Local Verification

This sidecar does not run the parent implementation toolchain. The local verification expected for
this support artifact is limited to a scoped formatting / whitespace check:

- `git diff --check -- support/sidecars/I18N-WP0/I18N-WP0-SIDECAR-ACCEPTANCE.md`

---

## 9. Files Added By This Sidecar

```text
support/sidecars/I18N-WP0/I18N-WP0-SIDECAR-ACCEPTANCE.md
```
