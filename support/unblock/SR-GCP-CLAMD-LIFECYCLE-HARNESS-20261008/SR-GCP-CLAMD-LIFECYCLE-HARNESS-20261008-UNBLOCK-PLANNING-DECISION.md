# Clamd lifecycle harness: planning decision and acceptance route

Task: `SR-GCP-CLAMD-LIFECYCLE-HARNESS-20261008-UNBLOCK-PLANNING-DECISION`

Owner / reviewer: Codex / Codex2. Evidence inspected 2026-10-08 UTC.

## Decision

No missing product/contract choice and no acceptance scope cut is warranted.
The existing parent specification explicitly describes a source/harness repair,
not a new product decision. Its repair is already independently reviewed and
merged. Route the remaining work to Supervisor and the authorized Operator to
audit the completed hosted evidence and reconcile the existing acceptance keys.
Do not request another login, broaden IAM, redispatch the same workload, or
reopen source implementation merely because the parent remains `blocked`.

The parent remains Gemini2 / Codex. This helper changes only planning documents;
it does not change the original harness, its retained review findings, production
scanner behavior, cloud resources, or acceptance thresholds. The existing
[parent UAT ledger](../../../docs/04-uat/gcp-clamd-lifecycle-harness-20261008.md)
retains all six rejected candidates and F1a/F1b/F1c/F2. Its historical pending
CI/merge statements are superseded by the dated evidence below, not erased.
There is no new implementation backlog item to create.

Authority: `AI_COLLABORATION_GUIDE.md` §0.7 and candidate lifecycle;
parent `task_spec_ref` at canonical-root
`.local/full-system-continuation-20261008/auth-retry/SR-GCP-CLAMD-LIFECYCLE-HARNESS-20261008.md`
(recorded SHA256 `8434b8b164e580ecc483f1c6e993a25262fb9e06633d58766720bfb959d59274`),
especially “Authority and boundary”, F2, and the three original acceptance keys.
This decision refines execution routing and does not redefine product semantics.

## Verified source and hosted observations

- Prerequisites `SR-GCP-CLAMD-FOREGROUND-LOGGING-20261007` and
  `SR-GCP-GCS-VERIFIER-ERROR-CONTRACT-20261008` are canonically `done` for
  their source-only scopes; neither substitutes for parent live acceptance.
- [PR #2440](https://github.com/ajoe734/drts-fleet-platform/pull/2440) is merged:
  candidate/review/CI SHA `65d4285d4930f3625d4b8c3f4af4f5b1dd94f392`,
  merge `504550cb27a5c0c14e0304b88c95b1ad9cc6efac`.
  Canonical state records Codex review and matching successful CI.
- Existing Operator [run 37776386019](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37776386019),
  [job 113308209741](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37776386019/job/113308209741),
  completed successfully at **12:30:46Z**. Its definition is
  `publish/v2026.10.07.0` / `3ecd55d6cf18ec4bdc2d3c28c527d2b3d7555f1f`;
  the checkout and immutable-source step confirm the **65d4285 full candidate**.
  Workflow `headSha` identifies the definition, not the tested source.
- `Verify Hosted Backends` reports scanner and both document/remittance GCS
  suites passed. `Verify Genuine Clamd Lifecycle` reports **8 tests, OK, zero
  skips**: all three genuine controls, three framing controls and two HTTP
  boundary cases. The log explicitly records real **28136 → 28147** transition,
  pending activation, real RELOAD and gateway refusal/recovery evidence.
- Published image digests observed in that run: clamd
  `sha256:fec12c1700cb9ddfb961c170aac1cdfadc6b0f573abf38c1cfe56b79dc3242a7`;
  gateway `sha256:e0a97b39c2a2dc7a0caf13c3e89d9ac6d0d59fdaae67c7eac7956526a6d7c1bf`.
  Seed pull uses the immutable official index
  `clamav/clamav@sha256:57deb108fc4c72778aa83eafbca7bb7153e28c3f57c005afd38d31f16da86f23`.

These read-only observations supersede the parent's 12:24 `IN_PROGRESS` note
and the sibling manual-unblock document's “hosted unrun” snapshot. They do not
authorize a duplicate run or constitute formal acceptance recording.

## Remaining evidence and concrete next step

Supervisor / Operator should first audit this existing successful run:

1. Preserve candidate, review, CI and merge identity and attach terminal run/job
   evidence to the original parent UAT ledger through its authorized owner.
   Reconcile the blocked parent into acceptance through the existing lifecycle;
   do not clear its candidate or mark it `done` directly.
2. Check F2 explicitly: actual selected main/daily/bytecode files, their readable
   signed contents, immutable source and engine compatibility. In
   `TestGenuineClamdVersionTransition._extract_seed_database`, all six CVD/CLD
   names are attempted but only **any daily file** is asserted. This run's log
   shows only `daily.cvd` copied into the transition container. Therefore
   successful execution and attempted `docker cp` lines alone do not prove
   extraction/signature validation of all three seed families. Preserve this
   limitation; obtain existing content receipts or coordinate a bounded hosted
   evidence follow-up if missing. Do not fabricate headers or skip this gate.
3. Read back private IAM, scanner restoration and exact run-owned generation
   cleanup independently, with run-specific receipts. Successful cleanup log
   statements are not a substitute for those readbacks. This helper has not
   performed cloud readbacks or established those receipts.
4. Record each of the three existing keys only when its evidence is complete.
   Missing evidence stays explicit on this parent. Any source change requires
   original owner scope coordination, retained findings and a new exact-SHA
   review/CI/merge; this helper cannot expand product or workflow scopes.

| Original parent acceptance key | Observed evidence | Remaining disposition |
| --- | --- | --- |
| `lifecycle_harness_bounded_readiness_and_genuine_seed_source` | Merged repair; original UAT records 22 socket-free regressions; hosted daily transition succeeds | Formal source acceptance and F2 all-family content evidence must be reconciled; no new test pass claimed here |
| `lifecycle_harness_exact_sha_review_ci_merge` | Canonical exact 65d4285 review/CI and live PR #2440 merge verified | Authorized acceptance recording; do not rewrite candidate |
| `genuine_lifecycle_hosted_original_controls_zero_skips` | Existing run has 8 PASS / zero skips, including original six controls | Audit original assertions/provenance, seed limitations, restoration/private IAM/exact cleanup receipts before recording |

The ancestor `SR-GCP-ARTIFACT-ACTIVATION-20261004` retains its four composite
gates and downstream C125 real-upload, provider activation/readback and full
operational 16/16 requirements. Final `SR-ACCEPT-001` is not closed by this
helper or by the successful backend run. This decision prepares no deployment.

## Required machine-truth updates and guard result

Only the dispatch release CLI was used:
`/home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-0fb44e9576d3/tools/development-orchestrator/bin/ai-status.sh`.

Helper `start` succeeded. As `AI_NAME=Codex`, parent `note` with the concrete
next step failed **exit 1: Dispatched worker cannot mutate a different task**.
Own-helper `assign` with `TASK_METADATA_JSON` failed **exit 1: Dispatched
workers must use their assigned task lifecycle commands**. No guard bypass or
actor impersonation was attempted.

Supervisor must write the following through its authorized release CLI context:

- Parent: preserve blocked state, owner/reviewer and all candidate/acceptance
  evidence; record the four-step audit above as its next action.
- Helper metadata: `resolved_parent_status: blocked`,
  `resolved_parent_waiting_for: Claude` (Supervisor coordination lane), and `resolved_parent_next` pointing
  to Operator/Supervisor audit of run 37776386019, F2 three-family validation,
  independent IAM/restoration/cleanup readbacks and original-key recording.
  Lifecycle supplies `resolved_parent_at`; do not fabricate a timestamp.

Until those writes are verified, publish a **draft PR** and record this helper's
blocker. Do not hand off a mergeable candidate with default resumable disposition:
helper completion must not silently return the parent to `todo`. After the
writes, verify local/remote/PR identity and hand off that full SHA to **Codex2**.
This is an internal Supervisor routing dependency, not a user permission request.

## §0.7 helper acceptance and verification ledger

| Finding / acceptance | Basis and change | Before → after | Command / exit / evidence | Unverified limits |
| --- | --- | --- | --- | --- |
| Resolve or route missing product/contract decision | Parent specification, original UAT, this decision and Q entry | Unspecified planning blocker → no scope cut; explicit Operator acceptance audit | Release CLI `show` slices, `gh pr view 2440`, `gh run view 37776386019 --json ...` and `--log`: exit 0 | No formal parent acceptance granted |
| Record decision / scope cut / explicit follow-up | This artifact and `PHASE1_OPEN_QUESTIONS.md` | Stale in-progress/unrun snapshot → terminal run identified with seed/readback limits | Static source inspection of `_extract_seed_database` and hosted log: complete | Product runtime was not run on this VM; old/new reproduction is N/A for documentation |
| Task-scoped commit/push/PR evidence | Two planning files only | New decision delivery | Publication receipt in helper machine truth; final SHA cannot self-reference inside its own commit | Draft until state-write dependency resolved; review/CI/merge separate |
| Update parent with concrete unblocked next step | Required state writes above | Parent note and helper metadata attempted; both rejected by dispatch guard | Both commands exit 1; exact errors retained above | BLOCKED pending Supervisor writes and readback |

Machine-specific evidence is in this assigned worktree's
`.local/lifecycle-planning/hosted-run.json` (SHA256
`957d287864822b62ba325ffb3b978a7cafc42812fed9d2faf26fbc2be792cd53`)
and `hosted-run.log` (SHA256
`a7dbcab0ce40995d267bb87f505049078fc3c4d076ca38ff4854404de4afc1f9`).
The GitHub run/job links above are durable remote evidence. Documentation
whitespace, local references, canonical consistency and commit trailers are
checked before final publication; outcomes are recorded in helper machine truth.
No runtime tests, deployments, listeners or cloud workloads were launched here.

Publication check correction: the first `git diff --check HEAD^ HEAD` on anchor
`e056681b2` exited 2 for a Markdown hard-break trailing space on the Task line.
It was removed in a normal follow-up commit; the chained canonical/trailer
checks had not run at that point. Final check results are recorded in the helper
status receipt, separately from this initial failure.

Final publication checks on `aef3142a1c80` passed whitespace, canonical
consistency (all four categories zero findings), two task-local Markdown links
and the parent specification hash. Commit-trailer validation failed exit 1:
that follow-up commit's subject `docs: finalize clamd lifecycle acceptance routing evidence`
omits the required Task-ID. It had already been normally pushed; no amend,
rebase, reset, force-push or gate bypass is permitted. This is an additional
delivery blocker caused by this helper, not a parent product defect. Preserve
both published commits and request Supervisor-coordinated history recovery:
reconstitute these two planning-file changes on an approved fresh delivery
branch with compliant subjects, rerun the full-range checks, and supersede the
draft PR while retaining its history. A subsequent compliant commit on this
branch cannot erase the invalid ancestor. No candidate handoff is claimed.

The first helper blocker write using waiting-for `Supervisor` was rejected
(exit 1, `Unknown agent: Supervisor`). Route waiting-for to registered lane
`Claude` for Supervisor coordination; this does not change parent ownership.
