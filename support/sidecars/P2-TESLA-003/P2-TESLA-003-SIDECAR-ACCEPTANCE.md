# P2-TESLA-003 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `P2-TESLA-003` — Tesla regulatory event ingress (mTLS/JWS, raw vault, normalize, idempotency)  
**Current Sidecar Owner:** `Codex`  
**Assigned Reviewer:** `Codex2`  
**Parent Owner / Reviewer:** `Codex2` / `Codex`  
**Phase:** `phase2-tesla-fsd-sandbox-202606`  
**Last Revised:** `2026-06-26T04:26Z (UTC)`  
**Status:** `in_progress` (this sidecar is being prepared while parent `P2-TESLA-003` is already in `review`)

---

## 1) Scope Boundary

本 sidecar 只整理 `P2-TESLA-003` 的 acceptance checklist、dependency map、repo baseline 與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務實作。

- In scope:
  - support-only acceptance framing
  - dependency mapping for `P2-TESLA-002 -> P2-TESLA-003`
  - reviewer hotspots for the parent review branch / PR
  - handoff notes for `Codex2`
- Out of scope:
  - 改寫 `apps/api/src/modules/tesla-regulatory-events/**` 主線實作
  - 改動 `packages/contracts/**`、`infra/migrations/**`、L1/L2 規格文件
  - 代替 parent reviewer 對 `P2-TESLA-003` 做正式 approve / reopen
  - 改寫 `ai-status.json` machine truth 以外的 canonical backlog 定義

> Helper rule: 這是 support-only sidecar，不是 canonical implementation。是否吸收由 parent owner (`Codex2`) 與 reviewer (`Codex`) 決定。

---

## 2) Current Dispatch Snapshot

### Relevant queue for `Codex` in this Tesla slice

| Task | Relationship to `Codex` | State | Why it matters here |
| --- | --- | --- | --- |
| `P2-TESLA-003-SIDECAR-ACCEPTANCE` | owner | `in_progress` | 本次 dispatch 的直接工作項 |
| `P2-TESLA-003` | reviewer | `review` | 本 packet 要支援的 parent review 目標 |
| `P2-TESLA-004` | reviewer | `todo` | 尚未進入待回應狀態，不納入本 packet |

### Parent task machine-truth state

以 `AI_NAME=Codex scripts/ai-status.sh show P2-TESLA-003` 為準：

- `status=review`
- `owner=Codex2`
- `reviewer=Codex`
- `depends_on=["P2-TESLA-002"]`
- `last_update=2026-06-26T04:20:15Z`
- `acceptance[]`:
  - `Acceptance tests 04 §7 #1-3`
  - `#6 pass (valid signed accepted / invalid rejected+audited / duplicate idempotent / unknown schema quarantined raw-preserved); receipt returned; canonical event store populated; integration green`
- `next` 已明確指出 parent closeout branch 為 `codex2/p2-tesla-003-closeout`，closeout commit 為 `7074bcf5c75f`，PR `#895` 已開到 `dev`，且 owner 已跑過：
  - `pnpm --filter @drts/api lint`
  - `pnpm --filter @drts/api test -- --runInBand`
  - `python3 scripts/git/check_commit_trailers.py --base origin/dev --head HEAD`

### Sidecar task machine-truth state

以 `AI_NAME=Codex scripts/ai-status.sh show P2-TESLA-003-SIDECAR-ACCEPTANCE` 為準：

- `status=in_progress`
- `owner=Codex`
- `reviewer=Codex2`
- `depends_on=["P2-TESLA-002"]`
- `artifacts=["support/sidecars/P2-TESLA-003/P2-TESLA-003-SIDECAR-ACCEPTANCE.md"]`
- `mutates_canonical=false`

---

## 3) Dependency Map

### Direct upstream dependency: `P2-TESLA-002`

`P2-TESLA-002` 已不在 active task board，但 git history 與其 sidecar packet 都還在，可作為正式依賴證據：

| Evidence | Value | Why it matters to `P2-TESLA-003` |
| --- | --- | --- |
| Parent closeout commit | `e3caf09341a175a2c9fe56626dafbbbf8be1d26c` | `P2-TESLA-002: finalize tesla regulatory capability profile closeout` |
| Parent verification | `pnpm --filter @drts/contracts build; pnpm --filter @drts/shared-test-fixtures typecheck; pnpm --filter @drts/api exec vitest run tests/unit/tesla-regulatory-events.service.test.ts tests/integration/int-tesla-001-capability-profile-query.test.ts tests/unit/owned-mobility-compliance-gates.test.ts` | 代表 Tesla regulatory capability profile / gating baseline 已完成驗證 |
| Sidecar packet branch | `origin/claude/p2-tesla-002-sidecar-acceptance` @ `168b5c515` | acceptance packet 已把 `P2-TESLA-002` 的 capability-profile / mock signed samples / reason-code dictionary / gating 邊界整理過 |

`P2-TESLA-003` 不應重做或推翻 `P2-TESLA-002` 已定下的 Tesla regulatory baseline。具體來說：

- `P2-TESLA-002` 已將 Tesla regulatory surface鎖定在 capability profile、signed sample events、reason-code dictionary versioning、required-capability gating。
- `P2-TESLA-003` 應建立在這個 baseline 之上，只補 ingress 收件、raw custody、schema-version normalizer、idempotency、security-incident / alert hook。
- Reviewer 應拒絕任何把 `P2-TESLA-003` 擴大成重新定義 capability-profile、reason-code 責任歸類或 broader Tesla integration 的變更。

### Practical implementation dependencies used by the parent review branch

| Surface | Current role |
| --- | --- |
| `packages/contracts/src/phase2-tesla-fsd-sandbox.ts` | 提供 `TeslaRegulatoryEvent`、`TeslaDisengagementCause`、`Phase2SourceMetadata` 等 canonical DTO 基線，`P2-TESLA-003` service / repository 直接依賴這些型別 |
| `infra/migrations/V0037__phase2_av_sandbox_evidence_skeleton.sql` | 提供 `av_sandbox.tesla_regulatory_events` 基礎表；`P2-TESLA-003` 的 `V0040` 是在此基礎上補 raw ingress vault 與 idempotency metadata |
| `apps/api/src/modules/tesla-regulatory-events/*` | `P2-WP0` / `P2-TESLA-002` 時期是 scaffold；`P2-TESLA-003` review branch 在這裡補 controller / repository / service / module wiring |
| `apps/api/src/common/auth/internal-key.middleware.ts` + `apps/api/src/main.ts` + `apps/api/src/app.module.ts` | parent branch 為 provider callback 補 narrow bypass 與 raw body capture，這是 ingress 能成立的 transport 前提 |
| `AuditNotificationService` | parent summary 中的 `alert hook` 依賴這個審計通知面 |

---

## 4) Parent Review Branch Surface

### Review target is the parent branch, not current `origin/dev` baseline

目前這個 sidecar worktree 在 `codex/p2-tesla-003-sidecar-acceptance`，基底是 `origin/dev`。  
但 `P2-TESLA-003` 真正待 review 的內容在：

- branch: `codex2/p2-tesla-003-closeout`
- closeout commit: `7074bcf5c75faab9d49c93eb0bb254fc12fd94cc`
- PR: `#895`

現行 `origin/dev` 上的 `apps/api/src/modules/tesla-regulatory-events/tesla-regulatory-events.service.ts` 仍是 scaffold-only。  
因此 reviewer 不能只看本 worktree 的 baseline；必須對著 parent branch / PR 看。

### Parent branch diff summary (`origin/dev...7074bcf5c75f`)

`P2-TESLA-003` review branch共修改 14 個檔案：

- transport / auth wiring
  - `apps/api/src/app.module.ts`
  - `apps/api/src/common/auth/internal-key.middleware.ts`
  - `apps/api/src/main.ts`
  - `apps/api/src/modules/tesla-regulatory-events/tesla-regulatory-events.controller.ts`
- Tesla regulatory ingress implementation
  - `apps/api/src/modules/tesla-regulatory-events/tesla-regulatory-events.module.ts`
  - `apps/api/src/modules/tesla-regulatory-events/tesla-regulatory-events.repository.ts`
  - `apps/api/src/modules/tesla-regulatory-events/tesla-regulatory-events.service.ts`
- verification
  - `apps/api/tests/integration/int-tesla-001-regulatory-event-ingress.test.ts`
  - `apps/api/tests/unit/app.module.test.ts`
  - `apps/api/tests/unit/auth-bootstrap.test.ts`
  - `apps/api/tests/unit/tesla-regulatory-events.controller.test.ts`
  - `apps/api/tests/unit/tesla-regulatory-events.http.test.ts`
  - `apps/api/tests/unit/tesla-regulatory-events.service.test.ts`
- persistence
  - `infra/migrations/V0040__tesla_regulatory_raw_event_ingress.sql`

### What the branch materially adds

- 新增 provider callback route `POST /internal/providers/tesla/regulatory-events`
- 以 `rawBody: true` 保留原始 payload 供 detached JWS 驗證
- 對 callback route 做 narrow internal-key middleware bypass，避免把 provider callback 掛到一般 internal-key auth 模型
- 建立 `av_sandbox.tesla_regulatory_raw_events` immutable raw vault
- 在 `av_sandbox.tesla_regulatory_events` 補 `provider_code` / `provider_event_id` / `payload_sha256` / `raw_event_id` / `ingest_status`
- service / repository 補 raw custody、schema-version normalizer、idempotency、duplicate repair、hash mismatch security incident、audit hook
- 補 integration + unit coverage，對齊 parent acceptance line 中列出的 accepted / rejected / duplicate / quarantined 行為

---

## 5) Parent Acceptance Checklist

以下 checklist 只展開 parent machine-truth `acceptance[]` 與 `summary_zh`，不新增產品語意。

### AC-1 - HTTP surface and auth boundary

- [ ] `POST /internal/providers/tesla/regulatory-events` 存在，且是 provider callback 唯一公開入口。
- [ ] Route 不應從 `/api/internal/providers/tesla/regulatory-events` 對外暴露；HTTP 測試應驗證 `/api/...` 回 `404`。
- [ ] `InternalKeyMiddleware` 僅對這個 callback 做 narrow exclude，不應意外放大其他 internal 路徑。
- [ ] `main.ts` 以 `rawBody: true` 啟用原始 payload capture，供 detached JWS 驗證使用。

### AC-2 - mTLS / JWS / provider identity verification

- [ ] service 驗證 mTLS client certificate header；只有 `x-provider-identity` 而沒有 client cert header 的請求必須被拒絕。
- [ ] provider identity 必須經 allowlist 驗證，不可接受任意 provider 名稱。
- [ ] detached JWS 驗證接受允許的 JOSE 演算法，且 ES256 簽章格式必須是 P-1363；DER-encoded ES256 應被拒絕。
- [ ] replay window 與 payload size limit 有實作，並以 request rejection / audit 體現。

### AC-3 - Raw vault custody and receipt semantics

- [ ] raw vault 表 `av_sandbox.tesla_regulatory_raw_events` 記錄完整 custody metadata：
  - `provider_code`
  - `provider_identity`
  - `provider_event_id`
  - `schema_version`
  - `payload_sha256`
  - `payload_body`
  - `payload_bytes`
  - `raw_headers`
  - `jws_protected_header`
  - `jws_signature`
  - `jws_kid`
  - `jws_alg`
  - `jws_issued_at`
  - `mtls_client_cert`
  - `mtls_fingerprint`
- [ ] receipt 會回傳 `receiptId`、`providerCode`、`providerEventId`、`schemaVersion`、`payloadSha256`、`rawEventId`、`canonicalEventId`、`status`、`duplicate`、`receivedAt`。
- [ ] exact raw headers 有保存，不可只保留 parsed body。

### AC-4 - Idempotency, normalization, and security incident handling

- [ ] 相同 `(provider_code, provider_event_id)` 且相同 `payload_sha256` 的重送，必須 idempotent 回 `duplicate`。
- [ ] 同一 `providerEventId` 但不同 `payload_sha256` 必須 raise security incident / audit，而不是默默覆寫。
- [ ] unknown `schemaVersion` 必須 `quarantined`，且 raw vault 仍保留。
- [ ] invalid known-schema payload 必須 `rejected+audited`，但 raw vault 仍保留，不能因 normalize 失敗而失去原始證據。
- [ ] known good payload 會 populate canonical event store，並將 raw / canonical 關聯起來。
- [ ] raw-only duplicate replay path 具備 repair 行為：先前只有 raw vault、沒有 canonical event 的已知 schema duplicate，可在 replay 時補上 canonical event。

### AC-5 - Verification coverage

- [ ] `apps/api/tests/unit/tesla-regulatory-events.service.test.ts` 覆蓋至少以下情境：
  - valid signed event accepted
  - invalid detached signature rejected + audited
  - `x-provider-identity` without client cert rejected
  - DER-encoded ES256 rejected
  - duplicate same hash idempotent
  - unknown schema quarantined
  - invalid known-schema payload raw-preserved then rejected
  - quarantined replay stays idempotent
  - same `providerEventId` with different hash raises security incident
  - raw-only duplicate repair path
- [ ] `apps/api/tests/unit/tesla-regulatory-events.controller.test.ts` 驗證 raw body / raw headers / request id 會轉交 service，且 response 包在標準 API envelope。
- [ ] `apps/api/tests/unit/tesla-regulatory-events.http.test.ts` 驗證 callback 只在 non-`/api` path 可用，且不暴露在 `/api` 前綴下。
- [ ] `apps/api/tests/unit/app.module.test.ts` 驗證 middleware exclude 精準。
- [ ] `apps/api/tests/integration/int-tesla-001-regulatory-event-ingress.test.ts` 驗證 accepted / duplicate / quarantined / invalid-known-schema 的整段 ingress coherence。
- [ ] owner 所述 `lint` / `test -- --runInBand` / `check_commit_trailers.py` 驗證結果與 branch 現況一致。

### AC-6 - Scope guardrails

- [ ] 不要把 `P2-TESLA-003` 描述成 broader Tesla public fleet integration；那屬 `P2-TESLA-001`。
- [ ] 不要把 `P2-TESLA-003` 描述成 capability-profile / reason-code dictionary 重新定義；那是 `P2-TESLA-002` baseline。
- [ ] 不要把 non-driving command broker、VIN bind、OAuth、telemetry configure/status 等 surface 混入本 task 驗收。
- [ ] 不要把 sandbox callback 說成「可控 FSD」或 production Tesla endpoint 已連線。

---

## 6) Reviewer Hotspots

`Codex2` review 本 sidecar 時，應先確認以下幾點是否寫對，之後 parent reviewer (`Codex`) 可直接照此聚焦：

1. **Review surface is branch-scoped.** 本 packet 已明講 reviewer 應看 `codex2/p2-tesla-003-closeout` / commit `7074bcf5c75f` / PR `#895`，而不是 current `origin/dev` scaffold baseline。
2. **`P2-TESLA-002` is an archived-but-real dependency.** 雖然 active board 查不到 `P2-TESLA-002` row，但 closeout commit `e3caf0934` 與其 accepted sidecar packet 仍可證明它是正式上游。
3. **Callback bypass must stay narrow.** `internal-key` exclude 只能放行 Tesla regulatory callback；不能順便打開別的 internal provider route。
4. **Raw custody is the real acceptance center.** `P2-TESLA-003` 的價值不只是 controller 收到 POST，而是 rejected / quarantined / duplicate 都保留 raw vault 與 audit trail。
5. **Idempotency semantics are stricter than "duplicate=ok".** same hash duplicate 要 idempotent；different hash on same `providerEventId` 必須視為 security incident。

建議核准用語：

> `P2-TESLA-003 acceptance packet ready: it keeps the parent review target pinned to branch codex2/p2-tesla-003-closeout / commit 7074bcf5c75f / PR #895, preserves the archived-but-real P2-TESLA-002 dependency via closeout commit e3caf0934 and its accepted sidecar packet, expands the recorded acceptance line into ingress/auth, raw-vault, idempotency, normalization, and test-coverage gates without inventing new product semantics, and stays within support-only scope without mutating canonical truth.`

建議退回用語：

> `packet needs revision: [specify machine-truth mismatch / dependency drift / parent-branch-vs-dev confusion / invented acceptance semantics / support-scope violation]`

---

## 7) Handoff Commands

Owner (`Codex`) 完成 packet 後交給 reviewer (`Codex2`)：

```bash
AI_NAME=Codex scripts/ai-status.sh handoff P2-TESLA-003-SIDECAR-ACCEPTANCE Codex2 "P2-TESLA-003 acceptance packet ready at support/sidecars/P2-TESLA-003/P2-TESLA-003-SIDECAR-ACCEPTANCE.md. It keeps the parent review target pinned to branch codex2/p2-tesla-003-closeout / commit 7074bcf5c75f / PR #895, preserves the P2-TESLA-002 dependency via closeout commit e3caf0934 and its accepted sidecar packet, expands the recorded acceptance into ingress/auth, raw-vault, idempotency, normalization, and test-coverage gates, and stays support-only without changing canonical truth."
```

Reviewer (`Codex2`) 核准：

```bash
AI_NAME=Codex2 scripts/ai-status.sh approve P2-TESLA-003-SIDECAR-ACCEPTANCE "P2-TESLA-003 acceptance packet ready: parent review target is correctly pinned to codex2/p2-tesla-003-closeout / commit 7074bcf5c75f / PR #895, the P2-TESLA-002 dependency is correctly preserved via closeout commit e3caf0934 and its accepted sidecar packet, the checklist expands the recorded ingress/raw-vault/idempotency acceptance without inventing new semantics, and the support material stays within sidecar scope without mutating canonical truth."
```

Reviewer (`Codex2`) 退回：

```bash
AI_NAME=Codex2 scripts/ai-status.sh reopen P2-TESLA-003-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / dependency drift / branch-target confusion / invented acceptance semantics / support-scope violation]"
```

---

## 8) Change Log

- 2026-06-26 — 初版建立：依 `scripts/ai-status.sh show P2-TESLA-003`、`P2-TESLA-003-SIDECAR-ACCEPTANCE`、git history 中的 `P2-TESLA-002` closeout / sidecar packet、以及 parent review branch `origin/dev...7074bcf5c75f` 的 diff，整理 acceptance checklist、dependency map、review-branch hotspots 與 handoff 指引。不修改 canonical truth。
