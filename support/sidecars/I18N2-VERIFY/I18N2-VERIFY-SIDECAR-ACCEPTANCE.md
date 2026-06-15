# I18N2-VERIFY Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `I18N2-VERIFY` - i18n full-sweep verification (3 apps green + guard)  
**Current Sidecar Owner:** `Codex`  
**Assigned Reviewer:** `Claude`  
**Sidecar Task ID:** `I18N2-VERIFY-SIDECAR-ACCEPTANCE`  
**Last Revised:** `2026-06-15T00:33:00Z (UTC)`  
**Status:** `review` - ready for reviewer handoff to `Claude`

---

## 1) Scope Boundary

本 sidecar 只整理 `I18N2-VERIFY` 的 acceptance checklist、dependency map、evidence anchors 與 reviewer handoff 指引；不修改 canonical truth，也不代替 parent 任務改寫 runtime、registry 或 i18n 實作。

- In scope: support-only acceptance framing、dependency 狀態彙整、repo path 對位、reviewer checklist。
- Out of scope: 修改 `apps/*` i18n 程式碼、重跑或改寫 parent 驗證結果、修正 task board 本身的命名缺口、改 canonical docs / machine truth。
- 本 packet 是 advisory support material；是否吸收進主線由 parent owner / reviewer 決定。

---

## 2) Parent Task Snapshot (machine truth)

以 `AI_NAME=Codex scripts/ai-status.sh show I18N2-VERIFY` 為準，讀取於 `2026-06-15T00:26Z`：

- Parent `I18N2-VERIFY`: `status=review`, owner=`Codex`, reviewer=`Claude`, phase=`i18n-fullsweep-20260614`
- Parent summary: `passenger-web / concierge-portal-web / tenant-console-web` 驗證 `eslint --max-warnings=0`、`typecheck`、`next build` 全綠，並以 `scripts/i18n-guard.mjs` 檢查 0 violations
- Parent `next`: branch head `63e04de5a` 已重驗，guard 掃描 `122 files / 3 apps`，`tenant-portal-web` 因 `FBP-007` 退役而排除
- Parent integration fields 同時記錄 `integration_status=merged_to_dev`，`merge_commit=279a9865ed1a9ec37c517a816efa5f832b9e6747`

### Review note on parent acceptance wording

machine truth 內存在一個 reviewer 需要明確知道的語義落差：

- `summary_zh` 與 `next` 都寫目前 guard/verification 範圍是 **3 apps**
- 但 parent `artifacts` 仍列出 `apps/tenant-portal-web/`
- parent `acceptance` 仍寫 **all 4 apps** green

本 sidecar 不改 machine truth；僅建議 reviewer 以 parent `summary_zh` / `next` 的最新敘述解讀目前驗證基線，即 `tenant-portal-web` 已退役，不在本輪 active verification scope。

---

## 3) Dependency Map

依 `I18N2-VERIFY` depends_on 列表，本 sidecar 將依賴切成兩組：

1. machine truth 可直接查到且已具明確狀態的 task
2. machine truth 以同名 task id 查無結果，但 repo 路徑確實存在的 surface

### 3.1 Dependencies found in machine truth

| Task ID | Status | Reviewer | Integration signal | Notes |
| --- | --- | --- | --- | --- |
| `I18N2-TC-RULES` | `done` | `Claude2` | `merged_to_dev` | closeout commit `464a88efa19ca39bb4b7da3f7ba0f606708f627b` |
| `I18N2-TC-SLA-AUDIT` | `done` | `Claude2` | `merged_to_dev` | closeout commit `1f127ecd4feed2b18aee9606b8c1c70e415dd270` |
| `I18N2-TC-INVOICES-BILLING` | `done` | `Claude2` | narrative says merged to dev | no explicit integration fields in task slice shown |
| `I18N2-TC-PAX-ADDR` | `done` | `Claude` | narrative says integrated to dev | worker closeout had stalled earlier on isolated worktree |
| `I18N2-TC-USERS-INTGOV` | `done` | `Claude` | narrative says integrated to dev | same operator integration note as above |
| `I18N2-TC-NOTIFICATIONS` | `done` | `Claude2` | `merged_to_dev` | PR `#707`, CI passed, merge commit `60f1d190623c1c21b3471896274e1a99d64eff69` |
| `I18N2-TC-FEATUREFLAGS` | `done` | `Claude` | narrative says integrated to dev | no explicit PR field in shown slice |
| `I18N2-TC-HOME-SHARED` | `done` | `Claude` | narrative says integrated to dev | parent merge fields now point at dev commit `279a9865...` |

### 3.2 Dependency ids not found in machine truth slice

下列 task id 以 `scripts/ai-status.sh show <task-id>` 查詢時回傳 `Task not found`：

- `I18N2-FE-PASSENGER`
- `I18N2-FE-CONCIERGE`
- `I18N2-TC-SETTINGS`
- `I18N2-TC-WEBHOOKS`
- `I18N2-TC-APIKEYS`
- `I18N2-TC-COSTCENTERS`
- `I18N2-TC-REPORTS`

這不等於功能不存在；只代表目前 machine truth 不能用這些 id 直接切片出 task 狀態。repo 內可對位到的實際 surface 仍存在：

| Missing task id | Repo surface observed in this worktree |
| --- | --- |
| `I18N2-FE-PASSENGER` | `apps/passenger-web/` |
| `I18N2-FE-CONCIERGE` | `apps/concierge-portal-web/` |
| `I18N2-TC-SETTINGS` | `apps/tenant-console-web/app/settings/` |
| `I18N2-TC-WEBHOOKS` | `apps/tenant-console-web/app/webhooks/` |
| `I18N2-TC-APIKEYS` | `apps/tenant-console-web/app/api-keys/` |
| `I18N2-TC-COSTCENTERS` | `apps/tenant-console-web/app/cost-centers/` |
| `I18N2-TC-REPORTS` | `apps/tenant-console-web/app/reports/` |

### 3.3 Practical reading of the dependency map

- Parent `I18N2-VERIFY` is already in `review`, so at least one prior verification run was considered sufficient for handoff.
- Eight tenant-console dependency tasks are machine-truth-visible and all read as `done`.
- Seven dependency ids are naming or archival gaps from the perspective of this worker slice; this packet treats them as **evidence gaps**, not as confirmed blockers.
- Because this sidecar cannot rewrite machine truth, reviewer action should be limited to deciding whether the parent review can proceed with current evidence, or whether those missing ids need an explicit status repair follow-up.

---

## 4) Acceptance Checklist for Parent Review

This checklist expands the parent task's current acceptance without redefining product truth.

### AC-1: Guard coverage and zero violations

- [ ] `scripts/i18n-guard.mjs` completed successfully on the active verification scope
- [ ] reported scope matches the current parent interpretation: `122 files / 3 apps`
- [ ] no inline `copy()/tx()` helper, no locale ternary UI copy, no inline `{en, zh}` payloads
- [ ] no hardcoded CJK or hardcoded user-facing English in the scanned surfaces

### AC-2: Build and static quality gates

- [ ] `apps/passenger-web` passed `eslint --max-warnings=0`
- [ ] `apps/passenger-web` passed `typecheck`
- [ ] `apps/passenger-web` passed `next build`
- [ ] `apps/concierge-portal-web` passed `eslint --max-warnings=0`
- [ ] `apps/concierge-portal-web` passed `typecheck`
- [ ] `apps/concierge-portal-web` passed `next build`
- [ ] `apps/tenant-console-web` passed `eslint --max-warnings=0`
- [ ] `apps/tenant-console-web` passed `typecheck`
- [ ] `apps/tenant-console-web` passed `next build`

### AC-3: Tenant-console route coverage stays aligned with localized smoke expectations

- [ ] tenant-console localization smoke still covers the canonical long-tail routes listed in `tests/tenant-localization/tenant-localization.spec.ts`
- [ ] the route set still includes `settings`, `webhooks`, `api-keys`, `cost-centers`, `reports`, `rules`, `sla`, `notifications`, `passengers`, `users`, `integration-governance`, `feature-flags`, `billing`, `invoices`, `audit`, `addresses`
- [ ] shell language controls remain visible in both locales

### AC-4: Parent wording remains internally coherent enough for approval

- [ ] reviewer explicitly notes whether `tenant-portal-web` is excluded from this round because of `FBP-007`
- [ ] reviewer confirms the parent acceptance should be interpreted as 3 active apps, not 4
- [ ] any machine-truth repair needed for missing dependency ids is tracked separately from this verification approval

---

## 5) Evidence Anchors

- machine truth:
  - `AI_NAME=Codex scripts/ai-status.sh show I18N2-VERIFY`
  - `AI_NAME=Codex scripts/ai-status.sh show I18N2-VERIFY-SIDECAR-ACCEPTANCE`
  - `AI_NAME=Codex scripts/ai-status.sh show <dependency-task-id>`
- parent verification scope:
  - [tests/tenant-localization/tenant-localization.spec.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-i18n2-verify-sidecar-acceptance/tests/tenant-localization/tenant-localization.spec.ts)
- tenant-console localized surfaces present in repo:
  - [apps/tenant-console-web/app](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-i18n2-verify-sidecar-acceptance/apps/tenant-console-web/app)
  - [apps/tenant-console-web/lib/translations.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-i18n2-verify-sidecar-acceptance/apps/tenant-console-web/lib/translations.ts)
- frontend app roots that correspond to missing dependency ids:
  - [apps/passenger-web](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-i18n2-verify-sidecar-acceptance/apps/passenger-web)
  - [apps/concierge-portal-web](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-i18n2-verify-sidecar-acceptance/apps/concierge-portal-web)
- prior integration framing:
  - [docs/05-ui/i18n-integration-closeout-20260604.md](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-i18n2-verify-sidecar-acceptance/docs/05-ui/i18n-integration-closeout-20260604.md)

---

## 6) Reviewer Checklist (`Claude`)

- [ ] Confirm this packet stays support-only and does not edit canonical truth
- [ ] Confirm §2 accurately reflects the current `I18N2-VERIFY` machine-truth slice, including the 3-app vs 4-app wording mismatch
- [ ] Confirm §3.1 status/integration summaries for the eight resolvable tenant-console dependencies are accurate enough for review use
- [ ] Decide whether the seven `Task not found` dependency ids are acceptable as non-blocking naming gaps for parent review, or require follow-up before approving `I18N2-VERIFY`
- [ ] Confirm `tests/tenant-localization/tenant-localization.spec.ts` still matches the route coverage assumptions used in §4

---

## 7) Handoff

- Owner `Codex` prepares this packet for reviewer `Claude`
- This sidecar is `INTEGRATION_STATUS=not_applicable` in substance because it is support-only; any integration meaning still lives on the parent task
- Recommended reviewer outcome:
  - approve the sidecar if the dependency-map framing and wording-gap callout are accurate
  - if parent approval is blocked, reopen the parent or create a separate machine-truth repair task for the missing dependency ids instead of mutating this sidecar's scope
