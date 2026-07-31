# STAGE1-DEPLOY-VERIFY-20260731 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `STAGE1-DEPLOY-VERIFY-20260731` — Merge once deploy once and verify official services  
**Current Sidecar Owner:** `Codex2`  
**Assigned Reviewer:** `Gemini`  
**Parent Owner:** `Gemini` (reviewer `Codex2`)  
**Sidecar Task ID:** `STAGE1-DEPLOY-VERIFY-20260731-SIDECAR-ACCEPTANCE`  
**Last Revised:** `2026-07-31T21:30:00Z (UTC)`  
**Status:** `draft` — packet prepared for reviewer handoff.

---

## 1) Scope Boundary

本 sidecar 只整理 `STAGE1-DEPLOY-VERIFY-20260731` 的 acceptance checklist、dependency map、deploy/readiness framing 與 reviewer handoff 指引；不修改 canonical truth，也不代替 parent 任務執行正式 deploy、Cloud Run 驗證或 browser smoke。

- **In scope:** support-only acceptance framing、dependency/readiness 整理、official service verification matrix、reviewer checklist、evidence anchor。
- **Out of scope:** 修改 `.github/workflows/`、`scripts/`、`docs/04-uat/` 等 canonical artifact；實際 merge / deploy / gcloud inventory 操作；改寫 machine truth（`ai-status.json` / `current-work.md` / `ai-activity-log.jsonl`）。
- 本 packet 為 advisory support material；是否吸收進主線與 parent closeout，由 parent owner `Gemini` 決定。

---

## 2) Parent Task Framing (from machine truth)

以 `AI_NAME=Codex2 scripts/ai-status.sh show STAGE1-DEPLOY-VERIFY-20260731` 為準（讀取於 `2026-07-31T21:18Z`）：

- 父任務 `STAGE1-DEPLOY-VERIFY-20260731`：`status=in_progress`，Owner=`Gemini`，Reviewer=`Codex2`。
- 唯一正式 dependency：`STAGE1-RELEASE-CANDIDATE-20260731`。
- `next`：release candidate 已 merged to `origin/dev`（PR `#1210`，commit `2123330182d3a098305e6514512e3d3c38dd287f`），接著驗證 Cloud Run services、referral entry、本機 concierge 清理並收集 smoke evidence。

### Parent acceptance criteria (machine truth)

1. 確認 release PR review approved 且 required CI 全綠後才能 merge。
2. 依 repo 正式流程同步 `dev` 與 `main` 並觸發一次 deploy。
3. 驗證所有 official active Cloud Run URLs health auth boundary 及 browser smoke；Referral partner-scoped entry 必須可用。
4. 確認 Cloud Run 與本機 active inventory 均無 Concierge；只移除精確辨識的 retired concierge container。
5. 保存 run URL revision URL HTTP status 與 smoke evidence。
6. 外部四類 gate 完全排除且不影響 Stage 1 結論。

> 註：本 packet 只把 acceptance 展開成可執行檢查骨架，不宣稱任何 deploy 或 smoke 已完成。

---

## 3) Dependency Map & Readiness State

### 3.1 Formal dependency

| Dependency | Status | Owner / Rev | Integration evidence | Impact on parent |
| --- | --- | --- | --- | --- |
| `STAGE1-RELEASE-CANDIDATE-20260731` | `done` | `Codex2 / Gemini` | `merged_to_dev`; PR `#1210`; commit `2123330182d3a098305e6514512e3d3c38dd287f`; push ref `origin/dev`; tag `release/v2026.07.31.5` | Deploy-verify can start from a single reviewed dev baseline. |

### 3.2 Code-baseline check

- Worker branch `codex2/stage1-deploy-verify-20260731-sidecar-acceptance` currently points at `HEAD=2123330182d3a098305e6514512e3d3c38dd287f`.
- `origin/dev` also points at `2123330182d3a098305e6514512e3d3c38dd287f`.
- Therefore this packet was prepared against the same tree recorded by the release-candidate closeout, with no additional code delta required before parent deploy verification starts.

### 3.3 Parent-facing readiness summary

| Gate | Status | Notes |
| --- | --- | --- |
| Release candidate integrated to `dev` | ✅ READY | Machine truth records `merged_to_dev` at `2123330182…` for `STAGE1-RELEASE-CANDIDATE-20260731`. |
| Single-deploy baseline available | ✅ READY | Parent can use one reviewed baseline instead of reassembling multiple task branches. |
| Deploy verification evidence collected | ⛔ OPEN | Must be produced by parent task during actual deploy/run verification. |
| `main` sync + one deploy completed | ⛔ OPEN | Parent-owned execution step; not proven by this sidecar. |

---

## 4) Support Packet for Acceptance Execution

### 4.1 Official active Cloud Run surface derived from `deploy-dev.yml`

`deploy-dev.yml` currently treats the following 10 services as the intended active dev inventory:

1. `drts-dev-api`
2. `drts-dev-platform-admin-web`
3. `drts-dev-ops-console-web`
4. `drts-dev-fleet-partner-portal-web`
5. `drts-dev-tenant-console-web`
6. `drts-dev-bank-console-web`
7. `drts-dev-referral-embed-web`
8. `drts-dev-partner-booking-web`
9. `drts-dev-enterprise-dispatch-web`
10. `drts-channel-partner-portal-web`

The same workflow resolves URLs for each service, curls the top-level endpoints, and additionally validates:

- API health: `GET /health`
- referral entry path: `/embed/referral-demo-community`
- partner-booking paths: `/ctbc`, `/ctbc/program`, `/ctbc/program/embed`, `/cathay/program/embed`, `/taishin/program/embed`, `/dbs/program/embed`
- enterprise-dispatch paths: `/`, `/bookings/new`, `/embed/unsupported-host`

### 4.2 Referral acceptance anchor

- The deploy workflow emits `referral_embed_entry_slug`, defaulting to `referral-demo-community`.
- Health verification requires both:
  - direct entry success at `/embed/referral-demo-community`
  - root page content that still links back to that same entry path
- Parent acceptance line "Referral partner-scoped entry 必須可用" maps directly to this workflow behavior.

### 4.3 Concierge / retired-service acceptance anchor

`scripts/cleanup-retired-dev-service.sh` is fail-closed:

- it only allows action `none` or `delete-drts-passenger-web`
- it refuses deletion unless Cloud Run inventory matches exactly the 10 intended services plus retired `drts-passenger-web`
- unit coverage asserts cleanup must fail if `drts-concierge-portal-web` appears in inventory

Implication for parent acceptance:

- "active inventory 均無 Concierge" should be interpreted as a hard gate, not a soft observation
- any observed `drts-concierge-portal-web` must block cleanup success and be recorded as evidence
- deletion should remain limited to the precisely identified retired service only

### 4.4 Browser smoke anchor

`deploy-dev.yml` routes the deployed URLs into Playwright smoke suites including:

- `playwright.bank-console-depth.config.ts`
- `playwright.bank-console-auth.config.ts`
- `playwright.ops-console-parity.config.ts`
- `playwright.google-map-live.config.ts`
- `playwright.ops-assistant.config.ts`
- `playwright.fleet-partner-portal.config.ts`
- `playwright.partner-booking-surfaces.config.ts`
- `playwright.enterprise-dispatch.config.ts`
- `playwright.channel-partner-portal.config.ts`
- `playwright.referral-embed.config.ts`
- `playwright.platform-admin-service-area.config.ts`
- `playwright.dev-runtime-matrix.config.ts`

This gives parent a concrete minimal interpretation of "browser smoke" without inventing a new acceptance standard.

---

## 5) Acceptance Checklist Expansion

狀態欄刻意保留未勾選 `[ ]`；由 parent owner 在正式 deploy/verify 後填寫與附證據。

### AC-1 — release candidate / CI / merge gate

- [ ] Confirm `STAGE1-RELEASE-CANDIDATE-20260731` is `done` with reviewer approval.
- [ ] Confirm merge evidence still points to PR `#1210` and commit `2123330182d3a098305e6514512e3d3c38dd287f`.
- [ ] Confirm required CI was green on the merged release candidate before deploy execution.

### AC-2 — sync `dev` / `main` and deploy once

- [ ] Record the exact refs used to sync `dev` and `main`.
- [ ] Record the single deploy run URL and resulting deployed commit / revision identifiers.
- [ ] Confirm there was one intentional deploy event for this Stage 1 closeout, not multiple ad hoc redeploys.

### AC-3 — official Cloud Run URLs / auth boundary / referral entry

- [ ] Capture run URL + revision URL for all 10 official active services.
- [ ] Capture HTTP status for API `/health`.
- [ ] Capture HTTP/browser success for platform-admin, ops-console, fleet-partner-portal, tenant-console, bank-console, partner-booking, enterprise-dispatch, channel-partner-portal.
- [ ] Verify referral embed root loads and `/embed/referral-demo-community` remains reachable.
- [ ] Note any auth-boundary behavior explicitly when success is by redirect/login boundary rather than anonymous 200.

### AC-4 — no Concierge in Cloud Run or local active inventory

- [ ] Capture Cloud Run inventory at verification time and confirm no `drts-concierge-portal-web`.
- [ ] Capture local active inventory at verification time and confirm no Concierge runtime remains active.
- [ ] If retired-service cleanup runs, show it targeted only the precisely identified retired service and no broader deletion occurred.

### AC-5 — smoke evidence archived

- [ ] Save deploy run URL, revision URL, and per-surface HTTP status evidence.
- [ ] Save browser smoke evidence for the deployed surfaces and referral flow.
- [ ] Archive failure/exception notes, if any, with explicit indication whether they block Stage 1.

### AC-6 — external four-gate exclusions remain excluded

- [ ] Final summary explicitly names the excluded external four gate categories.
- [ ] Final summary states they do not affect the Stage 1 conclusion for this task.

---

## 6) Reviewer Checklist (`Gemini`)

- [ ] Packet stays within support-only scope and does not rewrite canonical truth.
- [ ] Dependency section correctly reflects `STAGE1-RELEASE-CANDIDATE-20260731` as the sole formal dependency and its `merged_to_dev` evidence.
- [ ] Official active service inventory matches the current `deploy-dev.yml` defaults.
- [ ] Referral acceptance mapping to `/embed/referral-demo-community` is accurate.
- [ ] Concierge cleanup interpretation matches `cleanup-retired-dev-service.sh` and its unit tests.
- [ ] Acceptance checklist expands parent machine-truth criteria without introducing new product requirements.

---

## 7) Evidence Anchors

- machine truth:
  - `AI_NAME=Codex2 scripts/ai-status.sh show STAGE1-DEPLOY-VERIFY-20260731`
  - `AI_NAME=Codex2 scripts/ai-status.sh show STAGE1-RELEASE-CANDIDATE-20260731`
- release-candidate integration evidence:
  - `git rev-parse HEAD`
  - `git rev-parse origin/dev`
  - `git merge-base --is-ancestor 2123330182d3a098305e6514512e3d3c38dd287f HEAD`
- deploy service inventory and health anchors:
  - `.github/workflows/deploy-dev.yml`
- retired-service / concierge gate:
  - `scripts/cleanup-retired-dev-service.sh`
  - `tests/unit/cleanup-retired-dev-service.test.ts`

---

## 8) Handoff

- Owner `Codex2` → Reviewer `Gemini`: support-only acceptance packet, no canonical truth edits.
- Intended use: parent owner `Gemini` can reuse §4 and §5 as the execution checklist while collecting real deploy evidence for `STAGE1-DEPLOY-VERIFY-20260731`.
- `INTEGRATION_STATUS=not_applicable` for this sidecar artifact itself; deploy/merge status remains parent-owned.
