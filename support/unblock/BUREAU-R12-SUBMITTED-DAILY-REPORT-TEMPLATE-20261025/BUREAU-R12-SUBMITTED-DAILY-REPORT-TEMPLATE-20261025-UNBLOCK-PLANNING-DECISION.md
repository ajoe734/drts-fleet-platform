# R12 planning disposition and original hosted acceptance route

- Task: `BUREAU-R12-SUBMITTED-DAILY-REPORT-TEMPLATE-20261025-UNBLOCK-PLANNING-DECISION`.
- Parent: `BUREAU-R12-SUBMITTED-DAILY-REPORT-TEMPLATE-20261025`.
- Owner/reviewer, helper and parent: Codex/Claude2.
- Investigation date: 2026-10-27 UTC.
- Assigned branch: `codex/bureau-r12-submitted-daily-report-template-20261025-unblock-planning-decision`.
- Read baseline: `51628b2b078d07ec759e0804448f7815bbc812ee` (`origin/dev` at fetch).
- Delivery state: planning documents prepared; guarded machine-truth writes below remain a prerequisite to handoff. Parent runtime acceptance remains blocked.

## Decision and authority

There is no outstanding product/contract choice in the current parent blocker.
Route the missing original hosted execution prerequisites; do not reopen the
settled template question or infer that this helper can grant runtime acceptance.

1. Preserve the v5 task specification's existing user-directed disposition.
   Its recorded instruction at `2026-10-25T16:31:51.399447+00:00` is
   「沒有這個檔案，你自己找規範，如果沒有的話就跳過，表示不用做」.
   The unsupported daily Attachment 5 identity/version/strict-format requirements
   remain superseded/SKIP, never PASS. The accepted report identifies that
   attachment as the monthly vehicle-change roster. This is a record of prior
   accepted scope authority, not a new legal determination or waiver.
2. Preserve applicable daily-record fields, existing reporting/download behavior,
   the recorded three-month daily-record duty and the separate R11 trip-record
   duty. [PRD §9.10.1](../../../phase1_prd_detailed_v1.md),
   [SA §§11.4, 13.1–13.2](../../../phase1_system_analysis_v1.md) and
   [service contracts §3.12](../../../phase1_service_contracts_v1.md) retain
   reporting, storage strategy, background jobs and controlled artifact access.
   The v5 task spec carries the narrower R12 acceptance contract.
3. Preserve the already-recorded date policy: `serviceDate` is the Asia/Taipei
   date of `reservationWindowStart ?? createdAt`, raw UTC timestamps unchanged;
   existing persisted-day reconciliation remains required. No new timezone choice.
4. **New scope cuts: none.** Preserve the original ten R12 cases, original
   59-case/14-requirement and other full-goal denominators and HOLD boundaries.
   This helper adds no source writer, runner, deployment or user approval gate.
   Passenger APP remains the previously recorded next phase.

## Current machine truth and source inventory

Current-release `show` readback finds the parent **blocked**, generation
`92fbfe27458243e48650b5dab21bd7bd`, candidate `not_applicable`. The first two
acceptance keys already have independent evidence; preserve them unchanged:

- `bureau_r12_applicable_daily_rules_and_template_disposition_verified`.
- `bureau_r12_required_field_date_retention_mapping_verified`.

The remaining key is
`bureau_r12_actual_same_release_existing_daily_download_verified`.
Source mapping, law research, renderer tests and this planning packet cannot
satisfy it.

The newer source child
`BUREAU-R12-EXISTING-OWNED-REMAINING-ROW-AND-RESERVATION-COVERAGE-20261027`
has exact candidate/review SHA `e412842e72a50d30ce3d1382b48870720ed27729`,
successful CI, [PR #3082](https://github.com/ajoe734/drts-fleet-platform/pull/3082)
merged as `51628b2b078d07ec759e0804448f7815bbc812ee`, and accepted source key.
It remains blocked solely on its runtime key. The older download child has
candidate/review `27b7fb31d3777c5e986d54990b2f5a69f497635e`, successful CI,
[PR #3074](https://github.com/ajoe734/drts-fleet-platform/pull/3074), merge
`da7c5d8c9a405107ccac6a6320aa090479107e31`, accepted source key and pending runtime.
These task slices supersede older parent prose saying e412 CI was pending.
They do not establish deployment or actual downloads.

Read actual baseline sources in addition to the receipts:

| Source/symbol                                                                                                                   | Verified boundary                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/reporting-filing/reporting-filing.controller.ts`, tenant job/list/detail/artifact routes                  | Existing tenant report entry points; no new endpoint needed.                                                            |
| `reporting-filing.service.ts`, daily provider, `prepareReportJob`, `listReportJobs`, `assertReportJobTenantScope`               | Daily provider exists; authoritative tenant scope is imposed on filters and foreign job scope is refused.               |
| `apps/api/src/common/auth/auth.policy.ts`, tenant reporting policy                                                              | GET requires `reports:read`, writes require `reports:write`; tenant/platform realms.                                    |
| `apps/api/src/modules/auth/auth.controller.ts`, `resolveCiTenantActorGrant` call and active tenant-user check                   | Issuance requires exact grant and active durable user; creating a tenant is not login authority.                        |
| `infra/migrations/V0034__phase1_delta_supply_eligibility_mobile_reporting.sql`, `reporting.dispatch_daily_records`              | Durable daily table, key `(service_date, order_id)`; table definition alone is not operational retention/restore proof. |
| `apps/api/src/common/evidence-governance.ts`, `report_artifact`, controlled download metadata                                   | Artifact hot/archive policy and 15-minute URL metadata are distinct from daily-table retention.                         |
| `tests/e2e/owned-referral-business-journey/daily-report-downloads.ts` and original managed FULL, as audited on exact e412 below | Reuse original same-source hosted reporting path; this helper does not run browser or services on this VM.              |

## Concrete follow-through and resume conditions

Supervisor coordinates the original sole shared-dev operator and original
IAM/setup/runtime owners, retaining their existing task scopes. This helper
does not grant new cloud, fixture or product-source write authority.

| Cases    | Existing contract and immediate action                                                                                                                                                                                                                                       | Required evidence before acceptance                                                                                                                                                                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TEN01–06 | Preserve the original accepted source changes and their original owners/reviewers. Select one immutable deployed source S containing them, establish all required service revisions/traffic and PG-enabled durable-source configuration, then use the original managed FULL. | Real chosen/empty-day, Taiwan-midnight, reservation/cancellation/reassignment and unknown-value cases under the original ten-case definitions, with job IDs, three downloaded formats, custody and owned cleanup. No source reopening for absent runtime evidence.                    |
| TEN07    | Exact-e412 audit finds the existing source sufficient. Operator uses the existing Ops UI rebuild/list/detail and three-format download route.                                                                                                                                | Same-S actual UI/API, PG, three job/file bytes, manifests/custody and cleanup. No second implementation or runner.                                                                                                                                                                    |
| TEN08    | Operator first establishes whether a lawful isolated reversible source read/write fault fixture exists. If absent, Supervisor coordinates precise original runtime/source-owner scope before implementation.                                                                 | Actual failure, no false UI success/ACK, restoration, normal retry and canonical readback/download. Natural-failure diagnostics alone do not prove recovery. Do not disrupt the shared DB.                                                                                            |
| TEN09    | Original runtime/storage owner binds actual daily-table persistence/retention/backup/restore controls to S and the environment.                                                                                                                                              | Time-anchored preserved/recovered controlled records and applicable configuration; no arbitrary wait for three months if the actual controls and restore evidence establish the duty. A short same-run reload, report-artifact 30/365-day policy or URL expiry alone is insufficient. |
| TEN10    | Operator first checks existing provisioned different-tenant active principals and exact issuer grants through its existing authorized read-only path, without printing secrets. If unavailable, Supervisor coordinates original IAM/setup owner and exact fixture scope.     | Two true differently tenant-bound sessions, each own report/download, foreign detail/artifact denial, no list leakage and real no-report/cross-realm denial. Revoke only sessions minted by this run.                                                                                 |

The TEN10 audit observes zero tenant application sessions in the original FULL
setup. Separate deploy-dev actors 901/902 are both tenant201 and their job-local
sessions cannot be borrowed. Documentation/migrations prove only those fixtures;
live registry contents were not read, so a second legitimate existing grant is
**unknown**, not proved absent. `tenant_viewer` has report-read permission and is
not a no-read negative control. Local bootstrap or fabricated headers cannot
replace true shared-dev identity. Avoid ad-hoc tenants without a safe cleanup
lifecycle and do not revoke other runs' sessions or global grants.

Only fresh actionable evidence for these prerequisites permits Supervisor to
resume the original blocked runtime lifecycle. Preserve exact candidate,
generation, review, CI, merge and accepted source evidence when restoring
acceptance; do not dispatch a fresh implementation/start/handoff against completed
source work. Run no product, preview, browser, PG or Compose services on this VM.
This helper performs no hosted dispatch or deployment.

## Evidence references and hashes

Machine-specific evidence root:
`/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T-current-frontier/`.
Files are linked by absolute location and hash instead of copied into canonical docs.

| File under that root                                                                                                   | SHA256, verified this investigation                                |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `BUREAU-R12-SUBMITTED-DAILY-REPORT-TEMPLATE-20261025.v5-five-doc-evidence-leaves-new-source-date-proof.task-spec.json` | `6d1b2a48bda29b2e344584bdb196907acdac7e5bf8789ddd4571055510f80f7c` |
| `Root-R12-applicable-rules-field-map-and-download-20261025.json`                                                       | `0c95549395cb5a0e8d07d48bf8e15b7bd84bcef1d1ffd341504e13b8814485e1` |
| `Root-R12-exact-e412-TEN07-source-sufficient-TEN08-10-original-runtime-boundaries-readonly-audit-20261027.json`        | `40e0806e81ba2dc44f679f736b6659a6633dc78a5f98aa8a4a8fcb738b8aa72d` |
| `Root-R12-TEN10-actual-original-FULL-session-issuance-report-type-and-cleanup-authority-readonly-20261027.json`        | `460725b2f001c90cb13e480a9d6b4803d6ba5ee96f7e3d88bc0516e3266ea58d` |

The parent `daily_date_policy_decision` also references the original date-decision
receipt hash `68b741c6cc04f5290c4b0dd4920f7c0fa25db8c22601ea26df0b73cc24b1fe2d`.
That hash is quoted from machine truth, not independently reverified here.

## Guarded machine-truth request — prerequisite to helper handoff

Both attempted transactions used the dispatched identity `AI_NAME=Codex` and the
specified release CLI; both exited 1 without applying the requested change:

- Helper `assign` with disposition metadata: `Dispatched workers must use their assigned task lifecycle commands`.
- Parent `note`: `Dispatched worker cannot mutate a different task`.

This is a dispatch-authorization guard, not a request for user approval. Do not
clear dispatch environment variables or impersonate Supervisor. The real
Supervisor must apply these two writes and read back both single-task slices.
Preserve roles, candidate evidence, scopes and acceptance keys; do not resume.

```bash
CLI=/home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-22b51a04f524/tools/development-orchestrator/bin/ai-status.sh
PARENT=BUREAU-R12-SUBMITTED-DAILY-REPORT-TEMPLATE-20261025
HELPER=BUREAU-R12-SUBMITTED-DAILY-REPORT-TEMPLATE-20261025-UNBLOCK-PLANNING-DECISION
PARENT_NEXT='R12 規劃判定：無新增產品／契約決策或 scope cut；原附件五版型僅沿既有使用者指示 SKIP，保留三鍵、原十案及完整分母。Supervisor 協調原唯一 shared-dev operator：先唯讀確認 TEN10 兩個不同租戶 active principal 與精確 CI grant（不輸出 secret），再串行協調原 IAM/setup owner；TEN08 需合法隔離可恢復 source fault，TEN09 需 daily table 三月保存設定與時間錨 PG/backup/restore 實據。沿原 PG-enabled managed FULL、同 immutable S 驗 TEN01–10、正常 UI、三格式 bytes/custody/owned cleanup。e412/PR3082 已 source accepted/CI green/merged，勿重開 Source；runtime 與 Key3 維持 blocked，僅有新 actionable evidence 才由 Supervisor 依原 lifecycle 恢復。詳 support/unblock/BUREAU-R12-SUBMITTED-DAILY-REPORT-TEMPLATE-20261025/BUREAU-R12-SUBMITTED-DAILY-REPORT-TEMPLATE-20261025-UNBLOCK-PLANNING-DECISION.md。'
TASK_METADATA_JSON="$(jq -cn --arg next "$PARENT_NEXT" '{resolved_parent_status:"blocked",resolved_parent_waiting_for:"Codex",resolved_parent_next:$next}')" \
  AI_NAME=Supervisor "$CLI" assign "$HELPER" Codex Claude2
AI_NAME=Supervisor "$CLI" note "$PARENT" "$PARENT_NEXT"
"$CLI" show "$HELPER" | jq '{id,status,owner,reviewer,resolved_parent_status,resolved_parent_waiting_for,resolved_parent_next}'
"$CLI" show "$PARENT" | jq '{id,status,next,waiting_for,candidate_sha,candidate_generation,required_acceptance,acceptance_evidence}'
```

Do not write `resolved_parent_at`; the helper merge lifecycle owns that timestamp.
Until both writes succeed, report progress and keep this helper out of candidate
handoff, because its default merge resolution could otherwise resume the parent.

## Delivery-quality verification ledger — guide §0.7

| Finding / acceptance                                        | Source and change                                                                            | Before → current result                                                                                                                                                              | Command / result / evidence                                                                                                             | Unverified boundary                                                              |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Resolve or route missing decision; record decision          | v5 authority/requirements, current parent slices; this packet and `PHASE1_OPEN_QUESTIONS.md` | Planning label lacked durable disposition → retained existing decisions and routed concrete runtime prerequisites. Documentation-only; old/new behavior reproduction not applicable. | Release `show` parent/helper/two children exit 0; source reads and four `sha256sum` values above exit 0.                                | No new legal lookup, runtime acceptance or product behavior claim.               |
| Scope cut or explicit follow-up                             | Existing three keys, ten cases; follow-through table                                         | No new scope cut; existing unsupported-format SKIP preserved; runtime keys still unmet.                                                                                              | Parent spec/acceptance evidence and exact-e412/TEN10 receipts read; hashes match.                                                       | Actual TEN01–10 same-S runtime remains pending.                                  |
| Parent concrete next step and safe helper merge disposition | Guarded-write request above                                                                  | Both writes attempted → rejected by release guard, exit 1; exact request persisted via this helper `progress`.                                                                       | Error strings above; real Supervisor readback required before handoff.                                                                  | Acceptance not yet satisfied; do not describe parent update as completed.        |
| Task-scoped canonical delivery                              | Only this packet and Open Questions R12 entry                                                | Branch/commit/push/PR required before yielding.                                                                                                                                      | Final publication receipt, narrow formatting/diff checks and remote/PR SHA verification are recorded below and in helper machine truth. | Reviewer approval, CI/merge and guarded state writes are separate pending gates. |

No tests of product code are needed for this documentation-only change. No
browser/server checks were started, and no in-progress background test is being
reported as passed. A PR is not itself a completed helper or parent acceptance.

## Publication and scoped check receipt

- Anchor `1ca1f44a1f1686421d205dcfb6cf6dc7c1529149` was committed on the assigned
  branch and normally pushed to origin; push exit 0.
- [Draft PR #3089](https://github.com/ajoe734/drts-fleet-platform/pull/3089)
  targets `dev`. The draft explicitly holds for the two Supervisor state writes.
- `pnpm exec prettier --check PHASE1_OPEN_QUESTIONS.md support/unblock/BUREAU-R12-SUBMITTED-DAILY-REPORT-TEMPLATE-20261025/BUREAU-R12-SUBMITTED-DAILY-REPORT-TEMPLATE-20261025-UNBLOCK-PLANNING-DECISION.md`:
  PASS, exit 0.
- `git diff origin/dev...HEAD --check`: PASS, exit 0.
- `python3 tools/ci/git/check_commit_trailers.py --base 51628b2b078d07ec759e0804448f7815bbc812ee --head HEAD`:
  PASS, exit 0 on the anchor; repeat on the final publication below.
- Only the two planning files above are changed. Four existing evidence hashes
  were checked successfully; no product tests, hosted dispatch or deployment
  were initiated by this worker. Automatic PR CI is separate, not claimed PASS.
- This receipt is committed separately after the anchor. The resulting final
  full SHA, ordinary push result, remote branch / PR-head equality and repeated
  narrow checks are captured without self-referential hashes in
  `/home/lupin/workspace/drts-fleet-platform/.local/unblock/BUREAU-R12-SUBMITTED-DAILY-REPORT-TEMPLATE-20261025-UNBLOCK-PLANNING-DECISION/publication.json`
  and the helper's release-CLI progress note.
- `CANDIDATE_SHA` / `CANDIDATE_BRANCH` handoff to Claude2 remains pending the
  Supervisor writes and readback. No candidate was locked and no `done` command
  was called. The original parent remains blocked on actual hosted evidence.
