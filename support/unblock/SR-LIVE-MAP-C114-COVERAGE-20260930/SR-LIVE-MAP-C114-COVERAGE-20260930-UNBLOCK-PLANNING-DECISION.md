# C114 coverage — planning decision and delivery evidence

- Task: `SR-LIVE-MAP-C114-COVERAGE-20260930-UNBLOCK-PLANNING-DECISION`
- Parent: `SR-LIVE-MAP-C114-COVERAGE-20260930`
- Owner / reviewer: Codex / Claude2
- Branch: `codex/sr-live-map-c114-coverage-20260930-unblock-planning-decision`
- Audited base: `09ba63dc4c6343a2ca5bd89e8165719ff1d5bb4f`
- Decision: [SD-DP-20260930-001](../../../docs/01-decisions/SD-DP-20260930-001-c114-session-prerequisites.md)
- Delivery: planning documents only; parent implementation and live acceptance
  remain blocked. The initial operator-write hold below was cleared on
  2026-09-30; see the continuation record for current candidate/CI evidence.

## Finding history and decision

Continue the existing [C114-COVERAGE.md](../../../tests/e2e/system-remediation/sr-live-map-001/C114-COVERAGE.md)
F-SESSION-CONTRACT finding; do not replace its earlier F-WIRE, runtime-binding or live
verification history. Parent candidate `e3c7ed02701c387d82786bcfd8877e2618851f3b`
was approved by Claude2 at `2026-09-30T08:10:53Z` and merged in
[PR #2235](https://github.com/ajoe734/drts-fleet-platform/pull/2235) as the audited
base. That approval explicitly retained the session prerequisite and all four
live gates. This is not a second consecutive failed repair of the same finding:
the auth prerequisite was documented outside the original implementation scope.

Source review confirms header-only `AuthController.issueToken` generates active,
signed 8h sessions but no driver binding / workforce membership.
`JwtAuthService.validateDurableState` rejects those sessions. The existing
[minimal reproduction](../../../tests/unit/system-remediation/sr-live-map-001/session-contract.test.ts)
calls the real controller, memory IdentityRepository, signer and verifier. Only
Date is frozen before the legacy-key expiry. Its two passing negative cases
prove rejection, not successful sessions or PostgreSQL persistence.

Decision: follow accepted device-bound driver and verified workforce paths;
preserve durable verification. The new canonical decision identifies both
harness consumers, the 15m device token's real scopes, missing hosted proof
delivery, and the expiry dependency of the IAP token branch. A read-only workload
observer is an explicitly provisioned alternative requiring a recorded parent
contract; it cannot silently replace a driver or workforce identity.

## §0.7 verification and acceptance ledger

| Finding / acceptance                                         | Source and change                                                              | Previous → this delivery                                                                                   | Verification / evidence                                                                                   | Remaining limitation                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| F-SESSION-CONTRACT / route product-contract decision         | AuthController.issueToken; JwtAuthService.validateDurableState; decision §§1–3 | Ambiguous product repair request → supported realm paths and precise harness/provisioning split            | Static call-path audit at base; existing two-case reproduction and Claude2 same-SHA approval read in full | No auth code changed; valid provisioned sessions still required                                 |
| Record decision, scope cut, explicit follow-up               | SD-DP-20260930-001                                                             | No C114 planning record → named reviewer/operator/owner sequence; no verifier exception or scope expansion | Relative-link/content checks and diff check, final results below                                          | Workforce-proof delivery and invitation provisioning remain Supervisor obligations under parent |
| Task-scoped commit / push / PR                               | This branch, decision and original task ledgers                                | New tracked planning delivery                                                                              | Final SHA and PR must match local HEAD and remote; publication results below                              | Draft hold until canonical disposition is written; CI/review/merge are separate                 |
| Update parent concrete next step                             | Canonical parent note and helper resolved*parent*\* metadata                   | Commands attempted → rejected by dispatch guard                                                            | Active release CLI: parent note exit 1, own assign exit 1; exact errors and operator commands below       | Machine-truth parent update is pending; this is not full helper completion                      |
| Parent service_area_live_decisions_for_real_taiwan_addresses | Original C114 ledger / service-area evaluator / V0049                          | Pending → pending                                                                                          | Latest hosted parent run 36686169334 completed failure                                                    | Real Google + same-SHA deployed product evidence absent                                         |
| Parent location_freshness_live_states                        | Original ledger / DriverHeartbeatController                                    | Pending → pending                                                                                          | Current GitHub vars lack DRTS_LIVE_MAP_TEST_DRIVER_ID; no live calls here                                 | Isolated driver, valid binding, actual 95s wait and cleanup pending                             |
| Parent browser_map_render_live                               | Original ledger / live browser spec                                            | Pending → pending                                                                                          | Current allowlist contains only API + ops origins                                                         | Hosted imagery/screenshots and Google origins pending                                           |
| Parent authorization_gate_and_allowed_targets_enforced       | Existing workflow / session bootstrap / evidence gate                          | Fail-closed parent preflight → unchanged                                                                   | Parent run failed before WIF/session/provider/coverage/browser; no passing skip claimed                   | Same-candidate hosted evidence required                                                         |

## Verification observations (2026-09-30)

- `git fetch origin`: exit 0; audited HEAD and origin/dev both
  `09ba63dc4c6343a2ca5bd89e8165719ff1d5bb4f` at inspection.
- `gh pr view 2235 --json url,state,headRefOid,mergeCommit`: exit 0; verified
  parent candidate and merge SHA above.
- `gh run view 36686138917 --json conclusion,headSha,url` and the same command
  for `36686139028`: exit 0; both completed success at the original candidate.
  This is historical parent CI, not CI for this helper.
- `gh run list --workflow live-entry-map-acceptance.yml --limit 3`: exit 0;
  latest run `36686169334` completed failure at the original candidate. Its
  jobs/steps were independently read with `gh run view 36686169334 --json
headSha,conclusion,jobs` (exit 0): preflight failed; WIF, sessions, provider,
  coverage and browser skipped; run-status step failed. No new hosted run was
  dispatched by this helper.
- Read-only `gh variable list`: exit 0; `DRTS_LIVE_MAP_TEST_AUTHORIZED=true`,
  API and ops origins present, Google origins and TEST_DRIVER_ID absent.
  DEV_GCP project/region remain `drts-dev-devcc-20260825` / `us-central1`.
- Attempted existing reproduction:
  `pnpm exec vitest run tests/unit/system-remediation/sr-live-map-001/session-contract.test.ts --maxWorkers=2`
  **exit 1 before test collection**, Node `22.23.2`, pnpm `10.33.0`:
  `node_modules/vitest/vitest.mjs` is missing through the shared dependency link.
  Tests did not execute; this is neither a new behavioral reproduction nor a
  passing test. Log: `.local/c114-planning/session-contract.log`. No shared
  dependencies were changed for a documentation-only helper.
- No VM product server, database, browser, E2E infrastructure, secret/variable
  write, token issuance, deployment or paid-provider request was performed.

## Canonical routing write limitation and operator action

The active release CLI rejected these authorized task intentions under the
current dispatch context (owner Codex, this helper's task ID):

1. `note SR-LIVE-MAP-C114-COVERAGE-20260930 <next-step>`: exit 1,
   `Dispatched worker cannot mutate a different task`.
   Log: `.local/c114-planning/parent-note.log`.
2. `TASK_METADATA_JSON=<blocked disposition> ... assign <helper> Codex Claude2`:
   exit 1, `Dispatched workers must use their assigned task lifecycle commands`.
   Log: `.local/c114-planning/disposition.log`.

No role/dispatch environment was removed or impersonated to bypass these guards.
An own-task `progress` succeeded and routes the operator requirement through
machine truth. Before making the PR ready or approving it, Supervisor must run
the following in its **existing operator context**, using the active release CLI
(refresh STATUS_CLI if a newer release is assigned):

```bash
STATUS_CLI=/home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-a5d380901220/tools/development-orchestrator/bin/ai-status.sh
HELPER_ID=SR-LIVE-MAP-C114-COVERAGE-20260930-UNBLOCK-PLANNING-DECISION
PARENT_ID=SR-LIVE-MAP-C114-COVERAGE-20260930
PARENT_NEXT='SD-DP-20260930-001 resolves the contract interpretation. Claude2 must disposition/reopen F-SESSION-CONTRACT; Supervisor must specify valid driver invitation/device proof and verified observer proof delivery, actual principal/scopes, cleanup and transport after INTERNAL_KEY_EXCP_002 expiry. Codex then updates both harness consumers within coordinated write_scopes on a new candidate. Keep parent blocked and all four live acceptance keys pending; driver isolation, Google origins and exact-SHA shared-dev deployment remain gates.'
AI_NAME=Supervisor TASK_METADATA_JSON="$(jq -cn --arg next "$PARENT_NEXT" '{resolved_parent_status:"blocked",resolved_parent_waiting_for:"Claude2",resolved_parent_next:$next}')" \
  "$STATUS_CLI" assign "$HELPER_ID" Codex Claude2
AI_NAME=Supervisor "$STATUS_CLI" note "$PARENT_ID" "$PARENT_NEXT"
"$STATUS_CLI" show "$HELPER_ID" | jq '{id,status,resolved_parent_status,resolved_parent_waiting_for,resolved_parent_next}'
"$STATUS_CLI" show "$PARENT_ID" | jq '{id,status,waiting_for,next,candidate_sha,merge_sha,required_acceptance}'
```

Do not set `resolved_parent_at` manually; merge lifecycle owns that field. The
parent must remain blocked with its old candidate until explicit reviewer
disposition. Any newly discovered product prerequisite must be recorded under
the parent or an assigned dependency before execution, not left only in prose.

`tools/development-orchestrator/github_bus.py` automatically makes a draft PR
ready once `handoff` locks its candidate. Therefore this helper must retain an
owner checkpoint and defer handoff until the metadata/parent note have actually
been written. A handoff message asking to keep the PR draft cannot enforce the
hold. After operator verification, the owner can hand off the unchanged full
published SHA and branch to Claude2; do not call `done`.

## Publication and final checks

- Anchor `4c212bc6d085da139a4cc08eea6814283b22894c` committed all three task-owned
  documents with owner/task/reviewer trailers and was normally pushed (exit 0).
- [Draft PR #2236](https://github.com/ajoe734/drts-fleet-platform/pull/2236)
  targets `dev`; initial PR head matched that anchor. The subsequent evidence and
  formatting commit remains an owner checkpoint until the operator action.
  Final full published SHA/head comparison is recorded through the active CLI
  in this task's status, avoiding a self-referential commit hash in this file.
- Scoped `pnpm dlx prettier@3.8.2 --check <decision> <helper-artifact>`: exit 0.
  Version matches the lockfile. Shared `pnpm exec prettier` was unavailable;
  standalone formatting did not change dependencies or the lockfile. Original
  parent tables were left as-is to preserve the finding history.
- Content/reference audit: exit 0; 21 relative links resolve, proposed disposition
  JSON is valid and keeps the parent blocked, operator commands pass `bash -n`
  without execution, and the original parent ledger after the new note matches
  the base byte-for-byte. Log: `.local/c114-planning/content-checks.log`.
- `git diff --check`: exit 0. No new product tests were added for this planning
  change. Existing Vitest reproduction remains **not executed**, as recorded
  above. Hosted checks must be read at the final pushed SHA; draft integration
  skips are not full test/acceptance results.
- Handoff remains blocked on canonical metadata/parent-note writes. The owner
  must verify those fields and local/remote/PR equality before issuing the usual
  `CANDIDATE_SHA`, `CANDIDATE_BRANCH`, `PR_URL` handoff to Claude2. No `done`,
  parent resume, same-SHA approval or live acceptance is claimed by this helper.

## Continuation: operator hold cleared and CI prerequisite incorporated

The preceding observations describe the initial delivery. Supervisor subsequently
wrote `resolved_parent_status=blocked`, `resolved_parent_waiting_for=Claude2`
and the explicit F-SESSION-CONTRACT next step to this helper, and updated the
parent at `2026-09-30T14:59:04Z`. Owner re-read those fields on this continuation.
The parent remains blocked on Claude2's formal disposition/reopen and the
supported proof/provisioning contract; its four live acceptance keys are intact.
The parent-update acceptance item above is now satisfied. No operator-write
permission workaround or additional parent mutation was needed.

Candidate `58103f77f88851b6d50bb6971779e57835b4ef74` was handed off at
15:04 UTC and approved by Claude2 at 15:06 UTC. Ready-for-review CI then exposed
an existing quota-test calendar dependency. Both
[integration run 36734354818](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36734354818)
and [CI run 36734355178](https://github.com/ajoe734/drts-fleet-platform/actions/runs/36734355178)
finished **failure** at that SHA; their full failure logs were read. Each root
unit suite reported 4,256 passed, one failed and 39 skipped. The failure was
`tenant-approval-and-quota-lifecycle.test.ts:390`, expected 1 but received 0.
The earlier morning success does not supersede these later failed checks.

| Finding / acceptance            | Source and change                                                                                                                                                                                                                                    | Previous → this delivery                                                                                                                                        | Verification / evidence                                                                                                                                                | Remaining limitation                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| CI quota month-boundary failure | `createBookingCommand` uses now + 6h; `TenantPartnerService.getCostCenterQuotaSummary` defaults to now; `toTenantQuotaPeriodKey` uses Asia/Taipei. Booking and summary therefore use different months between 10:00Z and 16:00Z on the last UTC day. | Old candidate fails; upstream PR #2241 fixes the test to query the booking's actual window and adds a fixed month-boundary regression. No product code changes. | Old candidate focused Vitest command below: exit 1 at 15:19 UTC, identical expected 1 / actual 0. After ordinary merge: all 67 scoped tests pass, exit 0 at 15:20 UTC. | Fresh CI and independent review must match the new final SHA.              |
| Parent concrete next step       | Active-release `show` for helper and parent                                                                                                                                                                                                          | Initial dispatch-guard rejection → Supervisor writes verified                                                                                                   | Parent note dated 14:59:04Z; helper blocked disposition and Claude2 routing verified                                                                                   | Parent implementation/provisioning and all four live gates remain pending. |

The failure is already repaired by merged
[PR #2241](https://github.com/ajoe734/drts-fleet-platform/pull/2241),
`331c73a54710793d4b35f424d73dcc946687a76b` on `dev`. After both old-candidate
runs completed, the owner incorporated that single upstream commit using
`git merge --no-ff origin/dev`. Merge anchor
`33d1212b30cd3bd75fe2d896d2854a5baab7de75` was normally pushed. No rebase,
amend, force push, duplicate quota fix or acceptance reduction was used.
This changes candidate identity; the old approval is historical evidence only.

Local commands, Node `22.23.2`, pnpm `10.33.0`, Vitest `4.1.4`:

```bash
# At 58103f77f88851b6d50bb6971779e57835b4ef74: exit 1 (one selected failure).
pnpm exec vitest run tests/unit/system-remediation/sr-qa-tenant-001/tenant-approval-and-quota-lifecycle.test.ts -t 'a successful booking against a cost center' --maxWorkers=2
# At 33d1212b30cd3bd75fe2d896d2854a5baab7de75: exit 0 (7 files, 67 tests).
pnpm exec vitest run tests/unit/system-remediation/sr-qa-tenant-001/tenant-approval-and-quota-lifecycle.test.ts tests/unit/system-remediation/sr-live-map-001 --maxWorkers=2
```

Dependencies were available on this continuation; the initial missing-dependency
observation above remains historical. These are repository unit checks with the
existing test doubles, not live authentication, PostgreSQL persistence or map
acceptance. The two session-contract cases still prove rejection. All started
local checks finished; no VM product server, browser or database was started.
Logs are under `.local/c114-planning/ci-20260930T1516/` (`unit.log`,
`smoke-failed.log`, `quota-before.log`, `quota-and-map-after.log`). Final pushed
SHA, PR-head comparison and completed hosted results are recorded in this task's
active-release handoff after verification, keeping commit identity outside its
own content. No owner `done` or parent resume is authorized by this continuation.
