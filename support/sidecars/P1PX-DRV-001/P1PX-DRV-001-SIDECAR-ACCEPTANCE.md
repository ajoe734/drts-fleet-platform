# P1PX-DRV-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `P1PX-DRV-001` — driver app production identity and device binding
**Current Sidecar Owner:** `Codex`
**Assigned Reviewer:** `Codex2`
**Parent Owner / Reviewer At Snapshot:** `Claude` / `Codex`
**Last Revised:** `2026-04-28T14:55:24Z (UTC)`
**Final Status:** `done` — shared L0 records sidecar `P1PX-DRV-001-SIDECAR-ACCEPTANCE` at owner=`Codex`, reviewer=`Codex2`, no-commit closeout, and `next="Completed the support-only acceptance packet for P1PX-DRV-001 after review approval. The packet freezes the current driver-app identity/device-binding acceptance framing and dependency map without altering canonical/runtime truth."`

---

## 1) Scope Boundary

本 sidecar 只整理 `P1PX-DRV-001` 的 acceptance framing、dependency map、repo baseline、reviewer guardrails 與 handoff wording，不修改 canonical truth，也不代替 parent 任務直接實作 driver identity / device binding 主線。

- In scope: support-only acceptance checklist、current repo baseline、gap framing、verification/evidence expectations、reviewer hotspots、formal/informative dependencies。
- Out of scope: 修改 `apps/driver-app/*` 主線實作、改寫 backend identity/device contract、變更 L1 product truth、直接 closeout `P1PX-DRV-001`、或順手把 `P1PX-DRV-002` 的 EAS evidence 併做。

---

## 2) Current State Baseline (Machine Truth + Repo Scan)

以 `ai-status.json`、task brief、execution packet、目前 repo 掃描與 shared truth 為準：

- 父任務 `P1PX-DRV-001` 後續已在 machine truth 中收尾為 `done`，本 packet 保留當時的 acceptance framing；artifact scope 固定為：
  - `apps/driver-app/app.json`
  - `apps/driver-app/eas.json`
  - `apps/driver-app/lib/api-client.ts`
  - `apps/driver-app/app/onboarding.tsx`
  - `apps/driver-app/app/settings.tsx`
  - `apps/driver-app/app/platform-presence.tsx`
  - `apps/driver-app/README.md`
  - `docs/03-runbooks/driver-app-native-dev-runbook.md`
- `P1PX-DRV-001.acceptance` 在 machine truth 中只有兩條 verification commands：
  - `pnpm --filter @drts/driver-app typecheck`
  - `pnpm --filter @drts/driver-app test`
- parent 最終 closeout 由主線 worker/ reviewer 完成；本 sidecar 不取代 parent delivery。
- 本 sidecar `P1PX-DRV-001-SIDECAR-ACCEPTANCE` 已完成 no-commit closeout，formal acceptance 只有：
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`

### Shared-Truth Routing Snapshot

- `2026-04-28T14:36:01Z` sidecar auto-created，最初 owner=`Copilot`，reviewer=`Codex2`。
- `2026-04-28T14:36:39Z` 因 Copilot quota/terminal failure，自動改派 owner 至 `Codex`。
- `2026-04-28T14:43:20Z` availability-first reassignment 把 owner 改為 `Codex2`，reviewer 改為 `Codex`。
- `2026-04-28T14:48:18Z` 到 `14:48:29Z` 間 shared truth 又短暫在 `Codex` / `Codex2` 間 rebalanced，最後收斂回 owner=`Codex2`、reviewer=`Codex`。
- `2026-04-28T14:50:02Z` owner 已正式以 `start` 將本 sidecar 推進到 `in_progress`。
- `2026-04-28T14:51:50Z` owner 已正式 handoff 給 reviewer `Codex`，machine truth 進入 `review`。
- `2026-04-28T14:53:50Z` reviewer 已完成 approval；shared truth 目前停在 `review_approved`，等待 owner `Codex` 正式 closeout 成 `done`。

這份 packet 保留當時真實狀態與 review framing；後續 parent `P1PX-DRV-001` 已由 owner/reviewer 流程推進並收尾為 `done`。本 sidecar 只作為 support artifact，不自行宣稱或取代 parent delivery。

### Repo Baseline Anchors

- `apps/driver-app/lib/api-client.ts:17-25` 仍把 direct staging API host 與 `driver-demo-001` 當成 silent fallback default。
- `apps/driver-app/app.json:51-54` 仍把 `apiBaseUrl` 與 `driverActorId=driver-demo-001` 打包進 Expo `extra`。
- `apps/driver-app/eas.json:13-15,29-32` 在 `development` 與 `preview` profile 仍直接注入 `EXPO_PUBLIC_DRIVER_ID=driver-demo-001`。
- `apps/driver-app/app/onboarding.tsx:47-89` 現況只有 smoke-check success path 與 placeholder fallback；degraded path 仍是英文 placeholder，且 fallback 直接導向 `/jobs`，不是明確 provisioning-safe gate。
- `apps/driver-app/README.md:34-36` 與 `docs/03-runbooks/driver-app-native-dev-runbook.md:8-18,66-81` 已明講 driver app 要走 direct app-auth path、不要走 IAP，但 runbook baseline 仍把 `driver-demo-001` 當 default actor id。
- `docs/03-runbooks/phase1-productization-execution-packet-20260428.md:286-302` 明確要求：
  - 移除 demo driver ID 作為 silent production default
  - 明確區分 dev/staging/prod config
  - 補 visible degraded provisioning state
  - 定義 mobile auth/device-binding handoff
  - 保持 direct app-auth path
  - touched copy 要 Traditional Chinese ready

### Gap Summary

| 問題                                                                                                   | 影響                                                                                 | 根本原因                                                              |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `driver-demo-001` 仍存在於 runtime fallback、Expo config、EAS profiles                                 | production build 可能默默綁到 demo actor，而不是 fail-safe 或顯示 provisioning state | parent task 尚未完成 identity/device-binding hardening                |
| onboarding degraded path 仍是 generic placeholder，且可直接前往 `/jobs`                                | 缺乏明確的「未 provisioned 不應進入正式工作台」安全姿態                              | 現況只有 smoke-check shell，沒有 productized provisioning gate        |
| README/runbook 有 direct API path 說明，但沒有清楚拆 dev/internal test/staging/production 身分注入策略 | reviewer 可能把 existing native baseline 誤判成已達成 productization config clarity  | baseline runbook 仍偏開發導向，未完成 release-grade config separation |
| visible copy 多處仍為英文                                                                              | touched driver runtime surface 尚未達成 Traditional Chinese ready guardrail          | parent task 尚未進入 UX/localization closeout                         |

---

## 3) Parent Acceptance Framing

`P1PX-DRV-001` 的 machine-truth acceptance 只有 typecheck/test commands。以下 checklist 只把 execution packet 與 repo baseline 展開成 reviewer-facing acceptance framing，不新增新的產品真相。

### AC-1 — Driver identity must fail safe, not silently bind to demo

- [ ] reviewer 應確認 `driver-demo-001` 不再作為 production-facing silent fallback。
- [ ] 若沒有 provisioned driver identity，app 必須 fail safe 或顯示明確 provisioning/degraded state。
- [ ] reviewer 不應接受僅把 demo ID 從某一層移除，但在 `app.json`、`eas.json`、`lib/api-client.ts` 其他入口仍保留 silent default 的 closeout。

### AC-2 — Provisioning/degraded path must be visible and must gate work safely

- [ ] onboarding 需要清楚區分：
  - API connectivity / feature-flag smoke
  - identity not provisioned
  - identity provisioned but degraded
  - fully ready
- [ ] 未 provisioned 或 device-binding 未完成時，不應把使用者直接送進一般 `/jobs` workspace。
- [ ] reviewer 不應接受只有 placeholder 文案、但沒有 operationally safe routing/gating 的 degraded implementation。

### AC-3 — Direct app-auth path must remain explicit

- [ ] direct API host 路徑必須保留；driver app 不得被改成依賴 internal IAP control-plane host。
- [ ] README/runbook/env examples 應一致說明 app-auth-first posture，避免不同檔案互相矛盾。
- [ ] reviewer 應檢查 config 文檔與 packaged defaults 沒有把 IAP host 誤寫成 driver mobile target。

### AC-4 — Config separation must distinguish dev, internal test, staging, and production

- [ ] runbook 應清楚分開 local dev、internal test/EAS、staging、production 的 identity/API config 來源。
- [ ] `EXPO_PUBLIC_API_URL`、`EXPO_PUBLIC_DRIVER_ID` 或 replacement token/auth strategy 必須在文件與 config 中對齊。
- [ ] reviewer 不應接受只增加一段 env 說明、但實際 EAS/build profiles 仍默默注入 demo actor 的 closeout。

### AC-5 — Existing driver surfaces must remain type-safe after hardening

- [ ] `jobs`、`trip`、`proof`、`earnings`、`platform presence` flows 在 identity hardening 後仍需通過 parent verification：
  - `pnpm --filter @drts/driver-app typecheck`
  - `pnpm --filter @drts/driver-app test`
- [ ] reviewer 應要求 verification 結果回報，而不是只接受 config/doc edits。

### AC-6 — Touched runtime copy should be Traditional Chinese ready

- [ ] 如果 parent 觸及 onboarding / settings / platform-presence 的 visible copy，reviewer 應確認不再維持明顯英文 placeholder/posture 文案。
- [ ] reviewer 不應把 untouched historical English strings 視為此 task 必須全量清空；重點是本次 touched acceptance surface 要對齊 dispatch guardrail。

---

## 4) Dependency Map

### 4.1 Formal Machine Dependencies

| Dep      | Source                                     | Status    | Why It Matters                                                                      |
| -------- | ------------------------------------------ | --------- | ----------------------------------------------------------------------------------- |
| D-UP-1   | `P1PX-DRV-001.depends_on`                  | none      | parent 沒有 formal upstream blockers；它是直接 productization slice                 |
| D-DOWN-1 | `P1PX-DRV-002.depends_on=["P1PX-DRV-001"]` | `backlog` | build evidence slice assumes this task has already hardened identity/config posture |

### 4.2 Practical Review Dependencies

| Dep   | Anchor                                                                        | Why It Matters                                                   |
| ----- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| D-P-1 | `docs/03-runbooks/phase1-productization-execution-packet-20260428.md:264-309` | parent objective, required work, acceptance, verification source |
| D-P-2 | `apps/driver-app/lib/api-client.ts:17-25`                                     | current silent fallback API/driver identity baseline             |
| D-P-3 | `apps/driver-app/app.json:51-54`                                              | packaged Expo extra still carries demo actor                     |
| D-P-4 | `apps/driver-app/eas.json:13-15,29-32`                                        | build profiles still inject demo driver identity                 |
| D-P-5 | `apps/driver-app/app/onboarding.tsx:37-89`                                    | current ready/fallback routing and degraded-state gap            |
| D-P-6 | `apps/driver-app/README.md:17-39`                                             | current native/dev posture wording                               |
| D-P-7 | `docs/03-runbooks/driver-app-native-dev-runbook.md:8-18,66-121`               | current environment/runbook split and verification baseline      |

### 4.3 Informative Consumer Map

| Consumer                | Status          | Why It Matters                                                                                                           |
| ----------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `P1PX-DRV-002`          | backlog         | downstream build evidence should not normalize demo-bound identity defaults                                              |
| parent reviewer `Codex` | active reviewer | needs a crisp gap/acceptance checklist to review Claude's productization delta without drifting into runtime truth edits |
| parent owner `Claude`   | in progress     | can use this packet as support-only framing, but packet itself does not change the parent machine truth                  |

---

## 5) Evidence Inventory

| ID   | Evidence                                                                       | Expected Anchor                                                               |
| ---- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| E-1  | Parent task machine state                                                      | `ai-status.json:6069-6098`                                                    |
| E-2  | Sidecar task machine state                                                     | `ai-status.json:6195-6218`                                                    |
| E-3  | Parent objective / required work / acceptance                                  | `docs/03-runbooks/phase1-productization-execution-packet-20260428.md:264-309` |
| E-4  | Silent default API host + demo driver fallback                                 | `apps/driver-app/lib/api-client.ts:17-25`                                     |
| E-5  | Packaged Expo extra still embeds `driver-demo-001`                             | `apps/driver-app/app.json:51-54`                                              |
| E-6  | EAS development / preview profiles still inject demo identity                  | `apps/driver-app/eas.json:13-15,29-32`                                        |
| E-7  | Onboarding success/fallback split and placeholder degraded path                | `apps/driver-app/app/onboarding.tsx:37-89`                                    |
| E-8  | Direct non-IAP baseline documented in README                                   | `apps/driver-app/README.md:34-39`                                             |
| E-9  | Runbook still lists default demo actor id and only broad env override guidance | `docs/03-runbooks/driver-app-native-dev-runbook.md:11-18,66-81`               |
| E-10 | Downstream build evidence task waits on this hardening                         | `ai-status.json:6100-6130`                                                    |

---

## 6) Reviewer Hotspots (`Codex`)

Reviewer 應優先確認：

1. packet 是否忠實描述 machine truth：sidecar 已完成 no-commit support closeout，parent 的實作完成狀態以主線 task evidence 為準。
2. packet 是否明確指出 repo baseline 仍保留 `driver-demo-001` 於 runtime、Expo config、EAS profiles 三處，而不是只抓到單一 fallback。
3. packet 是否把 onboarding 的核心風險講清楚：目前 degraded path 不是 provisioning-safe gate，而只是 placeholder + direct `/jobs` escape hatch。
4. packet 是否保持 direct app-auth / non-IAP posture，不把 control-plane IAP reopen 成這張 task 的工作。
5. packet 是否把 `P1PX-DRV-002` 正確標為 downstream consumer，而不是把 build evidence 誤包進本 task acceptance。

---

## 7) Sidecar Acceptance Checklist

### AC-S1 — `Create support artifacts only`

- [x] 只新增 `support/sidecars/P1PX-DRV-001/P1PX-DRV-001-SIDECAR-ACCEPTANCE.md`
- [x] 內容限於 acceptance framing、dependency map、repo baseline、reviewer guardrails、handoff guidance
- [x] 未聲稱已替 parent 完成 runtime/productization implementation

### AC-S2 — `Do not edit canonical truth`

- [x] 未修改任何 L1 product truth、主線 runtime/registry/governance 實作
- [x] machine truth 只透過 `scripts/ai_status.py start` 更新 sidecar 狀態
- [x] packet 只引用 shared truth 與 repo baseline，不自行改寫 parent 真相

### AC-S3 — `Hand off the packet to the assigned reviewer`

- [x] owner 完成最後自檢後，以 `handoff` 送交 reviewer `Codex`
- [x] reviewer 已接受，並以 `approve` 推到 `review_approved`
- [x] owner 再以 `NO_COMMIT_REQUIRED=1 ... done` 做 no-commit closeout

---

## 8) Historical Handoff / Closeout Commands

Historical owner handoff to reviewer:

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py handoff P1PX-DRV-001-SIDECAR-ACCEPTANCE Codex "P1PX-DRV-001 acceptance packet is ready in support/sidecars/P1PX-DRV-001/P1PX-DRV-001-SIDECAR-ACCEPTANCE.md. It freezes current machine truth for the driver-app productization slice: parent P1PX-DRV-001 is still in progress, but the packet now anchors the real hardening gaps across api-client/app.json/eas.json/onboarding/runbook, preserves the direct app-auth posture, marks P1PX-DRV-002 as downstream build-evidence consumer only, and keeps this helper strictly support-only without changing canonical/runtime truth."
```

Historical reviewer approval:

```bash
AI_NAME=Codex python3 scripts/ai_status.py approve P1PX-DRV-001-SIDECAR-ACCEPTANCE "P1PX-DRV-001 acceptance packet is aligned with current machine truth, captures the remaining demo-bound identity and degraded-state gaps, and keeps the support slice scoped to reviewer guidance without mutating canonical/runtime truth."
```

Owner no-commit closeout after approval:

```bash
AI_NAME=Codex NO_COMMIT_REQUIRED=1 python3 scripts/ai_status.py done P1PX-DRV-001-SIDECAR-ACCEPTANCE "Completed the support-only acceptance packet for P1PX-DRV-001 after review approval. The packet freezes the current driver-app identity/device-binding acceptance framing and dependency map without altering canonical/runtime truth."
```

---

## 9) Change Log

- `2026-04-28T14:50Z` — 初版建立。依 dispatch brief、`ai-status.json` current machine truth、productization execution packet、driver-app baseline repo scan 與 sidecar guardrails，整理 `P1PX-DRV-001` 的 acceptance framing、dependency map、evidence anchors、reviewer guardrails 與 handoff wording。
- `2026-04-28T15:02Z` — reviewer-side refresh。將 packet header、routing snapshot、reviewer hotspot 與 sidecar checklist 對齊最新 machine truth：sidecar 已由 owner handoff 並進入 `review`，但尚未 `review_approved` / `done`。
- `2026-04-28T14:55:24Z` — sidecar 完成 no-commit closeout；本檔保留為 support-only evidence packet，不再代表 active work。
- `2026-04-28T14:54Z` — closeout refresh。將 packet header、routing snapshot、reviewer hotspot 與 closeout command 對齊最新 machine truth：sidecar 已是 `review_approved`，owner 為 `Codex`、reviewer 為 `Codex2`，只剩正式 `done` 收尾。
