# SR-ADMIN-ADAPTER-001 Unblock History Repair

## Scope and Result

- Helper task: `SR-ADMIN-ADAPTER-001-UNBLOCK-HISTORY-REPAIR`
- Parent task: `SR-ADMIN-ADAPTER-001` (`平台轉接器登錄 API 接線及到期真值`)
- Owner: `Gemini` (Helper), `Codex` (Parent)
- Reviewer: `Codex2`
- Audit timestamp: `2026-09-08T13:08:00Z`
- Parent branch audited: `origin/codex/sr-admin-adapter-001 @ 47dd8e5c55fb54f1cb755a93125b19a3cd17e6da`
- Current integration base: `origin/dev @ 8e97268c7ec38258b393b8e8931d960009aab9fb`
- Associated Pull Request: `#1640` (`[ReviewBus] SR-ADMIN-ADAPTER-001 平台轉接器登錄 API 接線及到期真值`, state: `OPEN`)
- Associated Planning Decision PR: `#1671` (`claude2/sr-admin-adapter-001-unblock-planning-decision`, state: `OPEN`)

Parent task `SR-ADMIN-ADAPTER-001` is blocked by a dual-lineage git history contamination, trunk drift against `origin/dev`, and a misclassified i18n scope blocker on PR `#1640`.

1. **Non-linear dual-lineage merge contamination**: Rebased parent rail (`0132dd371`) was joined with the historical pre-rebase rail (`813c794f8`) via synthetic merge commit `cd5ef2a96` (`fix(SR-ADMIN-ADAPTER-001): preserve rebased candidate lineage`), duplicating all task commits in the commit graph.
2. **Trunk divergence**: The published ref `origin/codex/sr-admin-adapter-001` is 6 commits behind current `origin/dev` (`8e97268c7`) and contains 11 unmerged commits (`git rev-list --left-right --count origin/dev...origin/codex/sr-admin-adapter-001` yields `6 11`).
3. **i18n-guard CI failure on PR #1640**: `REGISTRY_NOTICE_COPY` inside `apps/platform-admin-web/app/adapter-registry/registry-notice.ts` declares an inline `{ en, zh }` object, triggering AST rule `inline-bilingual-map`. The parent owner believed moving copy required supervisor expansion into central `apps/platform-admin-web/lib/translations.ts`. However, `tools/ci/i18n-guard.mjs` explicitly ignores any file named `translations.ts` in app subdirectories. Placing the copy in `apps/platform-admin-web/app/adapter-registry/translations.ts` satisfies the guard completely while remaining 100% within the declared task `write_scopes`.
4. **Planning resolution available**: Planning unblock decision `SR-ADMIN-ADAPTER-001-UNBLOCK-PLANNING-DECISION` (PR `#1671`) already resolved the design canvas boundary: the 3 missing forms (registration, config edit, credential edit/rotate) are cut from this task's scope per Q-ADM17 since canvas artwork is missing. The deliverable is real persisted registry CRUD, list/detail read, real four-state expiry (unknown/valid/expiring/expired), and the existing canvas's enable/disable/pause/resume actions.

The non-destructive repair preserves `origin/codex/sr-admin-adapter-001 @ 47dd8e5c5` as audit evidence without force-pushing, reconstructs a clean linear branch from `origin/dev @ 8e97268c7`, resolves the local translation structure, and opens a clean replacement PR.

---

## Exact Contamination Breakdown

### 1. Dual-Lineage Merge Contamination (`cd5ef2a96`)

On 2026-09-08, after rebasing the parent WIP commits onto `70355aba97c23dd1cd592b71f1d3dfe6315d91ff`, the parent owner attempted to preserve lineage to the machine-truth `reconstruction.branch_head` (`813c794f8e96b7f7a364a23372fe20a81a6f170e`) by creating merge commit `cd5ef2a9682c8f3f9dcf09c52ea626a75a9e0c42`.

```
* 47dd8e5c5 (origin/codex/sr-admin-adapter-001) wip(SR-ADMIN-ADAPTER-001): anchor candidate CI scope blocker
*   cd5ef2a96 fix(SR-ADMIN-ADAPTER-001): preserve rebased candidate lineage
|\  
| * 813c794f8 wip(SR-ADMIN-ADAPTER-001): record verified notice fix and authority blockers
| *   7583a7717 wip(SR-ADMIN-ADAPTER-001): preserve published anchor after dev rebase
| |\  
| | * b93ab98f0 wip(SR-ADMIN-ADAPTER-001): anchor truthful registry notices and scope findings
| * 2d42d5c4f wip(SR-ADMIN-ADAPTER-001): anchor registry regression and HTTP reproduction
| * cc8073d5b wip(SR-ADMIN-ADAPTER-001): anchor truthful registry notices and scope findings
* 0132dd371 fix(SR-ADMIN-ADAPTER-001): refresh rebase verification evidence
* 5a8c0f73b wip(SR-ADMIN-ADAPTER-001): record verified notice fix and authority blockers
* 3bf7ecc44 wip(SR-ADMIN-ADAPTER-001): anchor registry regression and HTTP reproduction
* 966b03efd wip(SR-ADMIN-ADAPTER-001): anchor truthful registry notices and scope findings
* 70355aba9 (base on dev) GCP-TOS-REMEDIATION-20260907 (#1710)
```

#### Dual-Rail Comparison Table

| Rail | Commits | Base / Lineage | Status / Consequence |
|---|---|---|---|
| **Original 9/6 Rail** | `b93ab98f0`, `cc8073d5b`, `2d42d5c4f`, `7583a7717`, `813c794f8` | Base: `3014f9a49` (historical dev) | Recorded in `ai-status.json` as `reconstruction.branch_head: 813c794f8`. Contains duplicate patch content and earlier merge commit `7583a7717`. |
| **Rebased 9/8 Rail** | `966b03efd`, `3bf7ecc44`, `5a8c0f73b`, `0132dd371` | Base: `70355aba9` | Cleanly rebased linear sequence of task changes. |
| **Contaminated Merge** | `cd5ef2a96` (parents `0132dd371` + `813c794f8`) | Merges both rails | `git diff --stat 0132dd371 cd5ef2a96` is completely empty (0 files changed). Synthetic merge introduces duplicate ancestry and 1,428 files of historical diff between parents (`813c794f8` vs `cd5ef2a96`). |
| **Current Head** | `47dd8e5c5` | Parent: `cd5ef2a96` | Anchored on top of contaminated merge; pushed to `origin/codex/sr-admin-adapter-001`. |

`git show --format=raw cd5ef2a96` confirms two parents:
- Parent 1: `0132dd371f4d18d60f793dc0c12b168930597b07`
- Parent 2: `813c794f8e96b7f7a364a23372fe20a81a6f170e`

### 2. Trunk Drift and Divergence

Current integration trunk `origin/dev` has advanced to `8e97268c7` through six PR merges since `70355aba9`:
1. `b5c3774e5` (`UV-EXEC-009 本地停播、音訊時序與媒體控制權 fence (#1715)`)
2. `c9033856f` (`SR-BANK-002-UNBLOCK-HISTORY-REPAIR (#1734)`)
3. `9f5c81bd5` (`SR-CHANNEL-001 通路總覽匯出與對帳查詢 (#1730)`)
4. `3b60a3757` (`SR-TENANT-LOGIN-001 租戶登入 callback 與錯誤恢復 (#1674)`)
5. `99858938f` (`SR-PROOF-001-UNBLOCK-HISTORY-REPAIR (#1747)`)
6. `8e97268c7` (`SR-MAIL-001-UNBLOCK-HISTORY-REPAIR (#1748)`)

`git rev-list --left-right --count origin/dev...origin/codex/sr-admin-adapter-001` reports `6 11`. `origin/codex/sr-admin-adapter-001` is 6 commits behind `origin/dev` and carries 11 unmerged commits.

### 3. Local Worktree and Branch Inconsistencies

- `refs/heads/codex2/sr-admin-adapter-001` points at `70355aba9` (stale reference directly on dev, containing no task code).
- `refs/heads/gemini2/sr-admin-adapter-001-unblock-history-repair` was created at `b5c3774e5` and abandoned.
- `ai-status.json` records `reconstruction.branch_head: 813c794f8`, creating confusion when compared against the published remote head `47dd8e5c5`.

### 4. CI Failure and Scope Analysis on PR #1640

CI on PR `#1640` failed on `i18n-guard`:
- `tools/ci/i18n-guard.mjs` checks for inline `{ en, zh }` object literal dictionaries (`rule: inline-bilingual-map`).
- `apps/platform-admin-web/app/adapter-registry/registry-notice.ts` lines 5–18 declared:
  ```typescript
  export const REGISTRY_NOTICE_COPY = {
    en: { ... },
    zh: { ... },
  };
  ```
- Line 89 of `tools/ci/i18n-guard.mjs` specifically contains:
  ```javascript
  if (!SOURCE_EXTENSIONS.has(extension) || entry.name === "translations.ts") {
    continue;
  }
  ```
- Sub-app local translations files (e.g. `app/users/translations.ts`, `app/payments/[orderId]/translations.ts`, `app/p5-fare-anomalies/translations.ts`) are standard across `apps/platform-admin-web`.
- Creating `apps/platform-admin-web/app/adapter-registry/translations.ts` satisfies `i18n-guard` completely and falls strictly inside `write_scopes: ["apps/platform-admin-web/app/adapter-registry/", ...]`. No scope expansion to `lib/translations.ts` is required.

---

## Non-Destructive Repair Path

To preserve shared history and deliver a clean candidate without force-pushing:

### Step 1: Freeze Contaminated Remote Ref as Audit Record
Retain `origin/codex/sr-admin-adapter-001 @ 47dd8e5c5` as audit evidence. Do not `git push --force`, rebase in place, or reset the remote branch.

### Step 2: Establish a Clean Delivery Rail from `origin/dev`
The parent owner (or reassigned owner) branches from current `origin/dev`:
```bash
git fetch origin
git switch -c codex/sr-admin-adapter-001-clean origin/dev
```

### Step 3: Reconstruct Clean Linear Changes
Apply only the unique task-owned changes from the rebased sequence (`966b03efd`, `3bf7ecc44`, `5a8c0f73b`), omitting merge commit `cd5ef2a96` and anchor `47dd8e5c5`:

1. **Adapter Registry Notices & Local Translations**:
   - Create `apps/platform-admin-web/app/adapter-registry/translations.ts` to hold the bilingual copy for registry notices without fixed "2026-05-31" dates:
     ```typescript
     export const adapterRegistryTranslations = {
       en: {
         title: (code: string) => `${code} requires attention`,
         body: (name: string, credential: string, health: string) =>
           `${name}: credential status ${credential}; health ${health}.`,
         unknownExpiry: "Credential expiry time is unknown; upcoming expiry cannot be determined.",
       },
       zh: {
         title: (code: string) => `${code} 需要檢查`,
         body: (name: string, credential: string, health: string) =>
           `${name}：憑證狀態為 ${credential}，健康狀態為 ${health}。`,
         unknownExpiry: "憑證到期時間未知，無法判斷是否即將到期。",
       },
     };
     ```
   - Import from `./translations.ts` in `apps/platform-admin-web/app/adapter-registry/registry-notice.ts` and `page.tsx`.
2. **Regression Tests and Reproduction Script**:
   - Reconstruct `tests/unit/system-remediation/sr-admin-adapter-001/registry-notice.test.ts`, `registry-api-reproduction.ts`, and `registry-api-reproduction.tsconfig.json`.
3. **UAT Evidence Documentation**:
   - Update `docs/04-uat/system-remediation-20260906/SR-ADMIN-ADAPTER-001.md` reflecting the clean base and test outcomes.

### Step 4: Incorporate Planning Decision (PR #1671)
Follow the canonical boundaries established in `support/unblock/SR-ADMIN-ADAPTER-001/SR-ADMIN-ADAPTER-001-UNBLOCK-PLANNING-DECISION.md`:
- Scope cut on the three missing forms (registration, config edit, credential edit/rotate) due to absent canvas artwork.
- Implement real four-state expiry (unknown/valid/expiring/expired) computed dynamically from credentials, eliminating all hardcoded date warnings.
- Backend route implementation to be coordinated with the approved migration and contracts scope when implementing full CRUD.

### Step 5: Execute Local Verification
Run all validation checks locally to verify zero regressions:
```bash
git diff --check
node tools/ci/i18n-guard.mjs
pnpm --filter @drts/platform-admin-web typecheck
pnpm --filter @drts/api typecheck
pnpm exec vitest run tests/unit/system-remediation/sr-admin-adapter-001/
```

### Step 6: Commit, Push Normally, PR, and Candidate Handoff
1. Commit with task trailers:
   ```bash
   git commit -m "fix(SR-ADMIN-ADAPTER-001): clean truthful registry notice with scoped translations" \
     -m "LLM-Agent: Codex" \
     -m "Task-ID: SR-ADMIN-ADAPTER-001" \
     -m "Reviewer: Codex2"
   ```
2. Push without `--force`:
   ```bash
   git push -u origin codex/sr-admin-adapter-001-clean
   ```
3. Open a clean PR against `dev`:
   ```bash
   gh pr create --base dev --head codex/sr-admin-adapter-001-clean \
     --title "[ReviewBus] SR-ADMIN-ADAPTER-001 平台轉接器登錄 API 接線及到期真值 (clean delivery rail)" \
     --body "Supersedes #1640. Rebased onto current origin/dev, eliminates merge commit cd5ef2a96 contamination, resolves i18n-guard via local app/adapter-registry/translations.ts within write scope."
   ```
4. Close superseded PR `#1640` with reference to the new PR.
5. Handoff candidate SHA to reviewer:
   ```bash
   AI_NAME=Codex CANDIDATE_SHA=$(git rev-parse HEAD) CANDIDATE_BRANCH=codex/sr-admin-adapter-001-clean \
     /home/lupin/workspace/drts-fleet-platform/tools/development-orchestrator/bin/ai-status.sh \
     handoff SR-ADMIN-ADAPTER-001 Codex2 "Reconstructed clean linear rail on dev, fixed i18n-guard via local translations.ts, tests pass, ready for review."
   ```

---

## Machine Truth Update Performed

In accordance with Acceptance Criterion 4 ("Update the parent task with the concrete unblocked next step"), `ai-status.sh note` is updated on parent `SR-ADMIN-ADAPTER-001`:

```text
History repair identified origin/codex/sr-admin-adapter-001@47dd8e5c5 as contaminated by synthetic merge cd5ef2a96 joining old 813c794f8 and rebased 0132dd371 rails, lagging origin/dev by 6 commits. Preserve ref audit-only; unblock path: owner creates codex/sr-admin-adapter-001-clean from origin/dev, moves notice copy into app/adapter-registry/translations.ts (fixing i18n-guard within write scope), incorporates PR #1671 scope cut for missing forms, validates Vitest/typecheck, and performs normal push/PR/handoff. See support/unblock/SR-ADMIN-ADAPTER-001/SR-ADMIN-ADAPTER-001-UNBLOCK-HISTORY-REPAIR.md.
```

---

## Acceptance Criteria Verification Table

| Acceptance Criterion | Verification & Status |
|---|---|
| **1. Identify exact branch/worktree/commit contamination that keeps parent blocked** | **Audited & Verified**: Identified synthetic merge commit `cd5ef2a96` joining pre-rebase `813c794f8` with rebased `0132dd371`, 6-commit trunk lag against `8e97268c7`, 11 unmerged commits, and `i18n-guard` AST failure on inline bilingual map in `registry-notice.ts`. |
| **2. Repair or document non-destructive repair path without force-pushing shared history** | **Documented & Verified**: Documented complete 6-step non-destructive repair path with exact shell commands, local `translations.ts` fix within `write_scopes`, scope-cut alignment with PR `#1671`, and superseding PR strategy without force-pushing. |
| **3. Produce task-scoped commit/push/PR evidence for any canonical change** | **Committed & Pushed**: Task documentation committed to `gemini/sr-admin-adapter-001-unblock-history-repair`, pushed with normal non-force push, and PR opened. |
| **4. Update parent task with concrete unblocked next step** | **Executed**: Parent task `SR-ADMIN-ADAPTER-001` machine-truth `next` field updated via `/home/lupin/workspace/drts-fleet-platform/tools/development-orchestrator/bin/ai-status.sh note`. |
