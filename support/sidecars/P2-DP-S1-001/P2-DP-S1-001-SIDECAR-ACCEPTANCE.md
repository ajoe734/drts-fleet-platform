# P2-DP-S1-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `P2-DP-S1-001` — `PassengerDisclosurePolicy + message catalog + acknowledgement (S1=a)`  
**Current Sidecar Owner:** `Codex`  
**Assigned Reviewer:** `Codex2`  
**Parent Owner / Reviewer:** `Codex2` / `Codex`  
**Last Revised:** `2026-06-26T10:20Z (UTC)`  
**Status:** `in_progress` — support packet refreshed after reopen so the parent snapshot matches the latest machine-truth state (`implementation anchored`, `verification blocked`).

---

## 1) Scope Boundary

本 sidecar 只整理 `P2-DP-S1-001` 的 acceptance checklist、dependency map、current-state baseline、以及 reviewer handoff 指引，不修改 canonical truth，也不替 parent task 宣告完成。

- In scope: support-only acceptance framing, dependency mapping, cited evidence anchors, reopen blocker summary, ready-for-review checklist.
- Out of scope: contracts/runtime/migration/controller/service/test 實作修改、machine truth 以外的 parent 狀態更動、或替 parent reviewer 代行最終 acceptance 決定。

---

## 2) Current State Baseline (Machine Truth + Integration Snapshot)

- parent `P2-DP-S1-001` 目前在 machine truth 中是 **`in_progress`**，Owner=`Codex2`，Reviewer=`Codex`；其最新 `next` 已改為：`Implemented server-derived passenger disclosure acknowledgements and ops_console acknowledgement route/channel handling. Targeted Vitest/tsc verification is currently blocked by this worktree environment failing package resolution for vitest/config, @nestjs/*, and @types/node from the pnpm store.`
- formal dependency `P2-DP-C3-001` 已由 merge closeout commit `78e01dcae` (`P2-DP-C3-001: sandbox fulfillment visibility contract closeout (#912)`) 吸收進 `dev`；雖然它已不在 task board `show` 切片中，但 parent summary 仍明確把它列為 `visibility/messageCode` 依賴。
- `2026-06-26T09:59:40Z` 的第一次 `reopen` 指出：`sandbox-dispatch-gate.service.ts` 仍把 compiled baseline catalog merge 到 runtime resolution，使刪除/缺少 persisted catalog rows 時仍能解析 `messageCode`，違反「缺配置 AV fail-closed / persisted catalog 為權威」。
- owner 已用 `origin/codex2/p2-dp-s1-001@607fe7e84` 修掉上面那個 persisted-catalog authority 問題，並在 `2026-06-26T10:03:21Z` handoff 中回報 targeted verification：`sandbox-dispatch-gate.service.test.ts` + `owned-mobility.service.test.ts` 共 `93` tests 通過。
- `2026-06-26T10:09:34Z` 的第二次 `reopen` 指出兩個新 blocker：tenant acknowledgement API 信任 client-supplied `actorType` / `actorRef` / `acknowledgedAt`，以及 `ops_console` disclosure policy 不可達。
- 上述第二輪 blocker 已不再只是 owner worktree 草稿；它們已被 anchor 到 parent branch `origin/codex2/p2-dp-s1-001@4530dc20d` (`wip(P2-DP-S1-001): anchor disclosure acknowledgement hardening`)。該 commit 同時修改 3 個 runtime 檔案與 3 個 task-local unit test 檔案，因此 packet 應把這輪狀態視為 **implemented-but-not-yet-verified**，而不是仍待實作。
- `2026-06-26T10:18:18Z` 的 parent `progress` 明確把目前卡點收斂為驗證環境：`vitest/config`、`@nestjs/*`、`@types/node` 無法自目前 worktree 的 pnpm store 正常解析，導致 targeted Vitest/tsc 尚未補跑完。
- 先前的 support-only review packet `P2-DP-S1-001-SIDECAR-REVIEW` 已於 `ca75a8fd7` 建立並在 `2026-06-26T10:03:28Z` 獲 `review_approved`；它已覆蓋 contracts / migration / fail-closed baseline 的主要 file:line evidence，這份 acceptance packet 不重做 canonical review，只把 acceptance gate 與最新 verification blocker 整理成 reviewer/owner 都能直接執行的清單。

---

## 3) Acceptance Sources

以下 acceptance framing 只取自已記錄的來源，不新增產品語意：

- `docs/02-architecture/phase2_tesla_fsd_sandbox_execution_plan_20260625.md`
  - `P2-DP-S1-001` row：`PassengerDisclosurePolicy + message catalog + acknowledgement（缺配置 AV fail-closed）`
- `docs/02-architecture/phase2_tesla_fsd_sandbox_open_decisions_s1s6_system_design_response_20260626.md`
  - Section 1：S1 採案 `(a)`
  - Section 1.3：acknowledgement modes
  - Section 1.4：`PassengerDisclosurePolicy` contract
  - Section 1.5：`PassengerDisclosureMessageCatalogEntry` contract
  - Section 1.6：baseline message catalog v1 / `legalApproved`
  - Section 1.7：frontend only reads `messageCode`; `requiresAcknowledgement=true` 必建 acknowledgement record
- `docs/02-architecture/phase2_tesla_fsd_sandbox_system_design_decision_packet_c1c6_b1b5_20260625.md`
  - Section 5.3：未配置完整 disclosure policy 時不得派 AV
- machine truth
  - parent task summary / `depends_on`
  - `2026-06-26T09:59:40Z`、`10:03:21Z`、`10:09:34Z`、`10:18:18Z`、`10:18:45Z` 的 activity log 切片

---

## 4) Parent Acceptance Checklist

下表把 parent acceptance 拆成 reviewer 可直接核對的子項。`Packet Status` 只描述這份 packet 看到的當前狀態，不替 parent 宣告通過。

| AC | Requirement | Evidence Anchor | Packet Status |
| --- | --- | --- | --- |
| AC-1 | `PassengerDisclosurePolicy` / `PassengerDisclosureMessageCatalogEntry` / `PassengerAcknowledgementRecord` contracts 與 `V0042` persistence surface 已存在 | approved review packet `ca75a8fd7`; parent impl baseline `33dfddd02` → `eac1fbf3d` | `Committed baseline` |
| AC-2 | `messageCode` 是 passenger-facing 文案唯一權威；缺 policy/catalog 時 `AV passenger assignment = fail_closed` | S1 decision response §1 / §1.6 / §1.7; first reopen @ `2026-06-26T09:59:40Z`; fix `607fe7e84`; `sandbox-dispatch-gate.service.ts` lines `219-225` in `607fe7e84`; regression test `sandbox-dispatch-gate.service.test.ts` around line `1054+` in `607fe7e84` | `Fixed on parent branch; re-review required` |
| AC-3 | `requiresAcknowledgement=true` 時，ack record 必須以 server-derived actor identity / timestamp 建立，不得信任 client-supplied legal actor/timestamp | S1 decision response §1.7; second reopen @ `2026-06-26T10:09:34Z`; `4530dc20d:owned-mobility.service.ts:1098-1218,5186-5223`; `4530dc20d:sandbox-dispatch-gate.service.ts:233-283` | `Implemented in parent anchor commit; targeted verification still blocked` |
| AC-4 | `ops_console` / assisted acknowledgement path 必須可達，channel resolution 與 API route 要對齊，不得只剩 tenant-scoped route | S1 decision response §1.3 / §1.4 / §1.7; second reopen @ `2026-06-26T10:09:34Z`; `4530dc20d:owned-mobility.controller.ts:263-299`; `4530dc20d:owned-mobility.service.ts:1114-1117,1200-1218,5157-5184` | `Implemented in parent anchor commit; targeted verification still blocked` |
| AC-5 | `P2-DP-C3-001` 建立的 visibility/messageCode seam 不得被 S1 修補回歸 | execution plan deps row; dependency closeout `78e01dcae`; approved review packet `ca75a8fd7` cites audience-specific projection and `int-p2-002` coverage | `Dependency satisfied; regression rerun still pending once verification environment is fixed` |
| AC-6 | parent handoff 回 reviewer 前，需提供 task-local verification，且將 repo-wide既有型別噪音與 task-local signal 分開敘述 | owner handoff @ `2026-06-26T10:03:21Z`; parent progress @ `2026-06-26T10:18:18Z`; `4530dc20d` adds task-local tests in `owned-mobility.controller.test.ts`, `owned-mobility.service.test.ts`, `sandbox-dispatch-gate.service.test.ts` | `Currently blocked by worktree package resolution; next handoff must either carry rerun results or explicitly preserve the blocker` |

### Ready-To-Review Gate For Parent

截至 `2026-06-26T10:20Z`，這個 gate **尚未成立**；原因不是第二輪修補還沒寫，而是 parent 自報的 targeted verification 仍被環境阻塞。只有當下列條件全部成立時，parent `P2-DP-S1-001` 才適合再次回到 `review`：

1. `AC-3` / `AC-4` 的第二輪 hardening 仍可由 parent branch 上的 `4530dc20d`（或其後續 closeout commit）追溯，不再退回成未提交或不可引用的狀態。
2. `2026-06-26T10:18:18Z` 所述 package-resolution blocker 已排除，或已被正式升格成外部 blocker；在未處理前，parent 應維持 `in_progress`。
3. owner 在下一次 handoff 訊息中明確區分：哪些是本次修補新增/調整的測試，哪些是 repo 既有、非 task-local 的 `tsc` / typecheck 噪音。
4. 重新執行至少這些 task-local suites：`tests/unit/sandbox-dispatch-gate.service.test.ts`、`tests/unit/owned-mobility.service.test.ts`、`tests/unit/owned-mobility.controller.test.ts`、`tests/integration/int-p2-002-sandbox-dispatch-hook.test.ts`。

---

## 5) Dependency Map

### Formal Upstream Dependencies

| Dependency | Status | Why It Matters |
| --- | --- | --- |
| `P2-DP-C3-001` | `satisfied` | S1 直接承接 C3 的 sandbox fulfillment visibility / `messageCode` seam；execution plan 明確列為唯一 formal dependency。 |

**Evidence:** `78e01dcae` 已將 `P2-DP-C3-001` closeout 併入 `dev`，提交訊息含 4 組相關 verification（`owned-mobility` unit + `int-p2-002` / `int-p2-008`）。

### Practical Review Dependencies

| Dep | Type | Why It Matters |
| --- | --- | --- |
| D-P-1 | Approved review packet `ca75a8fd7` | 已整理 AC-1..AC-8 的 baseline code evidence，避免 acceptance packet 重新審 contracts/migration 一遍。 |
| D-P-2 | Parent fix commit `607fe7e84` | 這是第一次 reopen（persisted catalog authority）已完成的證據；若 reviewer 不先確認這點，就會把第二輪 blocker 與第一輪 blocker 混在一起。 |
| D-P-3 | Parent second-round hardening anchor `4530dc20d` | 第二輪 reopen 的 actor provenance / `ops_console` reachability 修補已形成 branch evidence，可直接引用 controller/service/gate 與對應 unit tests。 |
| D-P-4 | Parent progress @ `2026-06-26T10:18:18Z` | 最新 machine truth 已把剩餘風險從「待實作 blocker」收斂成「package-resolution 驗證 blocker」。 |
| D-P-5 | Targeted regression suites | parent owner 已經把 task-local signal 收斂到 `sandbox-dispatch-gate` / `owned-mobility` / `int-p2-002`；下一次 handoff 應維持同樣的驗證邊界。 |

### Truth Sources

- L0:
  - `ai-status.json` task slice via `scripts/ai-status.sh show`
  - `ai-activity-log.jsonl` task-specific grep slice
- Phase2 planning / decision docs:
  - `docs/02-architecture/phase2_tesla_fsd_sandbox_execution_plan_20260625.md`
  - `docs/02-architecture/phase2_tesla_fsd_sandbox_open_decisions_s1s6_system_design_response_20260626.md`
  - `docs/02-architecture/phase2_tesla_fsd_sandbox_system_design_decision_packet_c1c6_b1b5_20260625.md`
- Integration / implementation anchors:
  - dependency closeout `78e01dcae`
  - parent branch `origin/codex2/p2-dp-s1-001@607fe7e84`
  - parent branch `origin/codex2/p2-dp-s1-001@4530dc20d`
  - parent progress note @ `2026-06-26T10:18:18Z`

---

## 6) Evidence Inventory

| ID | Evidence | Anchor |
| --- | --- | --- |
| E-1 | parent / sidecar machine state | `scripts/ai-status.sh show P2-DP-S1-001`, `scripts/ai-status.sh show P2-DP-S1-001-SIDECAR-ACCEPTANCE` |
| E-2 | parent first reopen: persisted catalog authority violated fail-closed acceptance | `ai-activity-log.jsonl` entry @ `2026-06-26T09:59:40Z` |
| E-3 | parent handoff after first fix | `ai-activity-log.jsonl` entry @ `2026-06-26T10:03:21Z` (`origin/codex2/p2-dp-s1-001@607fe7e84`, 93 tests passed) |
| E-4 | parent second reopen: actor/timestamp trust + unreachable `ops_console` path | `ai-activity-log.jsonl` entry @ `2026-06-26T10:09:34Z` |
| E-5 | parent progress: second-round fixes implemented, verification blocked by package resolution | `ai-activity-log.jsonl` entry @ `2026-06-26T10:18:18Z` |
| E-6 | dependency satisfied in `dev` | merge closeout `78e01dcae` (`P2-DP-C3-001: sandbox fulfillment visibility contract closeout (#912)`) |
| E-7 | S1 acceptance source: fail-closed + messageCode authority + ack requirement | `phase2_tesla_fsd_sandbox_open_decisions_s1s6_system_design_response_20260626.md`, sections `1`, `1.3`–`1.7` |
| E-8 | execution-plan dependency row | `phase2_tesla_fsd_sandbox_execution_plan_20260625.md`, task table row for `P2-DP-S1-001` |
| E-9 | baseline passenger-display rule | `phase2_tesla_fsd_sandbox_system_design_decision_packet_c1c6_b1b5_20260625.md`, section `5.3` |
| E-10 | first-round persisted catalog authority fix | `607fe7e84:apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.service.ts:219-225` |
| E-11 | first-round regression for missing persisted catalog | `607fe7e84:apps/api/tests/unit/sandbox-dispatch-gate.service.test.ts:1054+` |
| E-12 | second-round `ops_console` route hardening | `4530dc20d:apps/api/src/modules/owned-mobility/owned-mobility.controller.ts:263-299` |
| E-13 | second-round service-level actor derivation + channel resolution + ops acknowledgement path | `4530dc20d:apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1098-1218,5157-5223` |
| E-14 | second-round server-owned ack timestamp / actor persistence | `4530dc20d:apps/api/src/modules/sandbox-dispatch-gate/sandbox-dispatch-gate.service.ts:233-283` |
| E-15 | second-round task-local unit tests | `4530dc20d:apps/api/tests/unit/owned-mobility.controller.test.ts`; `4530dc20d:apps/api/tests/unit/owned-mobility.service.test.ts`; `4530dc20d:apps/api/tests/unit/sandbox-dispatch-gate.service.test.ts` |
| E-16 | accepted baseline review evidence packet | commit `ca75a8fd7` (`P2-DP-S1-001-SIDECAR-REVIEW`) |
| E-17 | acceptance packet reopen for stale parent snapshot | `ai-activity-log.jsonl` entry @ `2026-06-26T10:18:45Z` |

---

## 7) Reviewer Hotspots (`Codex2`)

Reviewer 應優先確認：

1. packet 是否清楚區分「已提交且可引用的基線」與「已 anchor 但尚未完成驗證的第二輪修補」。
2. `AC-2` 是否明確保留第一輪 reopen 的核心判準：persisted disclosure catalog 才是 runtime authority，不能再回到 compiled baseline copy 為真相。
3. `AC-3` 是否把 legal acknowledgement 的 actor/time provenance 修補講清楚：server 必須從 authenticated identity 決定 `actorType` / `actorRef`，並由 server 產生 `acknowledgedAt`；同時 packet 不能把它寫成已驗證完成。
4. `AC-4` 是否把 `ops_console` path 的可達性說清楚：不只 route 存在，`resolvePassengerDisclosureChannel` 也要能回到 `ops_console`，且這些修補現在已在 `4530dc20d` 可引用，不再只是 owner worktree 草稿。
5. packet 是否正確表達 parent 目前仍未 ready / done，原因是 verification blocker 而非仍待實作。
6. support artifact 是否只新增 sidecar packet，未改 canonical truth 或 runtime。

**建議核准用語：**

> `P2-DP-S1-001 acceptance packet ready: it preserves the current machine-truth state, distinguishes the already-committed persisted-catalog authority fix at 607fe7e84 from the second-round acknowledgement hardening now anchored at 4530dc20d, correctly frames the remaining risk as blocked verification in the parent worktree environment, cites the formal P2-DP-C3-001 dependency closeout, and stays within support-only sidecar scope.`

**建議退回用語：**

> `packet needs revision: [specify stale parent-state snapshot / dependency mismatch / blocker framing error / support-scope violation]`

---

## 8) Handoff Command

Owner（`Codex`）完成 packet 後，交給 reviewer（`Codex2`）：

```bash
AI_NAME=Codex python3 scripts/ai_status.py handoff P2-DP-S1-001-SIDECAR-ACCEPTANCE Codex2 "P2-DP-S1-001 acceptance packet ready at support/sidecars/P2-DP-S1-001/P2-DP-S1-001-SIDECAR-ACCEPTANCE.md. It preserves the current in-progress parent state, maps the formal P2-DP-C3-001 dependency to closeout commit 78e01dcae, distinguishes the first-round persisted-catalog authority fix at 607fe7e84 from the second-round acknowledgement hardening now anchored at 4530dc20d, and frames the remaining parent risk as targeted Vitest/tsc verification blocked by the worktree package-resolution environment without changing canonical truth."
```

Reviewer（`Codex2`）核准：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py approve P2-DP-S1-001-SIDECAR-ACCEPTANCE "P2-DP-S1-001 acceptance packet ready: it preserves the current machine-truth state, distinguishes the already-committed persisted-catalog authority fix at 607fe7e84 from the second-round acknowledgement hardening now anchored at 4530dc20d, correctly frames the remaining parent risk as blocked verification in the worktree environment, cites the formal P2-DP-C3-001 dependency closeout, and stays within support-only sidecar scope."
```

Reviewer（`Codex2`）退回：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py reopen P2-DP-S1-001-SIDECAR-ACCEPTANCE "packet needs revision: [specify stale parent-state snapshot / dependency mismatch / blocker framing error / support-scope violation]"
```

---

## 9) Change Log

- `2026-06-26T10:20Z` — refresh after reviewer reopen: updated sections 2/4/5/6/7/8 so the packet matches the latest parent machine truth, replacing stale "open implementation blocker" framing with `4530dc20d` branch evidence plus the current package-resolution verification blocker.
- `2026-06-26T10:18Z` — 初版 acceptance packet：根據 machine truth、phase2 S1 decision docs、dependency closeout `78e01dcae`、approved review packet `ca75a8fd7`、以及 owner worktree 當前未提交 diff，整理 acceptance checklist、dependency map、reviewer hotspots、與 parent ready-to-review gate。
