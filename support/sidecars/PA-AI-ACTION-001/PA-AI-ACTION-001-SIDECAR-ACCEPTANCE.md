# PA-AI-ACTION-001 Sidecar Acceptance Packet

> **Parent Task:** `PA-AI-ACTION-001` - Platform Admin assistant governed action execution
> **Parent Owner / Reviewer:** `Codex2` / `Claude` (per `ai-status.json`; task brief still lists reviewer `Claude2`, see §6.3)
> **Sidecar Owner / Reviewer:** `Claude` / `Codex2`
> **Helper Kind:** `acceptance_packet`
> **Mutates Canonical:** `false`
> **Planning Ref:** `docs/05-ui/platform-admin-agentic-assistant-architecture-plan-20260603.md`
> **Source of task truth:** `ai-status.json`, parent task brief `.orchestrator/task-briefs/PA-AI-ACTION-001.md`

This packet is a support artifact only. It does not modify L1 product truth, core
contracts, runtime/registry/governance implementation, or the parent's owned files.
It exists to help the parent owner (`Codex2`) and reviewer close `PA-AI-ACTION-001`
with a focused, evidence-backed acceptance pass and a clear dependency map.

All evidence below is read from the parent's pushed work branch
`origin/codex2/pa-ai-action-001` (tip `96a01dc6`) measured against its merge-base
with `origin/dev` (`64021a3a`, current `dev` HEAD), so the parent is built on a
**fresh `dev` base** (merge-base == dev HEAD → no stale-base clobber risk).

---

## 1. Task Posture

### 1.1 Official upstream dependency from `ai-status.json`

| ID                | Status | Integration        | Why it matters to `PA-AI-ACTION-001`                                                                                                       |
| ----------------- | ------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `PA-AI-TOOLS-001` | `done` | `branch_pushed`    | Brief lists it "for full domain read/write context". It is finalized on `codex2/pa-ai-tools-001` (`4e789344`) but **not yet merged to `dev`**. |

Key dependency nuance (see §4.1): the governed **action execution** path does **not**
import the read-tools file. It executes through `PlatformAdminService`
(`createPlatformNoticeWithAudit` / `setMaintenanceModeWithAudit`), which is already on
`dev`. So the action slice is **not blocked** by the read-tools merge; the dependency
is about read/context completeness, and both slices share the same `branch_pushed`,
not-yet-merged posture.

### 1.2 Contract prerequisites (all present on `dev` base `64021a3a`)

| Symbol                            | Location                                         |
| --------------------------------- | ------------------------------------------------ |
| `CreatePlatformNoticeCommand`     | `packages/contracts/src/index.ts:4745`           |
| `SetPlatformMaintenanceModeCommand` | `packages/contracts/src/index.ts:4762`         |
| `ResourceActionDescriptor`        | `packages/contracts/src/ui-runtime.ts:147`       |
| `ActionReceipt`                   | `packages/contracts/src/ui-runtime.ts:203`       |

No new contract truth is required for the action slice; descriptors and receipts
already exist in `@drts/contracts` on `dev`.

### 1.3 Cross-slice touchpoints worth reviewing together

| Slice            | Relevance to acceptance                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PA-AI-REAL-001` | Real provider gateway. The parent branch still ships `MockPlatformAdminAssistantProvider` (`kind = "mock"`). Real-provider acceptance belongs to REAL-001, **not** to ACTION-001's 8 acceptance items — do not block ACTION-001 on mock-vs-real. |
| `PA-AI-CTX-001`  | Context mesh v2. The parent extracts the current route only via a `^Path: <route>$` prefix in the message (`extractRoutePath`). Full page/form/table context is CTX-001 scope. |
| `PA-AI-SEC-001`  | Security/redaction. `platform-admin-assistant.redaction.ts` is on `dev`; the parent adds a unit test that treats prompt-injection text inside action payloads as inert data. Deep prompt-injection/RBAC/budget suites are SEC-001 scope. |
| `PA-AI-DEV-001` / `PA-AI-ORCH-001` / `PA-AI-E2E-001` | Downstream collaboration/bridge/full-E2E waves; not gating for this slice. |

### 1.4 Current parent state

- `PA-AI-ACTION-001` is `in_progress`, owner `Codex2`, reviewer `Claude`.
- Parent work is committed and pushed to `origin/codex2/pa-ai-action-001`
  (`96a01dc6`); integration posture is branch-only (no PR/merge/deploy evidence yet).

---

## 2. Evidence Inventory (parent branch `96a01dc6` vs `dev` base)

Files changed (`git diff --name-only 64021a3a origin/codex2/pa-ai-action-001`),
11 files / +674 / -79:

### 2.1 API action lifecycle

| Area | Evidence |
| ---- | -------- |
| Action resolver | `apps/api/src/modules/platform-admin-assistant/platform-admin-assistant.actions.ts` — `resolvePlatformAdminAssistantAction()` returns a descriptor + confirmation copy + `execute()` for each registered tool. |
| Action types | `platform-admin-assistant.types.ts` — adds `PlatformAdminAssistantActionToolName`, `ExecutePlatformAdminAssistantActionCommand` (`reason?: string \| null`), `PlatformAdminAssistantActionPreview`, `PlatformAdminAssistantGovernedActionRequest`, `PlatformAdminAssistantActionExecutionResult` (`{ receipt; assistantAuditId }`). |
| Service lifecycle | `platform-admin-assistant.service.ts` — `previewAction()`, `executeAction()`, `buildGovernedActionRequest()`, `describeDisabledReason()`, `extractRoutePath()`; high-risk empty-reason → `400`. |
| Controller endpoints | `platform-admin-assistant.controller.ts` — `POST sessions/:id/actions/preview` and `POST sessions/:id/actions/execute`. |
| Mock provider proposal | `platform-admin-assistant.provider.ts` — `extractGovernedAction()` maps notice/maintenance intent (EN + ZH keywords) into a `governedAction` proposal. |
| Audit recorder | `platform-admin-assistant.audit.ts` (on `dev` base) — `recordPlanCreated`, `recordActionBlocked`, `recordActionConfirmed`, `recordActionExecuted`. |

### 2.2 Chat UI

| Area | Evidence |
| ---- | -------- |
| Confirmation panel | `apps/platform-admin-web/components/assistant/AssistantConfirmationPanel.tsx` (+23). |
| Overlay wiring | `platform-assistant-overlay.tsx` (+180) — renders governed-action proposal + confirm/execute + receipt. |
| UI types | `assistant-types.ts` (+8) — `governedAction` shape on messages. |
| Receipt card | `AssistantReceiptCard.tsx` / `AssistantActionPlanCard.tsx` (present on `dev` base). |

### 2.3 Test evidence on the parent branch

| Test file | Coverage relevant to acceptance |
| --------- | ------------------------------- |
| `apps/api/tests/unit/platform-admin-assistant.service.test.ts` | descriptor-backed preview; prompt-injection payload treated as inert; reject unresolved/disabled descriptor; **requires non-empty reason for high-risk**; reject non-platform actor; **returns `ActionReceipt` + `assistantAuditId` on execute**; governed-action proposal w/ preview metadata. |
| `apps/api/tests/unit/platform-admin-assistant.controller.test.ts` | message envelope shape; **wraps action execute responses with `ActionReceipt` and `assistantAuditId`**. |
| `tests/e2e/platform-admin-assistant-overlay.spec.ts` | New test: "renders governed action confirmation and receipt for assistant-authored write proposals" — sends `請幫我建立公告`, asserts confirmation panel, fills `Operator note`, clicks `Create notice`, asserts `Action receipt` + `Platform notice created.`, asserts `lastActionReason`. |

> Verification commands are **not executed in this sidecar** (support-only worktree).
> Recommended parent re-run is listed in §5.

---

## 3. Acceptance Gate Snapshot

Mapped 1:1 to the 8 acceptance items in `.orchestrator/task-briefs/PA-AI-ACTION-001.md`.

| # | Acceptance item | Status | Evidence / note |
| - | --------------- | ------ | --------------- |
| 1 | Action lifecycle supports preview, risk descriptor, required reason, confirmation, execute, receipt | `PASS` | `preview`/`execute` endpoints; `ResourceActionDescriptor{riskLevel, requiresReason}`; `confirmationRequired`; `executeAction` returns `{ receipt, assistantAuditId }`. |
| 2 | Chat UI renders action proposal cards and confirmation panels | `PASS` | `AssistantConfirmationPanel.tsx` + overlay (+180) + receipt card; E2E renders confirmation + receipt. |
| 3 | Existing `create_platform_notice` and `set_maintenance_mode` use the new lifecycle | `PASS` | Both resolved in `actions.ts` via `createPlatformNoticeWithAudit` / `setMaintenanceModeWithAudit`. |
| 4 | At least two **additional** write actions implemented or stubbed behind disabled descriptors | `FAIL` | `PlatformAdminAssistantActionToolName` union contains **only** the two original tools; no additional tools are wired or stubbed behind disabled descriptors. **Primary blocker.** |
| 5 | Medium/high risk actions cannot execute without explicit confirmation | `PASS_WITH_NOTE` | `confirmationRequired` is surfaced and the UI gates execute behind the confirmation panel (separate `actions/execute` endpoint). Note: there is **no server-side "confirmed" token** — for medium-risk (no reason) the server enforcement relies on the UI gate, not a server-checked confirmation flag. Acceptable if reviewers accept UI-level gating; flag if a server-side confirmation assertion is required. |
| 6 | High risk actions require a non-empty reason | `PASS` | `set_maintenance_mode` is `riskLevel: "high", requiresReason: true`; `executeAction` throws `400` on empty reason; unit test covers it. |
| 7 | Domain audit and assistant audit are both written for executed actions | `PASS` | Domain audit via `receipt.auditId` from `*WithAudit`; assistant audit via `auditNotificationService.recordAuditLog(...)` + `assistantAuditRecorder.recordActionConfirmed/recordActionExecuted`. |
| 8 | E2E covers preview and confirmed execution for one safe dev action | `PASS` | New E2E exercises notice proposal → confirm → execute → receipt (`create_platform_notice`, medium risk). |
| — | Parent slice ready for final review | `NOT YET` | Item 4 is unmet; resolve or explicitly waive before final handoff. |

---

## 4. Confirmed Hotspots And Likely Blockers

### 4.1 Dependency posture is "done but unmerged" on both slices

- `PA-AI-TOOLS-001` is `done` with `integration_status: branch_pushed` on
  `codex2/pa-ai-tools-001` (`4e789344`), **not** reachable from `origin/dev`.
- The parent action branch is likewise branch-only.
- Action **execution** does not import the read-tools file, so the read-tools merge is
  not a hard blocker for the action lifecycle. But full "read/write context"
  acceptance (and any future read-tool wiring into the assistant) inherits the
  unmerged posture. Track integration of both branches together.

### 4.2 Item 4 — additional write actions not present (primary blocker)

- The tool-name union and payload map define **only** `action.create_platform_notice`
  and `action.set_maintenance_mode`. The brief requires **two additional** write
  actions, "implemented **or stubbed behind disabled descriptors**".
- Lowest-cost path to satisfy: register two more `action.*` tool names that resolve to
  `ResourceActionDescriptor{ enabled: false, disabledReasonCode: ... }` (mirroring the
  existing `maintenance_mode_already_*` disabled pattern), so the lifecycle surface is
  proven without enabling new live mutations. If the parent chooses to skip this,
  reviewers should record an explicit waiver with rationale.

### 4.3 Item 5 — confirmation is UI-gated, not server-token-gated

- `executeAction` enforces the high-risk reason rule, but does not require a separate
  server-side "confirmed" flag. Medium-risk execution is reachable by a direct call to
  `actions/execute` without a prior preview/confirm round-trip.
- This satisfies the flow-level intent (UI never calls execute without confirmation),
  but if the reviewer reads item 5 as a server-enforced guarantee, the parent should
  add a confirmation assertion (e.g. require the caller to echo the previewed
  descriptor/`confirmationRequired`).

### 4.4 Out-of-scope items reviewers should NOT block on

- Mock vs real provider: the slice ships the mock provider; real provider is
  `PA-AI-REAL-001`. ACTION-001's 8 items do not include "real provider".
- Full context mesh / RAG: route is captured via the `Path:` prefix only; richer
  context is `PA-AI-CTX-001`.
- Deep prompt-injection / RBAC / budget suites: `PA-AI-SEC-001`.

---

## 5. Recommended Review Order

1. **Resolve item 4 first** — add two additional `action.*` tools (live or stubbed
   behind disabled descriptors), or record an explicit waiver. This is the only `FAIL`.
2. **Decide on item 5 posture** — accept UI-level confirmation gating, or require a
   server-side confirmation assertion; record the decision.
3. **Re-run focused verification** (parent owner, in a worktree with `node_modules`):
   - `pnpm --filter api exec vitest run tests/unit/platform-admin-assistant.service.test.ts tests/unit/platform-admin-assistant.controller.test.ts`
   - `pnpm --filter api exec tsc -p tsconfig.json --noEmit`
   - `pnpm --filter platform-admin-web exec playwright test tests/e2e/platform-admin-assistant-overlay.spec.ts` (enabled project)
4. **Confirm dual-audit at runtime** — one executed notice should produce both a
   domain audit (`receipt.auditId`) and an assistant audit (`assistantAuditId`).
5. **Track integration** — plan the merge of `codex2/pa-ai-action-001` and the
   `PA-AI-TOOLS-001` branch into `dev` together; do not report "ready on dev" until a
   `Deploy - Dev` run includes both.

---

## 6. Handoff Notes For `Codex2` (sidecar reviewer)

### 6.1 What this packet asserts

- 7 of 8 acceptance items have direct branch evidence (`PASS` / `PASS_WITH_NOTE`).
- Item 4 (two additional write actions) is the single `FAIL` and the primary blocker.
- Item 5 is a posture decision (UI-gated vs server-token-gated confirmation).
- Parent is on a fresh `dev` base (no clobber); contracts are already on `dev`.

### 6.2 What this packet does NOT do

- It does not modify canonical truth, the parent's owned files, or contracts.
- It does not run gates (support-only worktree); §5 lists the parent's re-run set.
- It does not finalize `PA-AI-ACTION-001`; the parent owner decides absorption.

### 6.3 Data-quality note for the parent owner

- `ai-status.json` records the parent reviewer as `Claude`, while the parent task
  brief (`.orchestrator/task-briefs/PA-AI-ACTION-001.md`) and the planning doc §9 list
  `Claude2`. `ai-status.json` is canonical for routing; the brief/plan appear stale.
  Worth reconciling before the parent's final review handoff so the approve step
  targets the right reviewer.

This packet is ready for sidecar review as a support artifact.
