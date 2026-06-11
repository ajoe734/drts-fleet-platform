# BANK-UI-AUDIT-20260610 Sidecar Review Packet

This packet supersedes the earlier stale review packet for `BANK-UI-AUDIT-20260610`. It is a support artifact only and does not change canonical truth.

## 1. Scope

- Task ID: `BANK-UI-AUDIT-20260610-SIDECAR-REVIEW`
- Parent task: `BANK-UI-AUDIT-20260610`
- Helper kind: `review_packet`
- Owner: `Codex`
- Reviewer: `Claude2`
- Mutates canonical: `false`

## 2. Correct machine-truth snapshot

`AI_NAME=Codex scripts/ai-status.sh show BANK-UI-AUDIT-20260610` on 2026-06-11 reports:

- Status: `done`
- Reviewer: `Claude2`
- Last update: `2026-06-11T11:36:50Z`
- Integration status: `merged_to_dev`
- Merge commit: `51f73e2c44ce97b7e18203770c60ac8dfd69ccaa`

The parent task was already closed before this corrective sidecar packet was prepared. The prior sidecar packet was materially wrong because it treated a stale worker branch snapshot as current machine truth and recommended reopening a task that had already been reviewed, closed, and merged.

## 3. What went wrong in the stale packet

### 3.1 The sidecar worktree is not current `dev`

At the time of this repair, this worker branch is divergent from `origin/dev`:

- `HEAD`: `0a32bf58a927ae9d61369386e49295c6dc42fc42`
- `merge-base HEAD origin/dev`: `ada56beac2cd0082dac4efc83ec63bba21459bf5`
- `git rev-list --left-right --count HEAD...origin/dev`: `3 5`

So the local tree used by the stale packet is not the same source of truth as the merged parent task.

### 3.2 The placeholder `/audit` page is only evidence of the stale branch

This worktree's `[apps/bank-console-web/app/audit/page.tsx](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-bank-ui-audit-20260610-sidecar-review/apps/bank-console-web/app/audit/page.tsx:1)` is still the old placeholder:

- imports `PendingScreen`
- returns only `PendingScreen title={t("audit.title")} purpose={t("audit.purpose")}`

That is not evidence against the parent task. It is evidence that this sidecar branch was not rebased to the merged parent result.

### 3.3 `origin/dev` contains the implemented audit screen

`git show origin/dev:apps/bank-console-web/app/audit/page.tsx` shows the merged implementation rather than a placeholder. The file includes:

- `Link` plus `PARTNER_BRAND_TOKENS`
- explicit `AuditEventType`, `AuditActorCode`, and `AuditReasonCode` unions
- sample audit rows with masked subjects such as `CH-****-4821`
- filter parsing for `type`, `actor`, `period`, and `subject`
- read-only related-entity links to bookings and statements
- masking checks implemented via `.some` / `.find` style logic rather than `[0]`

This matches the parent task summary and reviewer notes in machine truth.

## 4. Authoritative design evidence

The stale packet also incorrectly claimed the bank audit canvas did not exist. The authoritative `BK_Audit` canvas is commit-scoped evidence at:

- commit `4dad0cfa`
- path `docs/05-ui/drts-design-canvas/bank-screens-3.jsx`
- section starting at line `129`

`git show 4dad0cfa:docs/05-ui/drts-design-canvas/bank-screens-3.jsx` contains `function BK_Audit({ theme: th })` with the expected audit table columns:

- 時間
- 操作者
- 事件類型
- 主體 (遮罩)
- 結果
- 原因碼
- 連結實體

This is the source the parent task acceptance and review notes were referring to. Even if the file is not present in the stale sidecar branch snapshot, it is incorrect to report that no such canvas existed.

## 5. Parent task evidence already recorded in machine truth

The parent `done` record already includes the decisive closeout data:

- review passed by `Claude2`
- merged commit `51f73e2c44ce97b7e18203770c60ac8dfd69ccaa`
- `integration_status: merged_to_dev`
- validation recorded as:
  - `pnpm --filter @drts/bank-console-web build`
  - `pnpm --filter @drts/bank-console-web typecheck`
  - `python3 scripts/check_ui_realm_tokens.py`

This sidecar does not re-run those validations. Its purpose is narrower: correct the reviewer packet so it aligns with the already-recorded parent truth instead of contradicting it with stale-branch observations.

## 6. Reviewer handoff

For `Claude2`, the correct disposition of this sidecar is:

- treat it as a corrective packet that supersedes the earlier stale review artifact
- do not reopen `BANK-UI-AUDIT-20260610` based on the placeholder file in this stale branch
- use parent machine truth plus the cited merged-file / historical-canvas evidence as the review basis

Expected conclusion:

- the sidecar packet is now aligned with current machine truth
- the parent task remains correctly closed as `done` with `merged_to_dev`

## 7. Sidecar hygiene

- Task-owned file: `support/sidecars/BANK-UI-AUDIT-20260610/BANK-UI-AUDIT-20260610-SIDECAR-REVIEW.md`
- No canonical truth, runtime code, or machine-truth files were edited by this support packet
