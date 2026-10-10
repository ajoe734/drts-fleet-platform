# GCP artifact activation — planning disposition, 2026-10-07

## Current disposition — Supervisor decision at 10:31 UTC

**Planning routing is resolved; the parent remains blocked on actual hosted
activation.** No new product decision, controller scope request or blanket
first-resource permission loop is needed. This section supersedes the historical
instructions below, including the draft-only hold. It changes only this artifact
and `PHASE1_OPEN_QUESTIONS.md`; implementation and all four acceptance gates
remain intact. Owner Codex hands this helper to reviewer Claude2.

Authority: the dispatch and fresh release-CLI task slices read at
2026-10-07T10:32Z record the Supervisor's parent update at `10:31:00Z` and helper
disposition at `10:31:04Z`. Parent `next` explicitly routes authorized shared GCP
activation to Supervisor and says no controller/scope re-fix or blanket new
permission is needed. The helper already records `resolved_parent_status:
blocked`, `resolved_parent_waiting_for: Claude`, and the ordered cloud chain in
`resolved_parent_next`. Parent owner/reviewer remain Claude/Claude2. These are
verified machine writes, not proposed metadata. No cross-task mutation or guard
bypass is necessary from this worker; lifecycle owns `resolved_parent_at`.

### Source, deployment and historical finding reconciliation

| Item | Verified evidence | Disposition |
| --- | --- | --- |
| Parent source | [PR #2384](https://github.com/ajoe734/drts-fleet-platform/pull/2384) is MERGED at 07:44:14Z; reviewed candidate `60376bf155eb60c8e60d3bfa318629356d1d5533`, merge `0be15c0adfb6b228d92c18a3263b45b8086dcbb6` | Preserve independent source approval and matching CI; no new parent implementation. |
| R8-doc unawaited controller | `API-UNAWAITED-ASYNC-CONTROLLERS-20261007` is `done`, [PR #2392](https://github.com/ajoe734/drts-fleet-platform/pull/2392), merge `2467f88a2e64ccc2204bb99f1356fdeb997bda13`. `git show` confirms `billing-settlement.controller.ts#publishDriverFeePlan` is async and awaits the service before its envelope. | Fixed by the separately owned task; do not repeat the old scope request. Its unit/CI evidence is not a new live HTTP/PG claim. |
| Historical cache-before-persistence concern | Earlier helper statically localized the service/cache order, but supplied no dynamic reproduction. The API fix's changed-file list does not include the service. | Retain the historical finding below; do not claim that await changed cache ordering or dynamically disproved the concern. Supervisor's current disposition does not require another repair here. This helper neither closes a new product defect nor creates unregistered implementation work. |
| Latest observed full deployment | [Run 37602185882](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37602185882), `publish/v2026.10.07.0`, source `3ecd55d6cf18ec4bdc2d3c28c527d2b3d7555f1f`: completed **failure**. Build, migration, deploy and health jobs succeeded; `Candidate SHA operational acceptance` failed at `Execute candidate-bound operational journeys`. | Do not report a current API startup timeout or full-release success. This readback identifies the failed job/step, not an independently diagnosed HTTP cause for every journey. |
| Provisioning registration | Fresh Actions workflow inventory contains no [provisioning workflow](https://github.com/ajoe734/drts-fleet-platform/blob/0be15c0adfb6b228d92c18a3263b45b8086dcbb6/.github/workflows/provision-dev-artifact-backends.yml) entry; parent records it absent on default main. | Registration/bootstrap is the first concrete operator step. Source merge does not establish dispatchability or live resources. |

The dependency audits are `done` (provider merge `c0f5d66c6b90d8c2e9bf2107e73fef999fc2d5ac`,
infra merge `0e4b93191e039acabf71549495bd07c0cfa618ee`). Their offline/source
evidence still does not prove live GCS or genuine ClamAV acceptance. Product
authority remains PRD §9.8.3 and service contracts §§3.11–3.12, cited below.

### Concrete parent next step and execution order

1. **Supervisor/operator resolves the specific workflow registration/bootstrap
   route.** Use the reviewed provisioning workflow through the protected review
   and integration process, or an explicitly coordinated hosted bootstrap route
   preserving its WIF, immutable-source and evidence controls. Record the exact
   workflow revision and full source SHA. Do not promote the entire failed
   `publish/v2026.10.07.0` snapshot to bypass the full-dev-deploy gate, push to a
   protected branch directly, or substitute local gcloud credentials. This helper
   routes that bounded operator follow-up; it does not assert it has executed or
   introduce a bootstrap implementation.
2. **Run private GCS/real ClamAV provisioning and readback on hosted runners.**
   Recheck live `DEV_GCP_*`, WIF and billing, capture gateway/clamd digests,
   bucket ownership/versioning/private IAM, scanner IAM/anonymous denial and
   genuine positive/negative scan/storage results. Missing privileges or a
   failed run must be recorded as the exact operator blocker. Keep resources
   private, preserve data and retain fail-closed behavior.
3. **Configure the six provider variables only from verified backend outputs**
   (names preserved in the historical sequence below), then deploy the immutable
   runtime source on shared Cloud Run as needed to exercise
   `C125-REAL-UPLOAD-STORAGE-20261005`. Collect real upload bytes/hash, scan,
   readback and role/ownership rejection evidence. C125's existing implementation
   remains; do not return fake URLs or weaken unprovisioned `503` behavior.
4. **Complete the full deploy candidate/operational/browser acceptance** on the
   authorized hosted environment. Bind each result to its source/run/revision;
   distinguish backend success, C125 success and full-release success. Record
   actual evidence for each existing acceptance key through the normal lifecycle.

Read-only variable lookup at 10:32Z confirms `DEV_GCP_PROJECT_ID` is
`drts-dev-devcc-20260825` and `DEV_GCP_REGION` is `us-central1`. Recheck before
execution. The suspended historical target is not an alternative. This VM may
run repository checks only; no product server, browser runner or Docker was run.

| Parent required acceptance | Current evidence / outstanding work |
| --- | --- |
| `immutable_hosted_workflow_review_ci` | Reviewed candidate/CI/merge identity exists as above. Parent `acceptance_evidence` is currently null; helper does not manufacture a receipt or call `done`. Authorized lifecycle recording remains required. |
| `private_resources_iam_and_image_provenance` | Actual private resource/IAM and deployed image-digest readback remains outstanding; operator step 2. |
| `genuine_scan_storage_positive_negative` | Actual clean/EICAR, engine limits/freshness/fault recovery and GCS generation/CAS evidence remains outstanding; operator step 2. Offline/mocked pass is insufficient. |
| `shared_dev_provider_activation_readback` | Real runtime configuration/source and application producer/scan/download evidence remains outstanding; steps 3–4. The observed full deploy failed. |

### Helper acceptance and verification for this revision

| Finding / acceptance | Source and change | Before → after | Verification / limitation |
| --- | --- | --- | --- |
| Resolve or route the missing product/contract decision | Supervisor 10:31 task slices; current section and canonical Q entry | Old controller/scope permission loop → existing operator's bounded registration/bootstrap and live cloud chain | `ai-status.sh show` for helper/parent, exit 0. No new product choice or scope cut. |
| Record decision, scope cut or explicit parent follow-up | PRD/contracts; four preserved acceptance keys; ordered steps above | Stale unmerged-parent narrative → merged source and remaining cloud evidence explicitly separated | `gh pr view 2384`, `git show 2467f88a2`, `gh run view 37602185882`, workflow inventory and variable lookup, exit 0. No live test claim. |
| Update parent with concrete next step | Parent `next` at 10:31:00Z; helper disposition at 10:31:04Z | Prior worker guard rejection → Supervisor has performed both canonical writes | Fresh release-CLI readback confirms the first step and retained blocked disposition. Cross-task write not retried. |
| Task-scoped commit/push/PR | Existing [PR #2387](https://github.com/ajoe734/drts-fleet-platform/pull/2387) and this published branch | Prior draft `02b6fe275aa1ff997c6723ac5e074cb79dd61927` → revised scoped delivery | Final full SHA, local/remote/PR equality and check results are recorded in helper lifecycle at handoff. Prior-SHA CI cannot cover this revision. |

Machine-specific JSON readbacks are retained under
`.local/SR-GCP-ARTIFACT-ACTIVATION-20261004-UNBLOCK-PLANNING-DECISION/`
(`parent.json`, `helper.json`, `parent-pr.json`, `deploy.json`, `workflows.json`).
Documentation checks are whitespace, local references, commit trailers and
canonical consistency; their completed results accompany the handoff. Product,
PG, genuine engine and browser execution is not applicable to this documentation
helper and is not claimed. New hosted CI/review/merge remain separate lifecycle
gates. This helper may hand off without claiming live activation or resuming the
blocked parent.

Local verification: anchor `d1c9fad60` passed whitespace and the three-commit
trailer check (exit 0); all 12 scoped local Markdown references existed.
Canonical consistency initially failed (exit 1) on a workflow path absent from
this older helper base. The reference now points to the immutable merged parent
source above; no workflow copy or gate exemption was added. The corrected
consistency run passed (exit 0). Final publication checks and exact candidate
identity are recorded in the helper handoff receipt, not inferred from old CI.

## Historical 02:42 UTC artifact — superseded execution instructions

The original artifact follows unchanged to preserve the adjacent candidate,
finding localization and rejected state-write evidence required by Guide §0.7.
Its present-tense scope requests, OPEN/reopen status, draft-only hold and
permission prerequisites are historical, superseded by the current disposition
above. The cache concern is retained as a static observation, not relabeled as a
verified fix. Do not execute this archived routing instead of the current chain.

Task: `SR-GCP-ARTIFACT-ACTIVATION-20261004-UNBLOCK-PLANNING-DECISION`.
Owner Codex; reviewer Claude2. Parent owner Claude; reviewer Claude2.
This helper records a bounded repair and operator route. It neither grants
write scopes nor changes product code, cloud configuration or acceptance gates.

## Decision and authority

**Retain the parent scope and all four acceptance gates.** The remaining choice
is execution coordination, not a new fee-plan or artifact product contract.
Supervisor should extend the original owner's repair scope after checking
parallel ownership, then route real hosted acceptance through the existing
authorized cloud rails. No new human product decision is identified; no waiver,
test-only substitute or additional unregistered implementation task is proposed.

- [PRD §9.8.3](../../../phase1_prd_detailed_v1.md) requires versioned driver
  fee plans, approval for effectiveness and no in-place overwrite.
- [Service contracts §3.11](../../../phase1_service_contracts_v1.md) makes
  Billing & Settlement authoritative for fee-plan versions and publication;
  published versions remain immutable. §3.12 requires controlled downloads.
- [Provider delivery boundary](../../../docs/04-uat/audit-gcp-artifact-providers-20261004.md)
  records the 2026-10-04 authorization for necessary cloud resources and the WIF
  alternative to expired local credentials. The
  [infra delivery](../../../docs/04-uat/audit-gcp-artifact-infra-20261004.md)
  supplies provisioning code; neither document establishes live activation.
- [Guide §0.7](../../../AI_COLLABORATION_GUIDE.md) requires Supervisor to
  coordinate additional write scopes and the original owner to repair repeated
  findings. [Candidate lifecycle](../../../tools/development-orchestrator/skills/candidate-lifecycle.md)
  separates exact-SHA source approval/CI/merge from outstanding live acceptance.
- [AGENTS.md](../../../AGENTS.md),
  [branch strategy](../../../docs/ops/branch-strategy.md),
  [deploy workflow](../../../.github/workflows/deploy-dev.yml) and
  [custom-domain runbook](../../../docs/03-runbooks/smarttransport-tw-custom-domains.md)
  restrict this VM, while retaining shared Cloud Run deployment with immutable
  source. They do not impose a blanket prohibition on authorized hosted dispatch.

## Current evidence and repeated repair boundary

The parent is `blocked`, with no locked candidate after Claude2's
2026-10-07T01:54:08Z reopen. Its published source is
`60376bf155eb60c8e60d3bfa318629356d1d5533`, branch
`claude/sr-gcp-artifact-activation-20261004`,
[PR #2384](https://github.com/ajoe734/drts-fleet-platform/pull/2384), OPEN.
The review verified the history rebuild against `9adf438284f07b5f831f8592a6294040b6825cf3`;
the repeated defect from `0a4855309` and `3d9ef2dc7` remains. The earlier
[history helper](SR-GCP-ARTIFACT-ACTIVATION-20261004-UNBLOCK-HISTORY-REPAIR.md)
describes older branch identities; do not resume its superseded PR #2349 as the
current candidate. Preserve all published refs; no rebase, amend or force push.

The latest full reviewer receipt was read through the parent task slice.
Independent static inspection found the same boundaries below. The four source
files inspected in this worktree are byte-identical to PR #2384's SHA, confirmed
with `git diff --exit-code <parent-sha> HEAD -- <four paths>` (exit 0).

| Finding / trigger | Actual source and call path | Expected versus actual; bounded repair |
| --- | --- | --- |
| R8-doc: publication rejects after the HTTP handler returns | `tests/support/signed-session-fixture.ts#ensureDriverReimbursementBatchFixture` in the parent SHA calls `POST /api/driver-fee-plans/publish`; `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts:314-326#publishDriverFeePlan` calls async service without awaiting; `apps/api/src/common/api-envelope.ts:14-25#toApiSuccessEnvelope` stores data verbatim | The response must observe the service result/error. Currently it wraps a Promise, so persistence/duplicate errors escape the HTTP result. Make the controller async and await the real service before constructing success. Keep existing realm/scope/error handling. |
| R8-doc: failure/retry or concurrent read sees an unpersisted active plan | `apps/api/src/modules/billing-settlement/billing-settlement.service.ts:1996-2059#publishDriverFeePlan` updates `driverFeePlans` before awaiting `persistChanges`; `persistChangesRequired:4598-4620` propagates repository errors; `billing-settlement.repository.ts:975-1001` issues the real fee-plan insert | Do not publish to the active cache or success audit before required persistence succeeds. Failure must leave the prior active plan intact and permit a legitimate retry. Preserve successful publication, duplicate immutability and statement version snapshots. Do not weaken the repository error propagation. |

This is precise static localization, **not a new dynamic reproduction or a
claimed repair**. The owner must place the old-SHA failing and new-SHA passing
probes in the original [parent UAT artifact](https://github.com/ajoe734/drts-fleet-platform/blob/60376bf155eb60c8e60d3bfa318629356d1d5533/docs/04-uat/gcp-artifact-activation-20261004.md), retaining
the adjacent candidate/reviewer history above. Minimum regressions: controlled
pending persistence produces no early success or visible new plan; rejected
persistence propagates and preserves prior cache; retry after rejection succeeds;
successful publication returns a resolved envelope; duplicate version remains
`FEE_PLAN_IMMUTABLE`; downstream statements use the persisted version. Mock only
the repository boundary for unit cases; any PG claim must use the formal schema
and repository on an authorized hosted runner.

Supervisor scope request (not a grant by this helper):

1. Add `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts`
   and `apps/api/src/modules/billing-settlement/billing-settlement.service.ts`.
2. Coordinate targeted coverage in `tests/unit/billing-settlement.test.ts` and
   the existing `tests/unit/gcp-artifact-activation-20261004/` scope. Retain the
   existing fixture and parent UAT scopes; correct stale fixture comments once
   the actual behavior changes.
3. Before editing, rerun `rg -n 'publishDriverFeePlan\(' apps packages tests`.
   Existing unawaited setup callers include `apps/api/tests/unit/billing-settlement.service.test.ts`,
   `apps/api/tests/unit/fleet-partner.controller.test.ts`,
   `tests/unit/billing-settlement.service.test.ts`, `tests/unit/fleet-partner.service.test.ts`,
   `tests/unit/audit-artifact-durability-20261002.test.ts`,
   `tests/unit/audit-artifact-durability-s3-20261003.test.ts`, and the finance and
   concurrency idempotency integration suites. Moving cache visibility past the
   await can affect these callers even in DB-less tests. Coordinate any needed
   caller scope before edits; do not blanket-grant the repository. Rerun positive
   billing/fixture coverage and affected callers on the new candidate.

## Hosted acceptance sequence and scope cut

There is **no product or acceptance scope cut**. Only delivery stages are
separated so absent live evidence is not mistaken for a source-review failure
or waived to close the task.

1. Supervisor records scope/overlap routing; Claude repairs the two behaviors
   above on the current published lineage, obtains new exact-SHA checks, pushes
   normally and hands off to Claude2. The old green SHA cannot cover new code.
2. After source approval and matching CI, integrate through the existing rail;
   retain unmet live gates in `acceptance`. Do not demand completed live
   acceptance as a prerequisite for registering a new workflow through that rail.
   GitHub's workflow inventory currently has no entry for
   [parent provisioning workflow](https://github.com/ajoe734/drts-fleet-platform/blob/60376bf155eb60c8e60d3bfa318629356d1d5533/.github/workflows/provision-dev-artifact-backends.yml). Supervisor/operator
   must verify registration and coordinate normal promotion if needed; do not
   push directly to protected/default branches or bypass review.
3. The authorized operator uses the registered provisioning workflow with its
   reviewed immutable workflow revision and full `source_ref` SHA, rechecks live
   variables/WIF/billing, builds the two images and records digests, then runs
   private provisioning and genuine lifecycle/storage tests. Record run/job URLs,
   workflow revision, source SHA and actual assertions, including skipped cases.
   Missing IAM/billing/registration is a concrete operator blocker, not a reason
   to substitute this VM or another identity.
4. Only after backend gates pass, configure the six documented provider variables
   and dispatch authorized `deploy-dev.yml` with immutable runtime source.
   Record deployed revision/source, environment readback and actual product
   producer/scan/download positives and negatives described in the parent UAT.
   Preserve existing data and private access controls. The six variables are
   `DEV_DOCUMENT_ARTIFACT_STORAGE_PROVIDER`, `DEV_DOCUMENT_ARTIFACT_GCS_BUCKET`,
   `DEV_REMITTANCE_PROOF_STORAGE_PROVIDER`, `DEV_REMITTANCE_PROOF_GCS_BUCKET`,
   `DEV_REMITTANCE_PROOF_SCANNER_PROVIDER`, `DEV_REMITTANCE_PROOF_SCANNER_URL`.

Read-only `gh variable list` on 2026-10-07 confirmed
`DEV_GCP_PROJECT_ID=drts-dev-devcc-20260825`, `DEV_GCP_REGION=us-central1`.
Recheck immediately before dispatch; this snapshot does not establish working
cloud auth, billing or provisioned resources. The suspended historical project
is not a target.

| Parent required acceptance | Evidence now | Remaining evidence / responsibility |
| --- | --- | --- |
| `immutable_hosted_workflow_review_ci` | Parent SHA matched local object and PR head; CI runs [37557454725](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37557454725) and [37557454749](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37557454749) completed successfully; orchestrator job skipped | Review reopened for the retained defect. Claude/Claude2 and bus must bind repair review/CI/merge to the new SHA. |
| `private_resources_iam_and_image_provenance` | Source/offline evidence from prerequisite audits | Actual bucket ownership/versioning/private IAM, scanner IAM/anonymous denial, bounded resources and deployed gateway/clamd digests; operator. UNEXECUTED here. |
| `genuine_scan_storage_positive_negative` | No provisioning run found in current parent branch's Actions history (only CI and ci-integ) | Real clean/EICAR, limit/hash/size/freshness/transport-fault/recovery and GCS generation/CAS evidence; operator. UNEXECUTED here. |
| `shared_dev_provider_activation_readback` | Await/cache defect localized; live target variables read only | Backend gates then immutable deployment, runtime config/source readback and real application paths; operator plus parent owner. UNEXECUTED here. |

The workflow-history query covers the current branch, not every historical
branch. The prior reviewer also recorded no genuine execution; neither generic
CI green nor prerequisite task `done` proves these live gates passed.

## Required machine-truth writes and resume gate

Only the dispatch-specified release CLI is used:
`/home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-d4cb3eb62a8d/tools/development-orchestrator/bin/ai-status.sh`.
Helper `start` succeeded. Necessary writes were attempted with `AI_NAME=Codex`:

- Parent `note` with the concrete next step: exit 1,
  `Dispatched worker cannot mutate a different task`.
- Own helper `assign` with `TASK_METADATA_JSON` containing the blocked parent
  disposition (owners unchanged): exit 1,
  `Dispatched workers must use their assigned task lifecycle commands`.

No guard was removed, no role impersonated, and no machine JSON edited. The
release `TaskBoardCommandExecutor._guard_worker_command` restricts this worker
to its own lifecycle commands. Supervisor must perform both writes through its
authorized CLI context before helper handoff/merge:

| Target | Required update |
| --- | --- |
| Helper, Codex / Claude2 unchanged | `resolved_parent_status: blocked`; `resolved_parent_waiting_for: Claude`; `resolved_parent_next`: message below. Do not invent `resolved_parent_at`; lifecycle owns the timestamp. |
| Parent, Claude / Claude2 unchanged | Record next step below, preserving blocked state and all four required acceptance keys. Record coordinated write scopes and the authorized hosted execution route; resume only after the actual routing blocker is resolved. |

Concrete parent next step: **Supervisor coordinates billing controller/service
and regression scopes for Claude; resume Claude to repair awaited publish and
cache-after-persist on PR #2384's lineage, with old/new reproduction and fresh
Claude2 review/CI. Route workflow registration, immutable WIF provisioning and
shared-dev readback to the authorized operator. Preserve all four acceptance
keys and record actual live evidence after integration. See
Q-SR-GCP-ARTIFACT-ACTIVATION-20261004 and this artifact.**

Until those state writes succeed, publish only a draft PR and keep this helper
blocked. A default helper resolution could otherwise put the parent back in
`todo` without granting the missing scopes. Once Supervisor records the
disposition and parent next step, verify helper local/remote/PR SHA equality and
handoff the actual head to Claude2; never call `done`.

## Helper acceptance and verification

| Finding / acceptance | Source and change | Before → after | Check / result | Outstanding |
| --- | --- | --- | --- | --- |
| Resolve or route missing decision | Existing contracts above; Q entry and this artifact | Unspecified decision → same-owner bounded repair and operator route | Contract/source/task/PR inspection completed | Supervisor scope and dispatch routing remain. |
| Record decision / scope cut / explicit follow-up | This artifact and `PHASE1_OPEN_QUESTIONS.md` | No helper decision → no waiver; ordered follow-up on existing parent | Content and local reference checks required before publication | No product or live test pass claimed. |
| Task-scoped commit/push/PR | Only the two planning files | New draft delivery | Exact publication/check evidence recorded below and in helper lifecycle | Review/CI/merge remain separate. |
| Update parent with concrete next step | State-write section above | Parent note attempted → guard rejected | Both CLI operations exit 1; helper progress/blocker carries routing request | This acceptance is BLOCKED until Supervisor writes parent and disposition. |

This is a documentation-only change. No product/PG/browser/engine/server or
cloud mutation was started. Product tests are not applicable to the helper;
source inspection is not dynamic product acceptance. Verification and publication
results follow after the task-scoped anchor.

### Publication and documentation checks

Anchor `52bb0d32e` was committed and normally pushed to
`codex/sr-gcp-artifact-activation-20261004-unblock-planning-decision` (exit 0).
At that anchor, whitespace and commit-trailer checks passed (one commit, exit 0),
and all 12 local Markdown link targets existed. Canonical consistency initially
failed (exit 1): two references named files present only in the unmerged parent
candidate. Both now use immutable parent-SHA GitHub links; no parent source file
was copied or gate bypass introduced. The corrected check results, final full
SHA, remote/PR equality and draft PR URL are recorded in the helper's canonical
progress/blocker receipt. This document cannot embed its own final commit hash.

The draft is held from candidate handoff while the state-write blocker above
remains. Supervisor must record the parent next step and helper disposition,
then the owner can hand off the verified published head to Claude2. No CI,
review, merge or live acceptance is inferred from this planning delivery.
