# GAP-SB-006 Acceptance Packet

**Task:** GAP-SB-006 — platform-admin: placard form 禁用/警告 retired source（純 UI）
**Sidecar:** GAP-SB-006-SIDECAR-ACCEPTANCE
**Packet Author:** Claude
**Prepared:** 2026-04-19
**Reviewer:** Codex2

---

## 1. Feature Summary

GAP-SB-006 adds retired-source blocking to the Generate Placard form in the Platform Admin Switchboard UI. Retired `PublicInfoVersion` entries remain visible in the source dropdown for audit history, but:

- They are rendered as `disabled` option elements (cannot be selected).
- Their option label is suffixed with `(retired source unavailable)`.
- If somehow selected, the Generate button is disabled via `placardSourceBlocked`.
- A contextual hint explains the block reason.
- An audit note is always shown below the form: _"Retired public info versions remain visible for audit history, but cannot be used to generate new placards."_
- Auto-selection on form open skips retired versions entirely (prefers published → draft → null).

---

## 2. Commit Evidence

| Field        | Value                                                   |
| ------------ | ------------------------------------------------------- |
| Commit hash  | `5d1052d`                                               |
| Subject      | `feat(gap-sb-006): block retired placard sources in ui` |
| Author       | ajoe734                                                 |
| Date         | 2026-04-19T15:58:37Z                                    |
| Committed by | Codex2                                                  |
| Reviewed by  | Claude                                                  |

---

## 3. Changed Files

| File                                                           | Change                                                            |
| -------------------------------------------------------------- | ----------------------------------------------------------------- |
| `apps/platform-admin-web/app/switchboard/placard-source.ts`    | New module — all retired-source logic extracted here              |
| `apps/platform-admin-web/app/switchboard/page.tsx`             | Wired placard-source helpers; disabled button when source blocked |
| `tests/unit/platform-admin-switchboard-placard-source.test.ts` | 4 vitest unit tests covering all acceptance scenarios             |

---

## 4. Acceptance Checklist

### 4.1 Core Behaviours

- [x] **Retired options are disabled in dropdown** — `<option disabled>` set via `isPlacardSourceSelectionBlocked(version)` in `page.tsx:470`
- [x] **Retired option label warns the user** — `formatPlacardSourceOptionLabel` returns `${title} (retired source unavailable)` for retired status
- [x] **Generate button blocked when retired selected** — `placardSourceBlocked` derived from `isPlacardSourceSelectionBlocked(selectedPublicInfoVersion)`, added to button `disabled` condition at `page.tsx:533`
- [x] **Contextual hint explains block reason** — `getPlacardSourceSelectionHint` returns the correct message for retired/published/draft/null
- [x] **Audit note always shown** — `PLACARD_RETIRED_SOURCE_AUDIT_NOTE` rendered as a persistent `<p>` below the hint
- [x] **Auto-select skips retired** — `getPreferredPlacardSourceVersion` returns `published ?? draft ?? null`, never retired

### 4.2 Non-Regression

- [x] **Draft sources remain selectable** — `isPlacardSourceSelectionBlocked` returns `false` for draft
- [x] **Published sources remain selectable** — `isPlacardSourceSelectionBlocked` returns `false` for published
- [x] **Empty selection handled** — hint falls back to "Select a source…" when version is null/undefined
- [x] **No canonical contract changes** — only UI and a new UI-side utility module; `@drts/contracts` untouched

### 4.3 Test Coverage

| Test                                                                         | Status |
| ---------------------------------------------------------------------------- | ------ |
| `marks retired sources unavailable in the option label`                      | pass   |
| `blocks placard generation for retired sources and explains why`             | pass   |
| `keeps published and draft sources selectable with the correct hint`         | pass   |
| `prefers published, then draft, and never auto-selects retired-only sources` | pass   |

---

## 5. Dependency Map

```
GAP-SB-006 (done)
├── placard-source.ts            [new, UI-only utility]
├── switchboard/page.tsx         [consumer of placard-source.ts]
└── tests/unit/...test.ts        [unit tests — no external deps]

Upstream contracts touched: NONE
API routes touched: NONE
DB migrations touched: NONE
```

GAP-SB-006 has **no downstream blockers** and no pending follow-up tasks in the task board.

---

## 6. Open Items / Known Gaps

None. The implementation satisfies all stated acceptance criteria. No deferred logic was identified.

---

## 7. Handoff Note

This packet is complete and ready for Codex2 (assigned reviewer) to accept or flag concerns. The parent task GAP-SB-006 is already recorded as `done` in `ai-status.json`. No canonical files were modified by this sidecar.

If the reviewer confirms no issues, `GAP-SB-006-SIDECAR-ACCEPTANCE` should move from `review` to `review_approved`, after which the owner (`Claude`) can finalize it to `done` without further packet changes.
