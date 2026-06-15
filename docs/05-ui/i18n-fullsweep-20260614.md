# i18n Full-Sweep Remediation — 2026-06-14

**Status:** dispatch wave (phase `i18n-fullsweep-20260614`)
**Dispatcher:** `scripts/dispatch-i18n-fullsweep-20260614.py`
**Predecessor:** `docs/05-ui/i18n-multilingual-spec-20260604.md` (the 2026-06-04 ops-console + platform-admin wave; those two apps are now healthy).

## 0. Why this wave

A repo-wide inventory of **every business-app entry point** (2026-06-14) found that
bilingual (en / zh-TW) coverage is **complete in the central catalogs but broken at
the page layer** in two ways:

1. **English-only frontends with NO i18n infra at all** — Taiwanese end-users see only
   English. These need the full canonical i18n stack built from scratch.
2. **tenant-console-web** has the full i18n stack (`lib/i18n.tsx`, `lib/translations.ts`
   with 844 keys at 100 % en/zh parity) **but its admin pages bypass `t()` entirely** and
   hardcode zh-TW string literals. The app exposes a language toggle, so switching to
   English leaves every admin page in Chinese.

### Inventory result (13 apps)

| App | Entry / role | Pages | i18n infra | Verdict |
|---|---|---|---|---|
| platform-admin-web | platform back-office | 22 | ✓ (1788 keys, parity) | healthy — `localized-labels.ts` is a proper `{en,zh}` map |
| bank-console-web | bank back-office (Line A) | 11 | ✓ server-side `t()` + cookie `resolveLocale` | healthy |
| ops-console-web | ops back-office | 21 | ✓ (3132 keys) | healthy; 2 detail pages use inline `copy()` (works, style only) |
| enterprise-dispatch-web | corp employee front (Line B) | 21 | ✓ (156) | healthy; CJK only in fixtures |
| partner-booking-web | bank cardholder (Line A) | 19 | ✓ (194) | healthy; CJK only in data/screens fixtures |
| fleet-partner-portal-web | fleet partner | 11 | ✓ (241) | healthy; CJK only in fixtures/data |
| **tenant-console-web** | **corp dispatch admin (Line B)** | **26** | ✓ (844, parity) **but pages bypass it** | **DEFECT B — 27 admin files hardcode zh-only** |
| **passenger-web** | **passenger front** | **17** | **✗ none** | **DEFECT C — English-only, ~121 strings** |
| **tenant-portal-web** | **tenant portal (staging-deployed)** | **17** | **✗ none** | **DEFECT C — English-only, ~274 strings** |
| **concierge-portal-web** | **concierge desk** | **10** | **✗ none** (has a non-i18n provider) | **DEFECT C — English-only, ~86 strings** |
| driver-app | driver (Expo RN) | — | ✗ | out of scope (native; separate wave) |
| assisted-entry-web | placeholder | 0 | — | skip (README only) |

All catalogs have **100 % en/zh key parity** — the problem is **pages not routed through
`t()`**, not missing translations.

## 1. Canonical i18n pattern (the target)

Mirror the existing healthy apps (e.g. tenant-console / enterprise-dispatch):

- `lib/translations.ts` — `export type Locale = "en" | "zh"`; `const en = {…}`;
  `const zh: Record<keyof typeof en, string> = {…}`; `export const translations = {en, zh}`;
  `export function t(key, locale, params?)`.
- `lib/i18n.tsx` (`"use client"`) — `LanguageProvider` (reads cookie via localStorage +
  `document.cookie`, `router.refresh()` on change) and `useTranslation()` → `{locale, setLocale, t}`.
- `lib/locale-config.ts` — `export const <APP>_LOCALE_COOKIE = "drts-locale-v2"`.
- `lib/server-locale.ts` — `getServerLocale()` reads the cookie server-side.
- `app/layout.tsx` — `<html lang={locale}>`, wrap children in `<LanguageProvider defaultLocale={await getServerLocale()}>`.
- A language toggle in the app shell calling `setLocale`.
- **zh-TW is the PRIMARY locale for passenger/tenant-facing surfaces** (defaultLocale `"zh"`).
- **No inline i18n**: no `locale === "en" ? a : b`, no inline `{en,zh}` objects, no local
  `copy()/tx()` helpers, no hardcoded CJK or hardcoded JSX English text nodes /
  placeholder / title / aria-label / alt literals. Everything goes through `t()`.

## 2. Glossary (term consistency — zh-TW)

booking 訂單/預約 · trip 行程 · receipt 收據 · dispatch 派車 · driver 司機 ·
passenger 乘客 · eligibility 資格 · quota 額度 · cost center 成本中心 ·
webhook Webhook · API key API 金鑰 · audit 稽核 · settlement 結算 ·
invoice 發票 · statement 對帳單 · notification 通知 · rule 規則 ·
SLA 服務水準 · feature flag 功能旗標 · settings 設定 · degraded 降級 ·
unsupported 不支援 · reauth 重新驗證 · read-only 唯讀.

## 3. Wave structure (maximize parallel, minimize merge conflict)

- **Each of the 3 frontend apps = ONE self-contained task.** They share no files with each
  other or with tenant-console, so they run fully parallel with zero conflict. Each task
  builds the full stack (§1) + converts every page/component/route-data file.
- **tenant-console = HUB + spokes.** The HUB lays down per-domain key-block headers in BOTH
  the `en` and `zh` blocks of `lib/translations.ts` so spokes append into disjoint regions.
  Each spoke depends ONLY on the HUB, owns a disjoint set of page files, and adds keys ONLY
  under its own domain header.
- **VERIFY** depends on the whole set: lint + typecheck + build green for all 4 apps;
  creates/runs `scripts/i18n-guard.mjs` (0 violations across the 4 apps); spot-checks en/zh.

### Task list

| ID | Owner→Reviewer | Scope | Dep |
|---|---|---|---|
| I18N2-FE-PASSENGER | full passenger-web stack + 17 pages + navigation.ts | — |
| I18N2-FE-CONCIERGE | full concierge-portal-web stack + 10 routes (nest under existing provider) | — |
| I18N2-FE-TENANTPORTAL | full tenant-portal-web stack + 17 pages (confirm intent vs tenant-console first) | — |
| I18N2-TC-HUB | per-domain key-block headers in tenant-console translations.ts | — |
| I18N2-TC-SETTINGS | app/settings/** | HUB |
| I18N2-TC-WEBHOOKS | app/webhooks/** | HUB |
| I18N2-TC-APIKEYS | app/api-keys/** | HUB |
| I18N2-TC-COSTCENTERS | app/cost-centers/** | HUB |
| I18N2-TC-REPORTS | app/reports/** | HUB |
| I18N2-TC-RULES | app/rules/** | HUB |
| I18N2-TC-SLA-AUDIT | app/sla/** + app/audit/** | HUB |
| I18N2-TC-INVOICES-BILLING | app/invoices/** + app/billing/** | HUB |
| I18N2-TC-PAX-ADDR | app/passengers/** + app/addresses/** | HUB |
| I18N2-TC-USERS-INTGOV | app/users/** + app/integration-governance/** | HUB |
| I18N2-TC-NOTIFICATIONS | app/notifications/** | HUB |
| I18N2-TC-FEATUREFLAGS | app/feature-flags/** | HUB |
| I18N2-TC-HOME-SHARED | app/page.tsx + lib/notification-canvas.tsx + lib/formatters.ts | HUB |
| I18N2-VERIFY | lint/typecheck/build all 4 apps + i18n-guard | all |

## 4. Per-task acceptance (common)

- Target file(s): 0 hardcoded CJK, 0 hardcoded user-facing English literals, 0 inline i18n.
- All user-facing strings via central `t()`; new keys present in BOTH `en` and `zh`,
  glossary-consistent.
- `eslint . --max-warnings=0` + typecheck + `next build` pass for the app.
- Spokes: keys added only under the task's own domain header in translations.ts.

## 5. Guardrails (operator standing rules)

- zh-TW primary via central `lib/translations.ts` `t()`; **no inline i18n**.
- Do NOT redesign UI; only route existing strings through `t()` and (for frontends) add the
  toggle. If a screen has a design-canvas spec, match it.
- No Lovable; drts-side `apps/*` only.
- Branch from current `origin/dev`; anchor commit + PR per task.
