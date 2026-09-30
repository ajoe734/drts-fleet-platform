# C114 coverage — planning decision and delivery evidence

- Task: `SR-LIVE-MAP-C114-COVERAGE-20260930-UNBLOCK-PLANNING-DECISION`
- Parent: `SR-LIVE-MAP-C114-COVERAGE-20260930`
- Owner / reviewer: Codex / Claude2
- Branch: `codex/sr-live-map-c114-coverage-20260930-unblock-planning-decision`
- Audited base: `09ba63dc4c6343a2ca5bd89e8165719ff1d5bb4f`
- Decision: [SD-DP-20260930-001](../../../docs/01-decisions/SD-DP-20260930-001-c114-session-prerequisites.md)
- Delivery: planning documents only; parent implementation and live acceptance
  remain blocked. PR must remain draft until the operator updates machine truth.

## Finding history and decision

Continue the existing [C114-COVERAGE.md](../../../tests/e2e/system-remediation/sr-live-map-001/C114-COVERAGE.md)
F-SESSION-CONTRACT finding; do not replace its earlier F-WIRE, F-RUNTIME or live
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

| Finding / acceptance | Source and change | Previous → this delivery | Verification / evidence | Remaining limitation |
| --- | --- | --- | --- | --- |
| F-SESSION-CONTRACT / route product-contract decision | AuthController.issueToken; JwtAuthService.validateDurableState; decision §§1–3 | Ambiguous product repair request → supported realm paths and precise harness/provisioning split | Static call-path audit at base; existing two-case reproduction and Claude2 same-SHA approval read in full | No auth code changed; valid provisioned sessions still required |
| Record decision, scope cut, explicit follow-up | SD-DP-20260930-001 | No C114 planning record → named reviewer/operator/owner sequence; no verifier exception or scope expansion | Relative-link/content checks and diff check, final results below | Workforce-proof delivery and invitation provisioning remain Supervisor obligations under parent |
| Task-scoped commit / push / PR | This branch, decision and original task ledgers | New tracked planning delivery | Final SHA and PR must match local HEAD and remote; publication results below | Draft hold until canonical disposition is written; CI/review/merge are separate |
| Update parent concrete next step | Canonical parent note and helper resolved_parent_* metadata | Commands attempted → rejected by dispatch guard | Active release CLI: parent note exit 1, own assign exit 1; exact errors and operator commands below | Machine-truth parent update is pending; this is not full helper completion |
| Parent service_area_live_decisions_for_real_taiwan_addresses | Original C114 ledger / service-area evaluator / V0049 | Pending → pending | Latest hosted parent run 36686169334 completed failure | Real Google + same-SHA deployed product evidence absent |
| Parent location_freshness_live_states | Original ledger / DriverHeartbeatController | Pending → pending | Current GitHub vars lack DRTS_LIVE_MAP_TEST_DRIVER_ID; no live calls here | Isolated driver, valid binding, actual 95s wait and cleanup pending |
| Parent browser_map_render_live | Original ledger / live browser spec | Pending → pending | Current allowlist contains only API + ops origins | Hosted imagery/screenshots and Google origins pending |
| Parent authorization_gate_and_allowed_targets_enforced | Existing workflow / session bootstrap / evidence gate | Fail-closed parent preflight → unchanged | Parent run failed before WIF/session/provider/coverage/browser; no passing skip claimed | Same-candidate hosted evidence required |

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
  failed preflight / skipped downstream steps are also in the reviewed parent
  finding; no new hosted run was dispatched by this helper.
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

## Publication and final checks

Pending final content/link checks, anchor publication and candidate PR. Exact
candidate SHA, PR head comparison and machine-status outcome will be appended
before handoff; no completion or live acceptance is claimed here.
