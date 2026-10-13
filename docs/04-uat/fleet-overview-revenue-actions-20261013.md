# Fleet overview and revenue actions

Task: `FLEET-OVERVIEW-REVENUE-ACTIONS-20261013`

Base: `108766390714775d2cdaeab390bf0ff5c4590d1b`, after the Fleet statement decision task completed its normal review, CI and merge.

## Problem and resulting behavior

The sidebar opens `/dashboard`, whose duplicated page left Export, Recruit drivers and Go to trips without navigation. It now uses the existing working root overview. Both routes retain the requested month in the data load, summary CSV and trip-list link; recruitment opens the existing driver form. Existing zero-data and read-failure notices are shared as well.

The revenue page previously ignored `period`, read the statement collection twice, and exposed inactive period/export controls. `loadRevenue(period)` now reads the scoped statement collection once. The selected record supplies its amount, line breakdown, payout and decision fields, partner context and exact statement CSV target. A native GET form chooses among actual statement months, including an explicitly requested month that has no record. Without a requested month, the latest actual month is selected.

A missing month stays empty even if another month exists. A failed read retains the requested month, displays a retry action, shows an unavailable amount, and offers no statement mutation or CSV link. Successful zero amounts remain zero. Existing paid, confirmed and disputed states, saved notes, linked case navigation and immutable statement lines are retained.

The existing overview, revenue cards, theme and bilingual copy conventions are used. No API, SDK, statement mutation component, CSV handler, database migration, pricing algorithm or authorization policy changes are required.

## Acceptance and evidence

| Requirement                            | Production behavior tested                                                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R11/C064 active overview actions       | Actual sidebar target and both server pages; export/recruit/trips destinations and requested-month API arguments                                       |
| Overview source consistency            | Live empty data displays zero; failed driver/trip reads remain explicit and do not become fixture counts                                               |
| R24/C068 period selection              | Native labeled GET form in English and Chinese; actual unique month options, selection and submitted form value                                        |
| One authoritative statement collection | Two distinguishable mock server snapshots; one list call per actual revenue render, with all displayed amounts and decisions from the first collection |
| Exact selected statement action        | Historical unreviewed record submits its own ID through the existing decision control                                                                  |
| Empty and unavailable states           | Requested absent month and zero records never select another period; failures expose retry for the same month and no actionable statement/export       |
| Reviewed and paid records              | Confirmed/disputed notes and case link remain readable; paid status takes precedence; terminal mutations remain disabled                               |
| Exact CSV                              | Actual existing route handler returns the chosen statement's line IDs, amount and filename, including reviewed and paid records                        |

The retained earlier audit records six positive user-action failures. The new production-page/loader suite also ran against the unchanged base: 11 assertions failed and 2 passed, with the working root overview and missing-scope propagation serving as controls. After implementation and an additional selected-statement mutation check, all 14 new tests pass.

The affected regression command passes **82 tests across 5 files**:

```sh
pnpm exec vitest run \
  tests/unit/fleet-overview-revenue-actions-20261013 \
  tests/unit/system-remediation/sr-fleet-data-001 \
  tests/unit/system-remediation/sr-fleet-settle-001 \
  tests/unit/fleet-statement-decisions-20261013/frontend-actions.test.tsx \
  tests/unit/app-missing-actions-20261013/fleet-cases.test.tsx
```

The Fleet app unit suite passes **21 tests across 5 files**. Fleet and root typechecks, scoped ESLint/format, i18n guard, repository classification and diff checks pass. Machine-specific before/after logs and check receipts are retained under `.local/fleet-overview-revenue-actions-20261013/`.

## Verification boundary

These are repository unit/jsdom checks of the production pages, loaders, components and route handler. They do not start a product server, browser/E2E server, database or Docker infrastructure on the VM. Formal independent review, exact-candidate hosted CI and immutable cloud deployment follow the existing task/release workflow; this document does not substitute local checks for those results or for full production/provider acceptance.

# 既有提交檢查初始化

離線安裝使用 `--ignore-scripts`，初始工作目錄尚無 Husky dispatcher。
未推送的實作 anchor `e666c7854` 建立後，補執行既有 `pnpm exec husky`，
再對完整任務 diff 執行原 lint-staged 的 Prettier／ESLint，全部通過。
此紀錄以正常 Git hooks 建立後續 closeout commit；anchor 保留，未冒充
已交審候選或沿用其不存在的 hooks 結果。沒有新增提交規則或檢查。
