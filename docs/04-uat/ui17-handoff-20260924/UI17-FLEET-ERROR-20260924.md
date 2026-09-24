# UI17-FLEET-ERROR-20260924 Handoff

## Source & Product Truth
- Source ZIP: `docs/05-ui/driver app (17).zip`
- Source ZIP Hash (SHA256): `b4f78eb602702d573b4f66de779f3ba6f93b5ac11421f567dc17c3ace8c0586f`
- Base Requirements: `docs/05-ui/drts-design-canvas/fleet-portal-missing-scope-screen-requirements-20260808.md`
- Gap Audit Reference: `.local/ui-gap-audit-20260924/audit.md` (Group B)

## Canvas Modifications
- Extracted and integrated `fleet-errors.jsx` into the canonical `docs/05-ui/drts-design-canvas/Fleet Partner Portal.html`.
- Preserved existing fleet-host and fleet-cases hooks that were missing in the ZIP version. Added a dedicated `DCSection id="errors"` section with `err-scope` and `err-page` artboards precisely as provided.

## Component Implementation
- Modified `apps/fleet-partner-portal-web/app/error.tsx`.
- Removed hardcoded English strings and wired to `t("actions.*")` bilingual dictionary in `apps/fleet-partner-portal-web/lib/translations.ts`.
- Inserted `actions.logout` and `actions.backToDashboard` keys into both English and Chinese dicts.
- Bound actual `handleLogout` function using POST to `/api/auth/logout`.
- Excluded unverified/fake "Contact Fleet Admin" contact buttons, meeting the requirements. 
- Integrated real `error.digest` trace values to render in the UI alongside timestamp.

## Verification & Checks
- **Commands Run**: `pnpm --filter fleet-partner-portal-web lint`, `pnpm tsc --noEmit --project apps/fleet-partner-portal-web/tsconfig.json`, `npx vitest run tests/unit/ui17-fleet-error-20260924/error-boundary.test.ts`.
- **Exit Codes**: 2, 1, 1 (Respectively).
- **Check Restrictions**: The local VM isolated worktree lacks `@eslint/js` and `@testing-library/react` context resolving properly due to `node_modules` linkage within the orchestrator temporary worktree environment.
- Tests `.test.ts` was crafted containing reset and logout behavior validation but could not execute successfully under this isolated environment.
- Hosted Browser tests are explicitly skipped and listed as pending acceptance.

## Acceptance Matrix

| Finding／驗收項                                | 原始碼依據與修改位置   | 舊版重現 → 修正版結果                     | 命令、退出碼、執行版本與證據位置                            | 未驗項與具體限制               |
| ---------------------------------------------- | ---------------------- | ----------------------------------------- | ----------------------------------------------------------- | ------------------------------ |
| ui17-fleet-error-20260924_source_and_state_coverage | `Fleet Partner Portal.html`, `fleet-errors.jsx`, `error.tsx` | Added missing UI state for fleet-scope. | Vitest exit 1 (missing env pkgs); Hosted runs pending. | Browser visual presentation and DB integration are pending hosted environment. |
| ui17-fleet-error-20260924_scoped_verification_and_preservation | `error.tsx`, `translations.ts`, `Fleet Partner Portal.html` | Retained `fleet-host` and `fleet-cases` in HTML while adding error states. Implemented actual session logout call. | Local tsc exit 1 (react missing); manual code verify passed. | Live session token reset must be verified via E2E. |

Pending Review and Acceptance execution.
