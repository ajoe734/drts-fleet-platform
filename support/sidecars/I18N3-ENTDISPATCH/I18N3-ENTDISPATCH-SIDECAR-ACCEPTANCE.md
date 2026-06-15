# I18N3-ENTDISPATCH Sidecar Acceptance Packet

> **Parent Task:** `I18N3-ENTDISPATCH`
> **Parent Owner / Reviewer:** `Claude2` / `Gemini2`
> **Sidecar Owner / Reviewer:** `Codex` / `Claude2`
> **Helper Kind:** `acceptance_packet`
> **Mutates Canonical:** `false`
> **Prepared:** `2026-06-15`

This packet is a support artifact only. It does not change L1 product truth, runtime code, contracts, or governance surfaces. Its purpose is to give the parent owner and the assigned reviewer a concrete acceptance checklist and dependency map for the `apps/enterprise-dispatch-web` i18n cleanup wave.

---

## 1. Task Posture

### 1.1 Official machine-truth snapshot

| Field | Value |
| --- | --- |
| Sidecar ID | `I18N3-ENTDISPATCH-SIDECAR-ACCEPTANCE` |
| Sidecar Status | `in_progress` at packet preparation time |
| Parent ID | `I18N3-ENTDISPATCH` |
| Parent Status | `in_progress` |
| Parent Summary | `enterprise-dispatch-web i18n cleanup (85 hardcoded jsx-text)` |

### 1.2 Parent acceptance target

Source: parent task acceptance field plus embedded task brief.

- `scripts/i18n-guard.mjs` reports `0 violation` for `apps/enterprise-dispatch-web`
- All user-facing strings move to central `apps/enterprise-dispatch-web/lib/translations.ts`
- Client surfaces use `useTranslation()`; server surfaces use `getServerLocale()` plus `t(key, locale, params)`
- English and Chinese keys remain parity-complete
- Glossary stays consistent:
  `booking=訂單`, `trip=行程`, `receipt=收據`, `dispatch=派車`, `driver=司機`, `passenger=乘客`, `pickup=上車`, `drop-off=下車`, `review=確認/覆核`
- Validation passes:
  `node scripts/i18n-guard.mjs` for the target app, `lint`, `typecheck`, and `next build`

---

## 2. Current-State Readout

The current repository state confirms that `apps/enterprise-dispatch-web` does not yet have the standard i18n foundation files that sibling apps already use:

- Missing `apps/enterprise-dispatch-web/lib/translations.ts`
- Missing `apps/enterprise-dispatch-web/lib/i18n.tsx`
- Missing `apps/enterprise-dispatch-web/lib/server-locale.ts`

The current root layout is still hardcoded:

- `apps/enterprise-dispatch-web/app/layout.tsx` uses literal metadata strings and fixed `lang="zh-Hant"`
- `apps/partner-booking-web/app/layout.tsx` shows the expected pattern: `getServerLocale()`, `LanguageProvider`, and metadata from `t(...)`

This means the parent task is not a pure copy sweep; it also depends on first establishing the app-local i18n wiring pattern already used in other web apps.

---

## 3. Dependency Map

### 3.1 Structural dependencies inside the target app

| Layer | Required artifact | Purpose | Status now |
| --- | --- | --- | --- |
| Core dictionary | `apps/enterprise-dispatch-web/lib/translations.ts` | Single source for all user-facing copy and glossary enforcement | Missing |
| Client locale hook | `apps/enterprise-dispatch-web/lib/i18n.tsx` | `useTranslation()` and locale switching for client components | Missing |
| Server locale resolver | `apps/enterprise-dispatch-web/lib/server-locale.ts` | Server-side locale selection for metadata and server components | Missing |
| Root wiring | `apps/enterprise-dispatch-web/app/layout.tsx` | Provide locale-aware `<html lang>` and `LanguageProvider` | Present, not localized |

### 3.2 UI surfaces called out by the parent task

The parent brief explicitly identifies these high-signal surfaces for copy externalization:

- `apps/enterprise-dispatch-web/app/page.tsx`
- `apps/enterprise-dispatch-web/app/bookings/new/page.tsx`
- `apps/enterprise-dispatch-web/app/bookings/review/page.tsx`
- `apps/enterprise-dispatch-web/app/bookings/submitted/page.tsx`
- `apps/enterprise-dispatch-web/app/trip/page.tsx`
- `apps/enterprise-dispatch-web/app/help/page.tsx`
- `apps/enterprise-dispatch-web/components/enterprise-shell.tsx`

The broader app surface also includes additional state pages and booking views that should be treated as likely i18n-guard follow-on scan targets:

- approval and degraded-state pages under `apps/enterprise-dispatch-web/app/*`
- booking detail and receipts pages
- reusable components under `apps/enterprise-dispatch-web/components/*`

### 3.3 Verification dependencies

| Dependency | Role |
| --- | --- |
| `scripts/i18n-guard.mjs` | Detects hardcoded JSX text, inline bilingual maps, locale ternaries, `tx(...)`, and text attributes |
| `apps/enterprise-dispatch-web/package.json` | Defines the local verification commands: `lint`, `typecheck`, `build`, `test` |
| Existing i18n apps such as `apps/partner-booking-web` | Reference implementation for `translations.ts`, `i18n.tsx`, `server-locale.ts`, and localized root layout |

### 3.4 Upstream / downstream blockers

- Upstream blockers recorded in machine truth: `none`
- Sidecar-only blockers: `none`
- Parent task reviewer dependency: parent owner must eventually hand off concrete implementation evidence to `Gemini2`

---

## 4. Reviewer Checklist For Parent Acceptance

Use this list when the parent owner claims `I18N3-ENTDISPATCH` is ready for review.

### 4.1 I18n foundation exists

- [ ] `apps/enterprise-dispatch-web/lib/translations.ts` exists and contains both `en` and `zh` entries
- [ ] `apps/enterprise-dispatch-web/lib/i18n.tsx` exposes `useTranslation()` or equivalent app-local locale context
- [ ] `apps/enterprise-dispatch-web/lib/server-locale.ts` exists and is used by server-rendered surfaces
- [ ] `apps/enterprise-dispatch-web/app/layout.tsx` no longer hardcodes title, description, or `<html lang>`

### 4.2 Copy externalization is complete

- [ ] No inline `{ en, zh }` bilingual maps remain in the target app
- [ ] No `locale === "zh" ? ... : ...` copy ternaries remain
- [ ] No local `tx(...)` helpers remain for display copy
- [ ] No hardcoded JSX text nodes remain in `app/`, `components/`, or `lib/` TS/TSX files
- [ ] No hardcoded user-facing `placeholder`, `title`, `alt`, or `aria-label` values remain

### 4.3 Glossary and parity checks hold

- [ ] New translation keys exist in both languages
- [ ] The task glossary terms are used consistently across booking, trip, receipt, and dispatch flows
- [ ] Reviewer samples at least one booking page, one trip/receipt page, and one shell/state page in both locales

### 4.4 Required verification evidence exists

- [ ] `scripts/i18n-guard.mjs` was run against `apps/enterprise-dispatch-web` and reports `0 violation`
- [ ] `pnpm --filter @drts/enterprise-dispatch-web lint` passed
- [ ] `pnpm --filter @drts/enterprise-dispatch-web typecheck` passed
- [ ] `pnpm --filter @drts/enterprise-dispatch-web build` passed
- [ ] If the owner ran extra unit tests, the exact command and result are recorded in the handoff note

---

## 5. Recommended Handoff Payload

When the parent owner hands `I18N3-ENTDISPATCH` to review, the handoff note should include:

| Item | Why it matters |
| --- | --- |
| Final list of touched files | Lets reviewer focus on actual copy-conversion scope |
| Exact i18n-guard invocation | Confirms the app-specific scan path used to reach `0 violation` |
| Verification command results | Confirms lint/typecheck/build status without guessing |
| Known non-claims | Prevents accidental over-claim beyond string externalization |

Suggested non-claims for reviewer alignment:

- No UI redesign
- No canonical contract change
- No runtime behavior change except locale-driven copy rendering
- No governance or registry change

---

## 6. Verdict

**Sidecar packet status: `READY TO HAND OFF FOR REVIEW SUPPORT`**

This packet is complete as a support artifact. It gives the parent owner a concrete acceptance target and gives `Claude2` a stable checklist to use when validating the eventual `I18N3-ENTDISPATCH` delivery.

---

## 7. Handoff To Claude2

This sidecar does not certify the parent implementation as complete. It prepares the acceptance path only.

Reviewer focus:

- confirm the final parent handoff includes the i18n-foundation files, not only copy edits
- verify `scripts/i18n-guard.mjs` reaches `0 violation` for `apps/enterprise-dispatch-web`
- confirm the owner does not over-claim beyond supportable app-local string externalization
