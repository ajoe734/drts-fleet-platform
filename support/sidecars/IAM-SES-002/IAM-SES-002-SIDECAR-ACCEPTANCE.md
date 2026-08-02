# IAM-SES-002 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `IAM-SES-002` — enforce revocable JWT and session claims with 60-second invalidation  
**Current Sidecar Owner:** `Codex2`  
**Assigned Reviewer:** `Gemini`  
**Parent Owner / Reviewer:** `Gemini` / `Gemini2`  
**Last Revised:** `2026-08-02T01:25Z (UTC)`  
**Status:** `review_approved` — sidecar `IAM-SES-002-SIDECAR-ACCEPTANCE` is approved under owner=`Codex2`, reviewer=`Gemini`, `last_update=2026-08-02T01:07:18Z`; parent `IAM-SES-002` remains `in_progress` under owner=`Gemini`, reviewer=`Gemini2`, `last_update=2026-08-02T00:14:14Z`

---

## 1) Scope Boundary

本 sidecar 只整理 `IAM-SES-002` 的 acceptance checklist、dependency map、repo baseline 與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務直接實作 JWT/session revocation enforcement。

- In scope: support-only acceptance framing, parent/dependency machine-truth snapshot, repo-visible baseline anchors, reviewer hotspot checklist, and handoff wording.
- Out of scope: `apps/api` / `packages/contracts` / `tests` canonical implementation edits, parent task state transitions, or any claim that `IAM-SES-002` is already complete.

---

## 2) Current State Baseline

以 `ai-status.json` task slices、Stage 1.5 architecture/runbook、以及目前 repo `HEAD` 可見實作為準：

- Parent `IAM-SES-002` 目前在 machine truth 中是 `in_progress`，Owner=`Gemini`，Reviewer=`Gemini2`。
- Parent acceptance 明確要求五件事：required claims issuance/verification、`alg=none` 與 confusion negatives、revoked or stale `tokenVersion` rejection、role/status/membership changes 60 秒內生效、以及 cross-realm + restart tests。
- Parent `next` 明確指出一個 closeout guard：`IAM-IDP-002` 的 canonical PR #1253 仍 pending，不可把 `IAM-SES-002` 當成已完成 integration closeout。
- Formal upstreams 對 parent 目前是：
  - `IAM-SES-001` `done`，且已 `merged_to_dev`。
  - `IAM-P0-002` `done`，token minting 已改為 verified server-side exchange。
  - `IAM-IDP-001` `done`，tenant / partner-human OIDC PKCE BFF 已 `merged_to_dev`。
  - `IAM-IDP-002` `review`，PR #1253 已開；parent closeout 摘要已要求在其 merge to dev 前不得 final-close。
  - `IAM-CTR-001` `done`，canonical IAM contracts / OpenAPI / error codes 已 `merged_to_dev`。
- Sidecar 自身 formal dependency list 只有四項：`IAM-SES-001`、`IAM-P0-002`、`IAM-IDP-001`、`IAM-CTR-001`。這代表本 packet 可以先完成 reviewer handoff，但內容必須保留 parent 仍受 `IAM-IDP-002` integration gate 影響的事實。

### Repo Baseline Anchors

- `apps/api/src/common/auth/jwt-auth.service.ts:12-25` 的 payload 目前只有 `sub`、actor/realm/resource boundary、roles/scopes、`drtsPassengerId`、`driverBindingId`、`driverDeviceId`；尚未包含 `sid`、`jti`、`tokenVersion`、`auth_time`、`amr`、`acr`、`policyVersion`。
- `apps/api/src/common/auth/jwt-auth.service.ts:148-186` 目前已支援 `issuer`、`audience` 與 algorithm allowlist verify options，這是 parent AC 的一部分基底，不是完整實作。
- `apps/api/src/modules/auth/auth.controller.ts:569-588` 的 JWT issuance helper 目前只是包裝 `JwtAuthService.sign(...)`；packet 不應假設 controller layer 已自行補上 revocation-aware claims。
- `apps/api/src/modules/auth/driver-device-session.service.ts:97-117` 與 `189-233` 已具備 driver device binding / refresh 概念，並在 JWT issuance 前後保留 binding state。
- `apps/api/src/modules/auth/driver-device-session.service.ts:118-151` 與 `200-232` 已把 `sessionId` 與 `tokenId` 寫入 security events，但 `tokenId` 現在仍是 raw access token 字串，而不是 canonical `jti` / hashed token identifier contract。
- `apps/api/tests/integration/auth-startup-config.integration.test.ts:33-97` 已覆蓋 production/staging startup preflight，證明 `issuer`、`audience` 與 unsafe config gate 已有 integration smoke，但尚未覆蓋 `sid` / revocation / stale `tokenVersion` negatives。
- `packages/contracts/src/iam-contracts.ts:1-127` 目前已定義 Stage 1.5 IAM operation catalog 與 stable errors，但尚未提供 session claim inventory or revocation DTO contract，可視為 `IAM-CTR-001` 給 `IAM-SES-002` 的 contract baseline，而非本 task 已完成的 session-claim contract。

結論：repo `HEAD` 已有 issuer/audience/algorithm 基線、driver binding state、以及 upstream session store / contract prerequisites，但 `IAM-SES-002` 核心要求的 claim issuance、durable revocation lookup、`tokenVersion` enforcement、與 60 秒 invalidation 尚未從目前 visible baseline 得到完整證明。

---

## 3) Parent Acceptance Framing

以下 checklist 只把 parent `IAM-SES-002.acceptance[]` 與 Stage 1.5 architecture / execution contract 展開成 reviewer-facing gates，不新增新需求。

### AC-1 — JWT issuance must carry canonical revocation-aware claims

- [ ] Access tokens for tenant, partner, workforce, and driver flows carry `sid`, `jti`, `tokenVersion`, `auth_time`, `amr`, `acr`, `issuer`, `audience`, and `policyVersion`.
- [ ] Claim values are server-owned projections from durable session / membership / IdP state, not caller-provided headers or body fields.
- [ ] Reviewer can trace how `IAM-P0-002`, `IAM-IDP-001`, and `IAM-IDP-002` producers feed these claims without reintroducing spoofable privilege input.

### AC-2 — Verification must reject malformed, stale, or downgraded tokens

- [ ] Protected request verification rejects `alg=none` and algorithm confusion attempts.
- [ ] `issuer` / `audience` mismatches fail closed in production paths.
- [ ] Missing or stale `sid` / `jti` / `tokenVersion` / `policyVersion` state fails, even if the signature parses.
- [ ] Cross-realm misuse fails; a token minted for one realm or membership cannot be replayed into another.

### AC-3 — Durable revocation must survive restart and role/status/membership changes

- [ ] Verification path checks durable session/token/account/membership state, not only JWT signature and expiry.
- [ ] Status change, suspend, role downgrade, membership removal, session revoke, or compromise action invalidates all affected sessions within 60 seconds.
- [ ] Restart does not resurrect revoked access; revocation lookup survives process replacement because it depends on durable data introduced by `IAM-SES-001`.

### AC-4 — Review evidence must distinguish upstream foundations from new work

- [ ] Upstream `IAM-SES-001`, `IAM-P0-002`, `IAM-IDP-001`, and `IAM-CTR-001` evidence are cited as prerequisites, not re-claimed as `IAM-SES-002` implementation.
- [ ] `IAM-IDP-002` remains a live integration gate until PR #1253 merges to `dev`; the packet must not imply parent final closeout is available beforehand.
- [ ] Reviewer evidence includes both repo implementation anchors and executable tests for stale token, revoked token, 60-second invalidation, and restart survival.

---

## 4) Dependency Map

### Sidecar Formal Upstream Dependencies

| Dependency | Status | Why it matters to this packet |
| --- | --- | --- |
| `IAM-SES-001` | `done` | Provides durable session / refresh family / token record substrate needed for `sid` / `jti` / `tokenVersion` and restart-safe revocation checks. |
| `IAM-P0-002` | `done` | Ensures minting path is verified server-side, so new session claims stay server-owned rather than caller-supplied. |
| `IAM-IDP-001` | `done` | Supplies trusted OIDC callback session flow and trusted `auth_time` / `amr` / `acr` source for tenant and partner-human sessions. |
| `IAM-CTR-001` | `done` | Establishes stable IAM contracts / error-code baseline for session and authorization failure semantics. |

### Parent Practical Upstream Dependencies

| Dependency | Status | Notes |
| --- | --- | --- |
| `IAM-IDP-002` | `review` | Workforce/IAP subject resolution PR #1253 is open; parent `IAM-SES-002.next` explicitly says not to final-close until it merges to `dev`. |
| `IAM-KEY-001` | `todo`/separate | Not a formal dependency of this sidecar, but reviewer should confirm `IAM-SES-002` does not overclaim asymmetric `kid` rotation work reserved for `IAM-KEY-001`. |

### Downstream / Consumer Context

| Consumer | Why it matters |
| --- | --- |
| `IAM-MFA-001` | Depends on trustworthy `amr` / `acr` / `auth_time` enforcement; reviewer should ensure `IAM-SES-002` leaves those claims canonical and durable. |
| `IAM-SES-003` | Session inventory / logout / revoke APIs must rely on the same canonical `sid` / session state introduced here. |
| Protected-route auth policy across tenant/ops/driver surfaces | Every authz check inherits the stale-token and revoked-membership behavior from this task, so realm-specific regressions matter. |

### Truth Sources

- Machine truth:
  - `scripts/ai-status.sh show IAM-SES-002`
  - `scripts/ai-status.sh show IAM-SES-001`
  - `scripts/ai-status.sh show IAM-P0-002`
  - `scripts/ai-status.sh show IAM-IDP-001`
  - `scripts/ai-status.sh show IAM-IDP-002`
  - `scripts/ai-status.sh show IAM-CTR-001`
- Architecture / execution:
  - `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md`
  - `docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md`
- Repo baseline:
  - `apps/api/src/common/auth/jwt-auth.service.ts`
  - `apps/api/src/modules/auth/auth.controller.ts`
  - `apps/api/src/modules/auth/driver-device-session.service.ts`
  - `packages/contracts/src/iam-contracts.ts`
  - `apps/api/tests/integration/auth-startup-config.integration.test.ts`

---

## 5) Evidence Inventory

| ID | Evidence | Expected anchor |
| --- | --- | --- |
| `E-1` | Parent machine-truth snapshot | `scripts/ai-status.sh show IAM-SES-002` |
| `E-2` | Sidecar machine-truth snapshot | `scripts/ai-status.sh show IAM-SES-002-SIDECAR-ACCEPTANCE` |
| `E-3` | Durable session prerequisite | `scripts/ai-status.sh show IAM-SES-001` |
| `E-4` | Verified minting prerequisite | `scripts/ai-status.sh show IAM-P0-002` |
| `E-5` | OIDC callback / membership prerequisite | `scripts/ai-status.sh show IAM-IDP-001` |
| `E-6` | Workforce subject integration gate | `scripts/ai-status.sh show IAM-IDP-002` |
| `E-7` | Contract/error baseline prerequisite | `scripts/ai-status.sh show IAM-CTR-001` |
| `E-8` | Required identity/session claim list | `stage1-5-identity-access-account-security-hardening-plan-20260801.md:183-208` |
| `E-9` | Parent execution contract | `stage1-5-identity-access-account-security-execution-tasks-20260801.md:110-115` |
| `E-10` | Current JWT payload shape gap | `apps/api/src/common/auth/jwt-auth.service.ts:12-25`, `:189-215` |
| `E-11` | Current issuer/audience/algorithm verification baseline | `apps/api/src/common/auth/jwt-auth.service.ts:148-186` |
| `E-12` | Current controller JWT issuance wrapper | `apps/api/src/modules/auth/auth.controller.ts:569-588` |
| `E-13` | Current driver binding / refresh baseline | `apps/api/src/modules/auth/driver-device-session.service.ts:97-117`, `:179-233` |
| `E-14` | Current security event linkage to binding/token | `apps/api/src/modules/auth/driver-device-session.service.ts:118-151`, `:200-232` |
| `E-15` | Existing startup config integration smoke | `apps/api/tests/integration/auth-startup-config.integration.test.ts:33-97` |
| `E-16` | Current IAM operation catalog baseline | `packages/contracts/src/iam-contracts.ts:1-127` |

---

## 6) Reviewer Hotspots (`Gemini`)

Reviewer 應優先確認：

1. Packet 是否忠實保留 machine truth：parent `IAM-SES-002` 仍是 `in_progress`，不是 `review` 或 `done`。
2. Dependency map 是否同時區分 sidecar formal deps 與 parent practical gate，特別是 `IAM-IDP-002` PR #1253 尚未 merged to `dev`。
3. Acceptance framing 是否明確要求 `sid` / `jti` / `tokenVersion` / `auth_time` / `amr` / `acr` / `policyVersion` 全部由 server-owned durable state 投影，而非只驗證 `issuer` / `audience`。
4. Repo baseline 是否沒有 overclaim：目前 visible code 只有 issuer/audience/algorithm 與 driver binding groundwork，還看不到完整 revocation-aware claim enforcement。
5. Reviewer handoff wording 是否要求 executable evidence covering stale token, revoked token, restart survival, and 60-second invalidation, rather than only config smoke or unit-only happy paths.
6. Packet 是否完全侷限在 support artifact，沒有修改 canonical truth 或主線 runtime。

**建議核准用語：**

> `IAM-SES-002 acceptance packet approved: it keeps the parent task in in_progress state, correctly separates merged prerequisites (IAM-SES-001, IAM-P0-002, IAM-IDP-001, IAM-CTR-001) from the remaining IAM-IDP-002 integration gate, expands the parent acceptance into claim issuance/verification plus durable 60-second revocation checks, and accurately records that current repo-visible baseline only proves issuer/audience/algorithm and driver-binding groundwork rather than completed session-claim enforcement. Support artifact only.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / dependency-map drift / overclaimed repo baseline / missing 60-second revocation evidence framing / scope violation]`

---

## 7) Handoff Command

Owner（`Codex2`）完成 packet 後，交給 reviewer（`Gemini`）：

```bash
AI_NAME=Codex2 scripts/ai-status.sh handoff IAM-SES-002-SIDECAR-ACCEPTANCE Gemini "IAM-SES-002 acceptance packet ready at support/sidecars/IAM-SES-002/IAM-SES-002-SIDECAR-ACCEPTANCE.md. It freezes the parent in_progress snapshot, the merged prerequisite chain (IAM-SES-001, IAM-P0-002, IAM-IDP-001, IAM-CTR-001), the remaining IAM-IDP-002 PR #1253 integration gate, and the current repo baseline showing issuer/audience/algorithm verification plus driver-binding groundwork but not yet complete sid/jti/tokenVersion/auth_time/amr/acr/policyVersion enforcement. Support artifact only; no canonical truth changes."
```

---

## 8) Reviewer Actions

Reviewer（`Gemini`）核准：

```bash
AI_NAME=Gemini scripts/ai-status.sh approve IAM-SES-002-SIDECAR-ACCEPTANCE "IAM-SES-002 acceptance packet approved: it keeps the parent task in in_progress state, correctly separates merged prerequisites (IAM-SES-001, IAM-P0-002, IAM-IDP-001, IAM-CTR-001) from the remaining IAM-IDP-002 integration gate, expands the parent acceptance into claim issuance/verification plus durable 60-second revocation checks, and accurately records that current repo-visible baseline only proves issuer/audience/algorithm and driver-binding groundwork rather than completed session-claim enforcement. Support artifact only."
```

Reviewer（`Gemini`）退回：

```bash
AI_NAME=Gemini scripts/ai-status.sh reopen IAM-SES-002-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / dependency-map drift / overclaimed repo baseline / missing 60-second revocation evidence framing / scope violation]"
```

---

## 9) Owner Closeout

此 sidecar 經 reviewer 核准後，由 owner（`Codex2`）收尾：

1. Stage only `support/sidecars/IAM-SES-002/IAM-SES-002-SIDECAR-ACCEPTANCE.md`.
2. Create a task-scoped closeout commit whose subject contains `IAM-SES-002-SIDECAR-ACCEPTANCE`, and whose body includes `LLM-Agent:`, `Task-ID:`, `Reviewer:`, and `Verification:`.
3. Run a normal non-force push to `origin codex2/iam-ses-002-sidecar-acceptance`.
4. Only after commit + push succeed, record machine-truth closeout with `COMMIT_HASH`, `COMMIT_SUBJECT`, `PUSH_REMOTE`, `PUSH_BRANCH`, and the sidecar/support-only integration marker `INTEGRATION_STATUS=not_applicable`.

```bash
AI_NAME=Codex2 scripts/ai-status.sh done IAM-SES-002-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for IAM-SES-002 at support/sidecars/IAM-SES-002/IAM-SES-002-SIDECAR-ACCEPTANCE.md. The packet preserves the parent in_progress baseline, the merged prerequisite chain, the remaining IAM-IDP-002 integration gate, and the reviewer handoff guidance for revocable JWT/session-claim enforcement without changing canonical truth. COMMIT_HASH=<hash> COMMIT_SUBJECT=\"IAM-SES-002-SIDECAR-ACCEPTANCE: finalize approved acceptance packet\" PUSH_REMOTE=origin PUSH_BRANCH=codex2/iam-ses-002-sidecar-acceptance INTEGRATION_STATUS=not_applicable"
```

Parent absorption / 主線採納仍由 parent owner `Gemini` 決定，不由此 sidecar 自動推進；此 closeout 只代表 support branch packet 已提交並推送。

---

## 10) Change Log

- `2026-08-02T01:15Z` — 初版建立：依 shared machine truth task slices、Stage 1.5 architecture / execution docs、與 repo auth/session baseline 掃描，整理 `IAM-SES-002` 的 acceptance checklist、dependency map、current-gap evidence anchors、以及 reviewer / owner handoff 指引。內容明確保留 parent `in_progress` 狀態與 `IAM-IDP-002` PR #1253 integration gate，避免 support packet overclaim canonical implementation progress。
- `2026-08-02T01:25Z` — closeout 對齊：將 packet 狀態更新為 `review_approved`，並把 owner closeout 指引對齊實際流程，要求 task-scoped closeout commit、normal push、以及以 sidecar/support-only 規則的 `INTEGRATION_STATUS=not_applicable` 記錄 machine-truth `done`。
