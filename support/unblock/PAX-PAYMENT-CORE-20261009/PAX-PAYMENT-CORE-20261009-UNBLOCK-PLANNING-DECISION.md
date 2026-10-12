# PAX-PAYMENT-CORE-20261009 planning decision routing

Date: 2026-10-11 UTC; routing receipt updated 2026-10-12 UTC.
Helper owner: Codex; reviewer: Codex2.
Canonical question: `PHASE1_OPEN_QUESTIONS.md`, Q-PAX-PAYMENT-CORE-20261009.
Disposition: explicit follow-up routed; no financial policy values approved,
no acceptance scope cut. Parent remains blocked. Supervisor has now recorded
the blocked-parent disposition and parent next step; the existing helper can
proceed to exact-SHA independent review. The historical held checks below are
retained and superseded only by the dated receipt at the end.

## Actual authority and candidate boundary

- Read `AI_COLLABORATION_GUIDE.md` §0.5–0.7, §2 and §5; the current release
  candidate lifecycle requires durable blocked disposition before helper merge.
- Inspected worktree/base `fc77f579d087c019660128d85c6ec4a8644a989e` on
  `codex/pax-payment-core-20261009-unblock-planning-decision`; initial tree was
  clean, fetched `origin/dev` matched this base, and no existing helper PR was
  found. No parent source or branch is changed by this planning task.
- Release-CLI parent slice: blocked, Codex/Codex2, original required keys
  `pax-payment_bind_charge_and_states` and
  `pax-payment_security_and_recovery` still OPEN. The original candidate is
  `bed2fa8baafefeaa243283a68915eb36374165f7`, generation
  `764b3e32d40248f892938258fbf24eda`. Fresh GitHub read confirms
  [PR #2555](https://github.com/ajoe734/drts-fleet-platform/pull/2555) MERGED,
  same head and protected merge `fc77f579d087c019660128d85c6ec4a8644a989e`.
  Parent status reports retain Codex2 review and matching CI 38155653725;
  this helper does not rerun or independently certify those product checks.
- Product authority: `docs/02-architecture/passenger-app-20261009/01_system_sa_sd.md`
  §8 and original A8 in canonical machine-local `common.md` require completion
  charging, policy-based retries, `manual_recovery`, unpaid guards and Ops
  refund. They do not give retry counts/intervals, definitive-decline policy,
  unknown-result readback schedule or notification expiry values.
- Read the registered task-spec supplement at canonical machine-local
  `continue-completion-frontier-20261011T0710Z/`:
  `PAX-PAYMENT-EXACT-PARTNER-ONLY-TEST-HARNESS-TYPE-SUPPLEMENT.md`, SHA256
  `75ed17467c12adf028098c7aebc2beaef5f7eddb35d272d71934f8057de3fa2c`.
  It explicitly preserves disabled/fail-closed financial/notice binding,
  forbids invented policy values and preserves Device API ownership.
- Parent implementation and earlier failures/limits remain in
  `docs/04-uat/passenger-app-20261009/PAX-PAYMENT-CORE-20261009.md`.
  This helper supplements that record with a planning route; it does not
  overwrite the original findings, unit/mock boundaries or acceptance matrix.

## Precise missing decision and existing contract

| Decision input            | Actual source / meaning                                                                                                                                                                                                                                                                                                         | Required approval receipt                                                                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `retryDelaysMs`           | `payment-capture.policy.ts`, `PaymentCapturePolicy` and `captureDisposition`: non-negative safe-integer milliseconds, maximum reserved capture attempts `1 + array length`; each entry schedules another eligible capture after a definitive retryable failure. Empty array is valid syntax, not an approved zero-retry policy. | Approved array, rationale, applicable environment/release, approver and timestamp. No numbers are proposed here.                                                                                                                               |
| `retryDefinitiveDeclines` | Same policy: explicit boolean; capture retry additionally requires PSP `retryable=true`; this flag only admits a definitive `card_declined` into that budget.                                                                                                                                                                   | Explicit approved boolean and PSP error-classification basis. An operator must not reinterpret unknown acknowledgement as a decline.                                                                                                           |
| `unknownReadbackDelaysMs` | Same policy: separately bounded readbacks for `pending`/`unknown`, using the original order key. These are not capture attempts. Exhaustion enters manual recovery.                                                                                                                                                             | Approved interval array and its operational/manual escalation owner. Readback-only behavior is retained regardless of array values.                                                                                                            |
| Capture activation        | `payment-capture.config.ts`, `paymentCapturePolicyFromEnv`: missing/false `PAX_PAYMENT_CAPTURE_ENABLED` returns null; true requires exact validated `PAX_PAYMENT_CAPTURE_POLICY` plus available PSP and cipher.                                                                                                                 | Policy approval is distinct from authorized hosted configuration and contracted provider readiness. Do not enable merely because source/CI passed.                                                                                             |
| Notice deadline           | `payment-recovery-notice.config.ts`, `paymentRecoveryNoticeExpiryFromEnv`: missing expiry returns null; provided expiry must parse to a future absolute instant. `PaymentChargeRepository.isRecoveryNoticeConfigured` also requires enabled outbox, future expiry and repository readiness.                                     | Explicit absolute `PAX_PAYMENT_RECOVERY_NOTICE_EXPIRES_AT`, approval provenance, environment/release, renewal owner and handling of queued notices at expiry. An automatic rolling TTL would require separately reviewed source/contract work. |

Paths in this table are relative to
`apps/api/src/modules/passenger-app/payment/`. Static source inspection confirms
the contract shape and disabled behavior; it does not constitute approval or
runtime verification. `PaymentChargeService.onTripCompleted` initializes a
durable obligation; absence of policy prevents money execution. Notice request
and `processRecoveryNotice` do not prove delivery. `PaymentChargeWorker`'s
one-second poll is scan cadence, not a financial retry interval or notice TTL.
The existing `PaymentRefundService.refund` remains full refund with unknown
result readback; this helper does not add partial-refund or refund-retry policy.

The decision is to route actual values as `human_required` under Guide §2/§4.
Supervisor/Chairman should first locate any genuine later approval and cite it;
if none exists, obtain one explicit product/operator decision containing all
fields above. Test schedules, passing unit suites, source scope supplements,
PSP secrets or other transport defaults cannot supply that decision.

## Existing-task routing and resume conditions

| Responsible role / existing task                     | Concrete next step                                                                                                                                                                                                                                              | Gate retained                                                                                                                                                                                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Supervisor/Chairman, existing Core planning question | Obtain financial policy and deadline approval/provenance, record it on the canonical question and parent, and coordinate actual hosted configuration scope.                                                                                                     | Parent remains blocked with original candidate, review/CI/merge and both keys. No automatic activation or unchanged-input acceptance dispatch.                                                                                             |
| Supervisor then Core owner Codex / reviewer Codex2   | Allocate exact Payment-specific hosted harness scopes and execution authority on existing tasks, check overlap, and record producer/prerequisite ordering before any source writes or workflow runs.                                                            | A new source change requires supported original candidate reopen/new candidate review; this helper grants no code, workflow or resource scope.                                                                                             |
| PAX-QA-20261009, Codex2 / Codex                      | Registered QA scopes include PG verification tooling, tests and CI workflow. Coordinate formal V0115 production repository PG transactions, dual-status rollback/constraints, two independent sessions, UUID fencing/CAS, refund, and legal/refusal HTTP paths. | QA is todo and depends on Core and other passenger tasks. A narrower prerequisite contribution needs Supervisor-recorded scope/ordering; no reverse dependency is added here. Generic PG/HTTP and mocks do not satisfy Payment acceptance. |
| PAX-PUSH-DEVICE-API-20261009, Codex / Codex2         | Existing task owns enrollment and Booking-captured first-party route. Coordinate lawful persisted account/device route, expiry/revocation and eventual device transport evidence.                                                                               | Device task is todo and depends on Booking and QA. Core cannot take over that producer or fabricate a route.                                                                                                                               |
| PAX-PSP-ADAPTER-20261009, Codex2 / Codex             | Existing external gate owns contracted provider, authorized managed sandbox and hosted fields. Route credentials/readiness through its authorized operator.                                                                                                     | PSP task is blocked and depends on Core and Payment UI. No secret read, live money call or fake-in-production authorization is supplied by this packet.                                                                                    |

The current dependency graph cannot supply Device/PSP acceptance to Core by
simply waiting for all dependents: QA waits for Core, Device waits for QA, and
PSP waits for Core. Supervisor must record a reviewed, non-cyclic allocation
of prerequisite preparation and later external acceptance on the existing
board, preserving acceptance meaning. This is a routing issue, not authority
to edit dependencies, fabricate completed tasks, waive gates or create an
unregistered implementation producer. No dependency is changed here.

Resume original owner acceptance only after decision receipts, authorized
hosted harness scope/runner and actual lawful prerequisite evidence change.
Record each original key only against matching candidate/runtime evidence.
Keep source review, CI/merge, payment PG/HTTP, device/FCM and real PSP evidence
distinct. VM product servers, browser servers and Docker remain prohibited.

## Canonical state prerequisite and rejected writes

Current release `0fb44e9576d3` CLI was used with `AI_NAME=Codex` throughout.
Helper `start` and `progress` succeeded. Two supported writes were attempted
once, without impersonation or guard bypass:

- Parent `note`: exit 1, `Dispatched worker cannot mutate a different task`.
- Own-helper `assign` with `TASK_METADATA_JSON`: exit 1,
  `Dispatched workers must use their assigned task lifecycle commands`.

These are dispatch guard rejections, not automatic approval review failures.
No parent update or metadata success is claimed. Genuine Supervisor must use
the release CLI to register the following exact helper metadata before
handoff/merge; `resolved_parent_at` is left to the real merge transaction:

```json
{
  "resolved_parent_status": "blocked",
  "resolved_parent_waiting_for": "Claude",
  "resolved_parent_next": "Planning route only: obtain approved retryDelaysMs/retryDefinitiveDeclines/unknownReadbackDelaysMs and explicit notice expiry/provenance; coordinate existing QA hosted Payment-specific PG/HTTP scope and Device API/PSP prerequisite sequencing. Preserve bed2/gen764 review/CI/merge fc77, original roles/keys/dependencies and disabled/failclosed binding. No acceptance resume until actual inputs/evidence change. See support/unblock/PAX-PAYMENT-CORE-20261009/PAX-PAYMENT-CORE-20261009-UNBLOCK-PLANNING-DECISION.md."
}
```

Supervisor must also write this concrete next step on the parent using `note`,
without resume, acceptance recording or changing candidate evidence. Fresh CLI
readback of both tasks is required. Absent blocked disposition, the current
release `apply_unblock_parent_resolution` defaults a blocked parent to `todo`;
planning documentation alone cannot safely complete this helper lifecycle.

The waiting-for lane is Claude (Guide §3 governance/arbitration), who routes
the actual operator action to Supervisor; this does not reassign either task.
The first blocked-status command used incorrect argument order and was rejected
with exit 1 before mutation. The corrected command exposed that `Supervisor`
is not a registered waiting-for agent (exit 1, `Unknown agent: Supervisor`).
The proposed metadata was therefore corrected to the registered Claude lane
before any handoff. The Supervisor operator remains responsible for the writes.

## Finding-level verification and delivery

| Finding / acceptance                                 | Source and change                                                                                      | Old → new result                                                                                                               | Command / version / evidence                                                                                        | Remaining limit                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Missing financial policy / notice decision           | SA/SD §8; policy/config/repository/service symbols above; new Q-PAX-PAYMENT-CORE entry and this packet | Undocumented route → explicit human-required decision fields and existing-task route; document check, runtime reproduction N/A | Read-only source and release task slices at base fc77; local content/citation checks recorded in continuation below | Actual values and approval remain OPEN; no production activation    |
| Preserve parent acceptance and dependency boundaries | Parent original two keys; QA/Device/PSP slices; candidate lifecycle                                    | Existing blocked gates → retained, with dependency sequencing request                                                          | Release `show` piped to scoped fields and `gh pr view 2555`: exit 0                                                 | No payment PG/HTTP/FCM/PSP tests rerun or claimed                   |
| Update parent with concrete next step                | Proposed metadata and parent note above                                                                | Both writes REJECTED, exit 1                                                                                                   | Actual release CLI; canonical machine-local parent-note.log / helper-metadata.log                                   | Supervisor receipt and both-task readback OPEN; helper handoff held |
| Task-scoped canonical commit/push/PR                 | Only question and helper artifact                                                                      | Publication evidence recorded below and in release progress                                                                    | Ordinary task branch, required Codex/Codex2 trailers                                                                | Independent review, same-SHA CI and merge pending; no direct done   |

Machine-specific evidence is under
`/home/lupin/workspace/drts-fleet-platform/.local/pax-payment-planning-decision-20261011/`.
All launched checks must finish and be read before any handoff. Documentation
checks are appropriate here; mirrored product tests are not added. No product
runtime, deployment, secret or external financial operation was started.

### Publication and local verification continuation

Recoverability anchor `ffe22e226` was normally pushed to the assigned branch;
[draft PR #2564](https://github.com/ajoe734/drts-fleet-platform/pull/2564)
targets `dev`. It remains draft until the genuine Supervisor state prerequisite
is satisfied. No review candidate has been handed off. The final publication
SHA, remote/PR identity and report hash are recorded in release progress after
this additive closeout; the report cannot embed its own eventual commit SHA.

| Check / finding                      | Actual command and result                                                                                                                                                                                                                                                                                                                                   | Version / limit                                                                                                                                                                                                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documentation consistency            | `python3 tools/ci/git/check_canonical_consistency.py --ci --base fc77f579d087c019660128d85c6ec4a8644a989e --head HEAD`: exit 0, zero findings after the anchor included both changed documents                                                                                                                                                              | Anchor ffe22e226; prior pre-commit HEAD check did not yet cover the new files and is not substituted for this result                                                                                                                                                       |
| Formatting                           | `pnpm exec prettier --check PHASE1_OPEN_QUESTIONS.md support/unblock/PAX-PAYMENT-CORE-20261009/PAX-PAYMENT-CORE-20261009-UNBLOCK-PLANNING-DECISION.md`: exit 0                                                                                                                                                                                              | Prettier 3.8.2; formatting also normalized existing question tables/blank lines, without changing their text                                                                                                                                                               |
| Classification                       | `node tools/ci/check-repo-classification.mjs`: exit 0, 6,322 repository files                                                                                                                                                                                                                                                                               | Includes both planning documents; no classification rules changed                                                                                                                                                                                                          |
| Generated-file / whitespace guard    | `python3 tools/ci/git/check_staged_generated_files.py --staged` and `git diff fc77f579d087c019660128d85c6ec4a8644a989e HEAD --check`: exit 0                                                                                                                                                                                                                | Only the task-owned question and packet are staged/committed                                                                                                                                                                                                               |
| Commit delivery / trailers           | `python3 tools/ci/git/check_commit_trailers.py --base fc77f579d087c019660128d85c6ec4a8644a989e --head HEAD`: exit 0; normal anchor hook chain PASS                                                                                                                                                                                                          | Codex owner / Codex2 reviewer; no hook bypass or history rewrite                                                                                                                                                                                                           |
| Tooling failure and bounded repair   | Initial `pnpm exec prettier --write` exit 1, module missing; first anchor commit exit 1 at lint-staged, no commit created. Existing canonical tool symlinks target a deleted Core worktree. Direct immutable-store tool version probes exit 0; worktree-local ignored links to existing Prettier/lint-staged store repair the commands; retry commit exit 0 | No dependency install or canonical node_modules edits. Original node_modules symlink target recorded in machine-local evidence; ignored Husky runtime copied from existing canonical runtime. Lint-staged's automatic temporary backup was cleaned; no manual design stash |
| Product checks                       | Not run by this planning helper                                                                                                                                                                                                                                                                                                                             | No new unit/PG/HTTP/browser/device/PSP/deployment acceptance claim; original parent evidence and OPEN keys retained                                                                                                                                                        |
| Parent disposition and concrete next | Both supported writes rejected, exit 1; requested via successful helper progress                                                                                                                                                                                                                                                                            | Await genuine Supervisor metadata plus parent note and fresh readback; do not hand off/merge based on this packet alone                                                                                                                                                    |

All local commands above completed and their outputs were read. Exact final
committed-range checks are rerun after this closeout and recorded in release
progress; hosted checks, if present, are separate from Payment acceptance.

### 2026-10-12 Supervisor receipt and owner continuation

The actual operator packet
`.local/continue-full-completion-20261012T0528/PAYMENT-HELPER-SAFE-ROUTING-DISPOSITION.md`
authorizes an ordinary append/push to the existing question/report and its
original Codex/Codex2 lifecycle. Its readback
`supported-helper-and-parent-before-resume-readback.json` confirms the exact
three requested helper metadata fields and matching parent note, with
`parent_protected_fields_unchanged=true`. Helper-only resume removes the
state-transaction blocker. It supplies no policy values or activation approval.

Fresh release `0fb44e9576d3` `show` for both tasks, after successful owner
`start`, confirms the helper is in progress with the same blocked-parent
metadata; the parent remains blocked, Codex/Codex2, no dependencies, original
candidate `bed2fa8baafefeaa243283a68915eb36374165f7`, generation
`764b3e32d40248f892938258fbf24eda`, matching reviewed/CI SHA and protected merge
`fc77f579d087c019660128d85c6ec4a8644a989e`. Both original required acceptance keys
remain unfilled. `resolved_parent_at` is still reserved for actual helper merge.

| Finding / acceptance                            | Old → current result                                                                                                | Command / evidence                                                                                                                                                                                      | Remaining limit                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Parent disposition and concrete next step       | Earlier worker writes rejected → genuine Supervisor metadata and parent note persisted; receipt verified            | Operator readback above and fresh release `show` snapshots, exit 0, in canonical `.local/pax-payment-planning-decision-20261012/`                                                                       | Parent remains blocked; no acceptance resume                                                                     |
| Missing policy / scope cut / explicit follow-up | Canonical human-required question and existing-task route retained; no scope cut                                    | Read policy/config source; only this packet and Q-PAX-PAYMENT-CORE-20261009 receipt updated                                                                                                             | Actual policy/expiry approval and Payment-specific PG/HTTP/device/PSP evidence still missing                     |
| Published history and prior checks              | Existing local/remote/PR head `eb229938185493d59b549f6b848e8461dbd696d6` matched; ordinary additive receipt follows | `git fetch origin`, `git ls-remote`, `gh pr view 2564`, exits 0; regular CI 38160245900 terminal 13 SUCCESS; draft integration 38160245964 terminal 5 SUCCESS / 12 SKIP, read via `gh run view`, exit 0 | Prior CI belongs to eb229938; final receipt SHA requires fresh review/CI. Draft skips are not runtime acceptance |

Final document/range/trailer checks, local/remote/PR candidate identity, report
hash and handoff generation are recorded in release progress and the same
machine-local evidence directory after the additive commit. Product runtime
checks are not applicable to this receipt; no tests are added. Supervisor must
still obtain the real approval and authorized existing-task prerequisite
sequencing before original parent acceptance can resume.

Continuation tooling: dispatch restored a shared `node_modules` symlink whose
Prettier package target no longer exists; `pnpm exec prettier --write` exited 1.
The receipt anchor `9f8651682` committed normally but this worktree lacked the
ignored `.husky/_` runtime, so hooks did not execute on that anchor. Manual
committed-range consistency, trailer and whitespace checks passed; direct
immutable-store Prettier found formatting to correct (exit 1). The final
formatting commit restores worktree-local ignored tool links and Husky runtime
from the existing store/canonical runtime, then runs normal hooks and final
checks. No shared dependencies or tracked tooling are changed, and no hook
bypass is set. This limitation is not a product test result.
