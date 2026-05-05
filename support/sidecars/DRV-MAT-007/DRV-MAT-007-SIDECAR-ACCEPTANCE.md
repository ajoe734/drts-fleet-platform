# DRV-MAT-007 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `DRV-MAT-007` — Driver platform presence and binding
**Sidecar Owner:** `Claude`
**Assigned Reviewer:** `Codex2`
**Parent Owner / Reviewer (current snapshot):** `Codex2` / `Codex`
**Parent Owner / Reviewer (prior snapshots):** `Codex` / `Codex2` _(historical — held during the most recent review pass before further availability-first reassignment)_; `Codex2` / `Codex` _(historical — initial assignment)_
**Generated:** `2026-05-05` (UTC) · **Re-baselined:** `2026-05-05T02:08Z`
**Snapshot Status:** Parent `DRV-MAT-007` is now `done` in `ai-status.json` (`last_update: 2026-05-05T02:04:06Z`). Closeout evidence is recorded in machine truth: `commit_hash=b7e14a4`, `commit_subject="DRV-MAT-007 unify driver platform status UX"`, `commit_agent=Codex2`, `commit_reviewer=Codex`, pushed to `origin/codex/dev-deploy-backend-android` (`push_remote=origin`, `push_branch=codex/dev-deploy-backend-android`, `push_commit=b7e14a4`). Reviewer (`Codex`) has already recorded the four `review_notes_zh` confirmations (no blocker, shared `PlatformStatusCard`, emoji removal, Traditional Chinese runtime copy, `pnpm --filter @drts/driver-app typecheck 通過`). This sidecar remains a support-only acceptance frame; it does not finalize the parent task and does not retroactively rewrite the parent closeout.

> **Snapshot provenance.** Earlier revisions of this packet stated the parent was in `review` (owner/reviewer `Codex2`/`Codex`) and later `review_approved` (owner/reviewer `Codex`/`Codex2`). Both reflected the parent's machine state at the time of generation. The parent lane went through multiple availability-first reassignments and finally landed `done` with owner `Codex2` and reviewer `Codex`. All "current state" assertions below have been refreshed against the live `ai-status.json` and the post-commit working tree at the re-baseline timestamp; prior snapshots are preserved above only as historical context.

---

## 1) Scope Boundary

本 sidecar 只整理 `DRV-MAT-007` 的 acceptance framing、dependency map、repo baseline、reviewer hotspot 與 handoff wording，不修改 canonical truth，也不替 parent 任務直接合併或 close out `/platform-presence` 與 platform binding 主線實作。

- In scope: support-only acceptance checklist、current repo baseline、duplicate-card 整併狀態、localization audit hotspot、verification expectations、reviewer guidance。
- Out of scope: 修改 `apps/driver-app/app/platform-presence.tsx`、`apps/driver-app/components/platform-status-card.tsx`、`apps/driver-app/components/platform-binding.tsx`、變更 `@drts/contracts` platform 型別、改寫 L1/L2 product truth、直接替 parent task closeout。

---

## 2) Current State Baseline

以 `ai-status.json`、設計/執行文件、目前 repo 掃描與 parent 任務工作樹快照為準（baseline refreshed at `2026-05-05T02:08Z`）：

- 父任務 `DRV-MAT-007` 在 machine truth 中為 `done`，Owner=`Codex2`，Reviewer=`Codex`，Last Update `2026-05-05T02:04:06Z`。`next` 紀錄為 "Closeout complete: unified platform presence and binding on a shared PlatformStatusCard, removed emoji actions, kept runtime copy Chinese, verified with pnpm --filter @drts/driver-app typecheck, committed as b7e14a4 and pushed to origin/codex/dev-deploy-backend-android."
- 父任務 commit/push evidence 已寫入 `ai-status.json`：
  - `commit_hash=b7e14a4` · `commit_subject="DRV-MAT-007 unify driver platform status UX"`
  - `commit_agent=Codex2` · `commit_reviewer=Codex` · `commit_recorded_at=2026-05-05T02:04:06Z`
  - `push_remote=origin` · `push_branch=codex/dev-deploy-backend-android` · `push_ref=origin/codex/dev-deploy-backend-android` · `push_commit=b7e14a4` · `push_recorded_at=2026-05-05T02:04:06Z`
- 父任務 `review_notes_zh` 已記入四條 reviewer 結論：
  - `未發現阻擋問題`
  - `確認 platform-presence 與 platform-binding 已共用 PlatformStatusCard`
  - `確認 emoji action 已移除，runtime 文案已改為中文`
  - `驗證：pnpm --filter @drts/driver-app typecheck 通過`
- 父任務 formal acceptance 共四條（`ai-status.json`）：
  - `one canonical platform status component`
  - `no emoji action`
  - `no English runtime copy`
  - `typecheck passes`
- `docs/03-runbooks/driver-app-productization-execution-packet-20260504.md:213-235` 額外要求 reviewer 應確認：
  - 唯一 canonical platform status/account component 仍在使用
  - 上線/下線、可接單資格、token 到期、re-auth、bind、unbind 文案皆為繁體中文
  - re-auth 改為 icon button 並具備 accessibility label
  - settings 可重用同一個 platform account 元件而不出現英文 runtime copy
  - 驗證: `pnpm --filter @drts/driver-app typecheck`
- `docs/02-architecture/driver-app-productization-design-plan-20260504.md:223-244,326,371` 對 `/platform-presence` 與 duplicate card 的處置: 「Pick one canonical component during DRV-MAT-007; delete or deprecate the duplicate only after integration is verified.」
- 目前 repo 工作樹快照 (`git status` + 本 packet 掃讀):
  - `git log --oneline -- apps/driver-app/app/platform-presence.tsx apps/driver-app/components/platform-status-card.tsx apps/driver-app/components/platform-binding.tsx` 顯示最新修改皆已併入 `b7e14a4 DRV-MAT-007 unify driver platform status UX`，三個 parent artifact 在工作樹已 clean，無未提交差異。
  - `git status -- apps/driver-app/app/platform-presence.tsx apps/driver-app/components/platform-binding.tsx apps/driver-app/components/platform-status-card.tsx` 為 `nothing to commit, working tree clean`；分支 `codex/dev-deploy-backend-android` 與 `origin/codex/dev-deploy-backend-android` 同步。
  - `apps/driver-app/app/platform-presence.tsx:16-18` 直接 import 共用的 `PlatformStatusCard` 與 `PlatformStatusAction`，已不再 inline 自己的 card 結構。
  - `apps/driver-app/components/platform-binding.tsx:17-19,185-191` 也消費相同的 `PlatformStatusCard`，移除原本各自重做的 card 邏輯。
  - `apps/driver-app/components/platform-status-card.tsx:121-247` 是唯一的 canonical card，包含 status dot、token 到期 urgency、reauth banner、icon-only action。
  - `apps/driver-app/components/platform-status-card.tsx:159-188` 上的 action 採 icon-only `TouchableOpacity` + `Ionicons` + `accessibilityRole="button"` + `accessibilityLabel={action.label}`，與 design plan 的 icon button 要求一致。
  - 中文 runtime copy 已套到 status (`已上線` / `未上線`)、eligibility (`可接單` / `審核中` / `不可用`)、token 到期 (`未設定到期時間` / `已到期` / `剩餘 N 分鐘…`)、reauth banner (`平台憑證需要重新驗證`) 與 platform binding 的 alert/標題；以 `grep -n "english\|English\|emoji\|🟢\|🔴\|⏳\|✅"` 掃描三個檔案目前無命中。
  - `apps/driver-app/components/platform-binding.tsx:12-37,77-89` 已經以 `@drts/contracts` 的 `PLATFORM_CODES` / `PlatformCode` 做型別 narrowing，避免任意字串混入。
  - `apps/driver-app/app/platform-presence.tsx:36-42,124-133` 使用 `isDriverIdentityProvisioned()` guard，未 provisioned 時提早 return loading + unprovisioned 視覺；對應 acceptance 的 unprovisioned 必備態。
  - `apps/driver-app/app/settings.tsx:18,363` 仍以 `<PlatformBinding />` 重用同一個 platform account 元件，沒有再保留 settings-local 的英文 binding。

結論: parent 工作樹已併入 `b7e14a4`，三個 parent artifact 完成 task-scoped commit 並以 non-force push 推到 `origin/codex/dev-deploy-backend-android`，machine truth 已記入 `commit_hash` / `push_*` 欄位；reviewer (`Codex`) 已在 parent review 確認 `pnpm --filter @drts/driver-app typecheck` 通過、emoji 已移除、`PlatformStatusCard` 已共用。parent task 已 `done`，本 sidecar 不在這個 closeout 之後新增 acceptance condition，也不替 parent 改寫已經寫入 machine truth 的 closeout 欄位。

---

## 3) Parent Acceptance Framing

以下 checklist 只把 machine truth 與 execution packet 展開成 reviewer-facing framing，不新增新的 canonical truth。

### AC-1 — One canonical platform status component remains in use

- [x] `apps/driver-app/components/platform-status-card.tsx` 是唯一保留的 platform status/account card 實作，未在 repo 內找到第二份 card。
- [x] `apps/driver-app/app/platform-presence.tsx` 與 `apps/driver-app/components/platform-binding.tsx` 都改成 `import { PlatformStatusCard } from "@/components/platform-status-card"`，沒有再各自重畫 card chrome。
- [ ] reviewer 應確認 final diff 沒有以複製貼上方式在 `platform-presence` 或 `settings` 等地方重新引入第二份 card style。
- [ ] reviewer 不應只接受「同名 component」結論; 還要確認介面 (props) 真的能讓 presence 與 binding 共用，例如 `PlatformStatusAction[]` 涵蓋 reauth / online toggle / unbind 三種情境。

### AC-2 — No emoji action; reauth uses an icon button with accessibility label

- [x] `platform-status-card.tsx:159-188` 的 action 區塊使用 `TouchableOpacity` + `Ionicons` (`refresh` / `power` / `play` / `unlink`)，並設定 `accessibilityRole="button"` 與 `accessibilityLabel={action.label}`。
- [x] `grep` 三個 artifact 沒有 `🟢` `🔴` `⏳` `✅` 等 emoji 動作字元。
- [ ] reviewer 應確認 `Ionicons` 名稱屬於 `@expo/vector-icons` glyph map，且尺寸 (`size={18}`) 與 tone styles 與 design plan 的 icon button 期望一致。
- [ ] reviewer 不應接受以 `<Text>🔄</Text>` 或 emoji 文字按鈕 fallback 重新進入 closeout。

### AC-3 — No English runtime copy across the touched surface

- [x] `platform-status-card.tsx` 的 status / eligibility / token expiry / banner 文案已全面繁體中文化。
- [x] `platform-binding.tsx` 的 sectionTitle、placeholder、alert、按鈕文字 (`新增平台綁定` / `送出驗證` / `完成綁定` / `處理中…`) 都是繁體中文。
- [x] `platform-presence.tsx` 的 title/subtitle/empty/loading/error 文案使用繁體中文 (例: `平台上線狀態`、`載入平台狀態中…`、`尚未連接任何平台。`)。
- [ ] reviewer 應重新掃描以避免遺漏: `grep -nE "[A-Za-z]{4,}" apps/driver-app/app/platform-presence.tsx apps/driver-app/components/platform-binding.tsx apps/driver-app/components/platform-status-card.tsx` 中允許保留的英文應限於 platform code (`grab`, `gojek`)、ISO/ID 字串、accessibility label 之屬性 key 與 import 名稱。
- [ ] reviewer 不應接受任何新的英文使用者可見字串 (toast/alert/title/button)。

### AC-4 — Settings reuses the same platform account component without English copy

- [x] `apps/driver-app/app/settings.tsx:18,363` 已 `import { PlatformBinding } from "@/components/platform-binding"` 並在 settings render 中使用 `<PlatformBinding />`，沒有再寫一份 settings-local 的英文 binding。
- [ ] reviewer 應確認 settings closeout 時仍維持 `<PlatformBinding />` 的引用 (此 sidecar 不修改 settings.tsx)。
- [ ] reviewer 不應在 final diff 接受 settings 內 platform 區塊回退到 inline 英文 form。

### AC-5 — `pnpm --filter @drts/driver-app typecheck` passes against the touched files

- [x] parent reviewer (`Codex`) 已在 `DRV-MAT-007.review_notes_zh` 紀錄 `驗證：pnpm --filter @drts/driver-app typecheck 通過`，作為 review-time evidence。
- [x] parent owner (`Codex2`) 已將 platform 三檔併入 task-scoped commit `b7e14a4 DRV-MAT-007 unify driver platform status UX`，並以 non-force push 推到 `origin/codex/dev-deploy-backend-android`；`ai-status.json` 已寫入對應 `commit_hash` / `commit_subject` / `push_*` 欄位。
- [ ] 後續若有人再開 follow-up task 修改同三個檔案，應檢查 import path 與 `@drts/contracts` 型別匹配 (`PlatformPresenceRecord`, `PlatformPresenceSummary`, `PlatformCode`, `PLATFORM_CODES`)，特別注意 `PlatformStatusAction.icon` 是否仍屬於 `Ionicons.glyphMap`。
- [ ] 此 sidecar 不為 typecheck 結果背書; 任何想重新驗證的 lane 應以 parent task evidence 為準，不應透過 sidecar 增刪該 evidence。

---

## 4) Dependency Map

### 4.1 Formal Machine Dependency

| Dep           | Source                   | Status | Why It Matters                                                                                                                                                                                                                                                                       |
| ------------- | ------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DRV-MAT-001` | `DRV-MAT-007.depends_on` | `done` | Shared UI tokens (`@/components/ui/tokens`) 已存在，DRV-MAT-007 透過 `Tokens.colors.*` / `Tokens.spacing.*` / `Tokens.radius.*` 維持 productized 視覺，但 `PlatformStatusCard` 目前仍直接使用 `TouchableOpacity` 包 `Ionicons`，未強制 round-trip 到 `IconButton` / `ActionButton`。 |

### 4.2 Practical Review Dependencies

| Dep   | Anchor                                                                                                       | Why It Matters                                                                                                                                           |
| ----- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-P-1 | `docs/03-runbooks/driver-app-productization-execution-packet-20260504.md:213-235`                            | Parent acceptance, write scope, verification source.                                                                                                     |
| D-P-2 | `docs/02-architecture/driver-app-productization-design-plan-20260504.md:223-244,326,371`                     | `/platform-presence` design posture，duplicate-card 處置策略，icon button rule。                                                                         |
| D-P-3 | `apps/driver-app/app/platform-presence.tsx`                                                                  | Current implementation baseline for presence list, unprovisioned guard, refresh control。                                                                |
| D-P-4 | `apps/driver-app/components/platform-status-card.tsx`                                                        | The single canonical card; key surface for action icon + accessibility + token urgency。                                                                 |
| D-P-5 | `apps/driver-app/components/platform-binding.tsx`                                                            | Bind/unbind/reauth UX; primary consumer of the canonical card alongside `/platform-presence`。                                                           |
| D-P-6 | `apps/driver-app/lib/api-client.ts:369-490`                                                                  | `getDriverClient`, `isDriverIdentityProvisioned`, `getDriverId` runtime helpers used by presence/binding effects。                                       |
| D-P-7 | `packages/contracts` (`PLATFORM_CODES`, `PlatformCode`, `PlatformPresenceRecord`, `PlatformPresenceSummary`) | Canonical typing for platform identifiers and presence schema; must remain authoritative.                                                                |
| D-P-8 | `apps/driver-app/components/ui/*` from `DRV-MAT-001`                                                         | Shared design tokens and primitives; reviewer should check whether `IconButton` / `ActionButton` should later replace local action buttons in the card。 |

### 4.3 Informative Consumer Map

| Consumer                | Status     | Why It Matters                                                                                                                                                           |
| ----------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DRV-MAT-009`           | downstream | Settings materialization explicitly depends on `DRV-MAT-001` + `DRV-MAT-007`; expects to keep using `<PlatformBinding />` inside settings without re-doing English copy. |
| `DRV-MAT-010`           | backlog    | Driver-app verification pack will inherit final platform presence/binding acceptance evidence now that DRV-MAT-007 is `done`。                                           |
| parent reviewer `Codex` | done       | Already approved `DRV-MAT-007` and recorded the four `review_notes_zh` confirmations; closeout evidence already in `ai-status.json`.                                     |
| parent owner `Codex2`   | done       | Already produced commit `b7e14a4` and non-force push to `origin/codex/dev-deploy-backend-android`; no further action requested by this sidecar lane。                    |

---

## 5) Evidence Inventory

| ID   | Evidence                                      | Location                                                                                                                                              |
| ---- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-1  | Parent task machine state                     | `ai-status.json` entry for `DRV-MAT-007`                                                                                                              |
| E-2  | Sidecar task machine state                    | `ai-status.json` entry for `DRV-MAT-007-SIDECAR-ACCEPTANCE`                                                                                           |
| E-3  | Parent execution instructions                 | `docs/03-runbooks/driver-app-productization-execution-packet-20260504.md:213-235`                                                                     |
| E-4  | Product design acceptance posture             | `docs/02-architecture/driver-app-productization-design-plan-20260504.md:223-244,326,371`                                                              |
| E-5  | Current `/platform-presence` implementation   | `apps/driver-app/app/platform-presence.tsx`                                                                                                           |
| E-6  | Canonical platform status card                | `apps/driver-app/components/platform-status-card.tsx`                                                                                                 |
| E-7  | Platform binding component                    | `apps/driver-app/components/platform-binding.tsx`                                                                                                     |
| E-8  | Driver runtime helpers                        | `apps/driver-app/lib/api-client.ts:369-490`                                                                                                           |
| E-9  | Settings consumer of platform binding         | `apps/driver-app/app/settings.tsx:18,363`                                                                                                             |
| E-10 | Shared design tokens (DRV-MAT-001 dependency) | `apps/driver-app/components/ui/tokens.ts`                                                                                                             |
| E-11 | Contracts package platform schema             | `packages/contracts` exports referenced via `@drts/contracts` (`PLATFORM_CODES`, `PlatformCode`, `PlatformPresenceRecord`, `PlatformPresenceSummary`) |

---

## 6) Reviewer Hotspots (`Codex2` for Sidecar; Parent already `done` under owner `Codex2` / reviewer `Codex`)

Reviewer 應優先確認:

1. packet 是否忠實描述 machine truth: parent `DRV-MAT-007` 現在是 `done`，owner=`Codex2`，reviewer=`Codex`，`last_update=2026-05-05T02:04:06Z`，commit `b7e14a4` 已 push 到 `origin/codex/dev-deploy-backend-android`；packet 標頭、Section 1 與 Section 2 都已對齊此狀態，並把更早的 `review` (Codex2/Codex) 與 `review_approved` (Codex/Codex2) 快照明確標為 historical。
2. packet 是否正確處理 closeout 已完成的事實: 不再把 commit + push 列為「仍欠」的責任；AC-5 與 Section 9 都改成記錄已寫入 `ai-status.json` 的 `commit_hash` / `push_*` 欄位，而不是要求 parent owner 再做一次。
3. packet 是否避免在 sidecar 內補簽 parent 已 `done` 的結論: 不在 Section 3 把任何 AC 改成由 sidecar 直接「證明」，仍以 reviewer-facing checklist + working-tree 觀察為主。
4. packet 是否把 `<PlatformBinding />` 的 settings 重用視為既有事實，而不是新增 canonical truth。
5. packet 是否把 `DRV-MAT-001` shared tokens、`DRV-MAT-009` settings consumer、`DRV-MAT-010` verification pack 標成 dependency / consumer，而不越權修改它們。
6. packet 是否避免將 `IconButton` / `ActionButton` 的「未來重構建議」誤寫成必要 acceptance condition; 目前 acceptance 只要求 icon button + accessibility label，而不是強制走 shared `IconButton` 元件。
7. packet 是否避免在 sidecar 內為 parent reviewer 已記錄的 `review_notes_zh` 重簽或重新背書; AC-5 只引用這條註記，不替代或重做 typecheck。
8. packet 是否避免「以 sidecar 改寫 parent closeout」的越權: parent 的 `commit_hash` / `commit_subject` / `commit_agent` / `commit_reviewer` / `push_*` 欄位由 parent owner 寫入，sidecar 只引用，不改寫，也不在 sidecar 文檔中宣稱已替 parent 重新驗證 commit 內容。

---

## 7) Sidecar Acceptance Checklist

### AC-S1 — `Create support artifacts only`

- [x] 只新增 `support/sidecars/DRV-MAT-007/DRV-MAT-007-SIDECAR-ACCEPTANCE.md`
- [x] 內容限於 acceptance framing、dependency map、baseline、reviewer guidance
- [x] 未聲稱已替 parent 完成 `/platform-presence` 或 platform binding 的實作或 closeout

### AC-S2 — `Do not edit canonical truth`

- [x] 未修改 L1 product truth、主線 runtime/registry/governance 檔案
- [x] machine truth 只透過 `scripts/ai-status.sh` / `scripts/ai_status.py` 更新 sidecar 狀態
- [x] packet 只引用 shared truth 與 repo baseline

### AC-S3 — `Hand off the packet to the assigned reviewer`

- [ ] 完成 sidecar 自檢後，以 `handoff` 送交 reviewer `Codex2`
- [ ] reviewer 可依 packet 內容決定 `approve` 或 `reopen`

---

## 8) Handoff Command

Owner (`Claude`) -> Reviewer (`Codex2`)

```bash
AI_NAME=Claude scripts/ai-status.sh handoff DRV-MAT-007-SIDECAR-ACCEPTANCE Codex2 "Re-baselined support-only DRV-MAT-007 acceptance packet at support/sidecars/DRV-MAT-007/DRV-MAT-007-SIDECAR-ACCEPTANCE.md against current ai-status.json: parent DRV-MAT-007 is now done with owner=Codex2 and reviewer=Codex (last_update 2026-05-05T02:04:06Z), commit b7e14a4 ('DRV-MAT-007 unify driver platform status UX') pushed non-force to origin/codex/dev-deploy-backend-android; commit_hash/commit_subject/commit_agent/commit_reviewer/push_* fields already recorded in machine truth. Header, Section 1-2 baseline, AC-5 evidence note, dependency consumer map, and Section 9 parent-owner notes have all been refreshed to drop the earlier review_approved framing; prior review (Codex2/Codex) and review_approved (Codex/Codex2) snapshots are preserved only as historical context. AC-1..AC-4 still align with the post-commit working tree (single canonical PlatformStatusCard reused by /platform-presence, PlatformBinding, and settings; Ionicons icon buttons with accessibilityRole/accessibilityLabel; Traditional Chinese runtime copy; no emoji actions). AC-5 references the parent reviewer's existing review_notes_zh entry confirming pnpm --filter @drts/driver-app typecheck passes; sidecar does not re-sign or replace that evidence and does not rewrite parent closeout fields. No canonical truth was edited."
```

---

## 9) Notes For Parent Owner (`Codex2`) — Post-`done` Reference

Parent `DRV-MAT-007` 已 `done`，commit `b7e14a4` 已 push 到 `origin/codex/dev-deploy-backend-android`，下列只是 follow-up reference，**非新增 acceptance condition**:

1. `ai-status.json` 已寫入 closeout 欄位 (`commit_hash`, `commit_subject`, `commit_agent`, `commit_reviewer`, `push_remote`, `push_branch`, `push_ref`, `push_commit`, `push_recorded_at`)；任何後續查驗 closeout 完整性，以這些欄位 + `git log --oneline b7e14a4` 為準，不需要在 sidecar 內補簽或重貼。
2. 若未來 follow-up task 重新觸動 `apps/driver-app/app/platform-presence.tsx`、`apps/driver-app/components/platform-binding.tsx`、`apps/driver-app/components/platform-status-card.tsx`，請在 commit 前重跑 `pnpm --filter @drts/driver-app typecheck`，避免讓 reviewer 已記錄的 `驗證：pnpm --filter @drts/driver-app typecheck 通過` 變成過期 evidence；此檢查屬於 follow-up task，不是回填 DRV-MAT-007 的條件。
3. `PlatformStatusAction.icon` 直接吃 `Ionicons.glyphMap`，未來若 wave 升級到 shared `IconButton`，仍應維持 accessibility label 與 tone styling，避免破壞 AC-2。
4. `<PlatformBinding />` 已被 `/settings` 引用，這代表 `DRV-MAT-009` 的 settings worker 不應在 settings 內再 inline 重做 platform UI; 該約束來自 design plan 的「Settings can reuse the same platform account component」，而非本 sidecar 新增的 canonical truth。
5. 如果未來有人想動 `@drts/contracts` 的 platform 型別 (`PLATFORM_CODES`, `PlatformCode`, `PlatformPresenceRecord`, `PlatformPresenceSummary`)，請改走獨立 contract task; 此 sidecar 不為 contracts 變更背書，也不替 parent task 在 `done` 之後再行修改。
