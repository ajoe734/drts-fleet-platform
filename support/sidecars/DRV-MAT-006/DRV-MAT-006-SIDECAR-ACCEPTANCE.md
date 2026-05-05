# DRV-MAT-006 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `DRV-MAT-006` — Driver shift and attendance materialization  
**Sidecar Owner:** `Codex2`  
**Assigned Reviewer:** `Gemini2`  
**Parent Owner / Reviewer At Snapshot:** `Gemini2` / `Codex`  
**Generated:** `2026-05-05` (UTC)  
**Snapshot Status:** Parent `DRV-MAT-006` is `in_progress`; sidecar prepared for reviewer handoff

---

## 1) Scope Boundary

本 sidecar 只整理 `DRV-MAT-006` 的 acceptance framing、dependency map、repo baseline、reviewer hotspot 與 handoff wording，不修改 canonical truth，也不替 parent 任務直接完成 `/shift` 主線實作。

- In scope: support-only acceptance checklist、current repo baseline、gap framing、verification expectations、reviewer guidance。
- Out of scope: 修改 `apps/driver-app/app/shift.tsx`、變更 driver identity contract、改寫 L1/L2 product truth、直接替 parent task closeout。

---

## 2) Current State Baseline

以 `ai-status.json`、設計/執行文件、目前 repo 掃描與 parent 任務工作樹快照為準：

- 父任務 `DRV-MAT-006` 在 machine truth 中為 `in_progress`，Owner=`Gemini2`，Reviewer=`Codex`。
- 父任務 formal acceptance 只有四條：
  - `no driver-demo-001`
  - `unprovisioned state guarded`
  - `odometer validation exists`
  - `typecheck passes`
- `docs/03-runbooks/driver-app-productization-execution-packet-20260504.md` 另外明講 reviewer 應檢查：
  - `/shift` 使用 provisioned driver identity 或 guarded unprovisioned state
  - clock in/out 改成 shared action buttons
  - active/offline layout 穩定
  - targeted verification 至少含 `typecheck` 與 `driver-identity-bootstrap` test
- `apps/driver-app/app/shift.tsx` 目前已不再出現 `driver-demo-001`，clock in/out 改以 `user.id` 傳入，且在 clock in/out 前有 odometer numeric validation。
- 但目前 `/shift` 仍未完成 productization closeout：
  - `shift.tsx:14` 引用 `@/contexts/AuthContext`，repo 內找不到對應檔案，代表 current worktree 仍在未完成狀態。
  - `shift.tsx:17,49,69,96` 直接假設 `user.id` 可用，尚未對 unprovisioned / missing identity 做明確 guard。
  - `shift.tsx:138` 仍使用 emoji `🟢 執勤中`，與 design plan 要求的 shared status/icon posture 不一致。
  - `shift.tsx:177-194` 仍以 `Text` 當 button，而非 shared `ActionButton` / `BottomActionBar`。
  - `shift.tsx:148-173` 仍用 local `TextInput` / styles，尚未吃進 `FormField`。
- `git status` 顯示 `apps/driver-app/app/shift.tsx` 已被 parent owner 修改但尚未提交；本 packet 只凍結目前審查基線，不對該 worktree 直接動手。

結論：parent 已部分完成 correctness work，但 acceptance 仍未滿足，尤其是 unprovisioned guard 與 shared UI integration。

---

## 3) Parent Acceptance Framing

以下 checklist 只把 machine truth 與 execution packet 展開成 reviewer-facing framing，不新增新的 canonical truth。

### AC-1 — No demo driver identity remains in the touched runtime surface

- [x] `apps/driver-app/app/shift.tsx` 目前掃描未發現 `driver-demo-001`。
- [ ] reviewer 仍應確認 final diff 沒有從其他 helper import 或 fallback path 間接重新帶回 demo identity。
- [ ] reviewer 不應只接受字串移除；還要確認 runtime driver identity 來源與 `apps/driver-app/lib/api-client.ts:getDriverId()` / provisioning posture一致。

### AC-2 — Unprovisioned state must be explicitly guarded

- [ ] final `/shift` 應在 driver identity 未 provisioned 時顯示安全的 blocked/degraded state，不能直接假設 `user.id` 存在。
- [ ] reviewer 應確認 route 不會因 `getDriverClient()` 或 `user.id` 缺失而在 render / effect / submit path 直接 throw。
- [ ] reviewer 不應接受只有 try/catch API error，但沒有畫面層 guard 或 routing guard 的實作。

### AC-3 — Odometer validation must block invalid numeric input before submit

- [x] `shift.tsx:63-66` 與 `90-93` 已有 `isNaN(Number(odometer))` gate。
- [ ] reviewer 應確認 final UI 將 validation message 與 submit disabled/loading posture 正常反映在 shared form/action primitives 上。

### AC-4 — Shift actions and state layout should match productized shared UI posture

- [ ] active/offline states 應使用 shared components，例如 `PageHeader`、`StatusChip`、`FormField`、`ActionButton`、`BottomActionBar`。
- [ ] reviewer 不應接受維持 emoji status、`Text`-as-button、或大段 page-local styling 的 final closeout。
- [ ] `/shift` 應保留 clear loading / feature-disabled / offline / active / submitting / error states。

### AC-5 — Verification must include typecheck and the driver identity bootstrap guardrail

- [ ] parent owner 應回報：
  - `pnpm --filter @drts/driver-app typecheck`
  - `pnpm --filter @drts/driver-app test -- --run tests/unit/driver-identity-bootstrap.test.ts`
- [ ] reviewer 不應只接受靜態 code scan；至少要看到上述 command evidence 或明確 blocker。

---

## 4) Dependency Map

### 4.1 Formal Machine Dependency

| Dep           | Source                   | Status | Why It Matters                                                                                                                                                                     |
| ------------- | ------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DRV-MAT-001` | `DRV-MAT-006.depends_on` | `done` | Shared UI primitives (`ActionButton`, `FormField`, `StatusChip`, `BottomActionBar`, `PageHeader`) 已存在，`DRV-MAT-006` 應直接 consume，而不是再做 page-local button/form chrome。 |

### 4.2 Practical Review Dependencies

| Dep   | Anchor                                                                                      | Why It Matters                                                                                            |
| ----- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| D-P-1 | `docs/03-runbooks/driver-app-productization-execution-packet-20260504.md:192-208`           | Parent acceptance, verification, and write-scope source.                                                  |
| D-P-2 | `docs/02-architecture/driver-app-productization-design-plan-20260504.md:19,285,325,362,372` | `/shift` design posture, no-demo-ID rule, shared UI expectation, safety rule.                             |
| D-P-3 | `apps/driver-app/app/shift.tsx`                                                             | Current implementation baseline and open gaps.                                                            |
| D-P-4 | `apps/driver-app/lib/api-client.ts:369-490`                                                 | Canonical runtime helpers for provisioned identity detection and `getDriverId()` fallback/error behavior. |
| D-P-5 | `apps/driver-app/lib/driver-identity-bootstrap.ts`                                          | Existing app-level identity guard pattern that routes invalid/unprovisioned sessions back to onboarding.  |
| D-P-6 | `apps/driver-app/tests/unit/driver-identity-bootstrap.test.ts`                              | Targeted verification already exists for identity-guard semantics.                                        |
| D-P-7 | `apps/driver-app/components/ui/*` from `DRV-MAT-001`                                        | Parent task is expected to reuse landed shared primitives instead of custom controls.                     |

### 4.3 Informative Consumer Map

| Consumer                | Status          | Why It Matters                                                                                        |
| ----------------------- | --------------- | ----------------------------------------------------------------------------------------------------- |
| `DRV-MAT-010`           | backlog         | Driver-app verification pack should inherit final `/shift` acceptance evidence once this task closes. |
| parent reviewer `Codex` | active reviewer | Needs a crisp gap map so review does not stop at “demo ID removed” while missing guardrails.          |
| parent owner `Gemini2`  | in progress     | Can use this packet as a support-only checklist and evidence frame while finishing `shift.tsx`.       |

---

## 5) Evidence Inventory

| ID  | Evidence                                   | Location                                                                                                                     |
| --- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| E-1 | Parent task machine state                  | `ai-status.json` entry for `DRV-MAT-006`                                                                                     |
| E-2 | Sidecar task machine state                 | `ai-status.json` entry for `DRV-MAT-006-SIDECAR-ACCEPTANCE`                                                                  |
| E-3 | Parent execution instructions              | `docs/03-runbooks/driver-app-productization-execution-packet-20260504.md:192-208`                                            |
| E-4 | Product design acceptance posture          | `docs/02-architecture/driver-app-productization-design-plan-20260504.md:280-326`                                             |
| E-5 | Current `/shift` implementation snapshot   | `apps/driver-app/app/shift.tsx`                                                                                              |
| E-6 | Provisioned/unprovisioned identity helpers | `apps/driver-app/lib/api-client.ts:369-490`                                                                                  |
| E-7 | Existing identity bootstrap guard behavior | `apps/driver-app/lib/driver-identity-bootstrap.ts`                                                                           |
| E-8 | Existing targeted identity tests           | `apps/driver-app/tests/unit/driver-identity-bootstrap.test.ts`                                                               |
| E-9 | Shared UI primitives landed by dependency  | `apps/driver-app/components/ui/ActionButton.tsx`, `FormField.tsx`, `StatusChip.tsx`, `BottomActionBar.tsx`, `PageHeader.tsx` |

---

## 6) Reviewer Hotspots (`Gemini2` for Sidecar, `Codex` for Parent)

Reviewer 應優先確認：

1. packet 是否忠實描述 machine truth：parent `DRV-MAT-006` 仍在 `in_progress`，這不是 final implementation claim。
2. packet 是否正確區分「已去掉 demo ID」與「尚未完成 unprovisioned guard / shared UI materialization」。
3. packet 是否明確指出 `shift.tsx` 目前存在找不到的 `@/contexts/AuthContext` import，表示 worktree snapshot 仍未收斂。
4. packet 是否把 `driver-identity-bootstrap` test 視為既有 guardrail，而不是另造新測試真相。
5. packet 是否把 `DRV-MAT-001` shared primitives 和 `DRV-MAT-010` verification pack標成 dependency/consumer，而不越權修改它們。

---

## 7) Sidecar Acceptance Checklist

### AC-S1 — `Create support artifacts only`

- [x] 只新增 `support/sidecars/DRV-MAT-006/DRV-MAT-006-SIDECAR-ACCEPTANCE.md`
- [x] 內容限於 acceptance framing、dependency map、baseline、reviewer guidance
- [x] 未聲稱已替 parent 完成 `/shift` 實作

### AC-S2 — `Do not edit canonical truth`

- [x] 未修改 L1 product truth、主線 runtime/registry/governance 檔案
- [x] machine truth 只透過 `scripts/ai-status.sh` / `scripts/ai_status.py` 更新 sidecar 狀態
- [x] packet 只引用 shared truth 與 repo baseline

### AC-S3 — `Hand off the packet to the assigned reviewer`

- [ ] 完成 sidecar 自檢後，以 `handoff` 送交 reviewer `Gemini2`
- [ ] reviewer 可依 packet 內容決定 `approve` 或 `reopen`

---

## 8) Handoff Command

Owner (`Codex2`) -> Reviewer (`Gemini2`)

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py handoff DRV-MAT-006-SIDECAR-ACCEPTANCE Gemini2 "Prepared support-only DRV-MAT-006 acceptance packet in support/sidecars/DRV-MAT-006/DRV-MAT-006-SIDECAR-ACCEPTANCE.md. Packet freezes the current /shift baseline: demo driver ID appears removed and odometer validation exists, but unprovisioned identity guard, shared action/form primitives, and final verification evidence are still reviewer hotspots. No canonical truth was edited."
```

---

## 9) Notes For Parent Owner

1. 目前最容易被誤判為完成的是「`driver-demo-001` 不見了」，但真正 blocker 是 identity guard 與 shared UI posture 尚未到位。
2. `getDriverId()` / `isDriverIdentityProvisioned()` 與 `driver-identity-bootstrap` 已經提供 canonical runtime posture；`shift.tsx` 不應再自造一套弱化版本。
3. 如果 parent 最終仍保留 `useAuth` 路徑，請先解掉 import/ownership 問題，否則 `typecheck passes` 很可能無法成立。
