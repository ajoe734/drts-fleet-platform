# ORCH-BOUND-RUNTIME-STATUS-CLI-RECOGNITION-20261016

Owner: Codex. Independent reviewer: Claude2. Source-only candidate; runtime adoption belongs to the existing sole maintainer.

## Authority, baseline and scope

- Isolated worker branch: `codex/orch-bound-runtime-status-cli-recognition-20261016`.
- Fresh accepted dev/base: `a1dcfded7c5af92e13b5d24c5d955f112557b7f4`; remote dev matched at dispatch. First anchor: `b6b6d6325`.
- Only this UAT, `tools/development-orchestrator/permission_broker.py` and its original `test_permission_broker.py` change. All 12 original test classes/assertions remain AST-identical to base. No bin/ai_status.py, dispatch policy, provider/hook configuration, Chair prompt, allowlist, approval entries/remembered rules, product or cloud authority changed.
- Actual installed broker: `/home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-4da15372d696/tools/development-orchestrator/permission_broker.py`, SHA-256 `ed9ee4c4a3b5a5641ffce809f88be66f6595460a274eaed5cb6b8aae66f2617d` (88,276 bytes). Its bytes equal the accepted-dev broker. The loaded release was never written, installed or restarted.
- Read the original full task spec, saved pure-classification counterexamples, and `/home/lupin/workspace/drts-fleet-platform/.orchestrator/chair-reviews/20261016T092336Z-codex.json`. The four original explicit denials (two SOS handoffs, two E04 declines) remain binding. This repair neither overturns them nor recommends another spelling to replay them.

## Production call path and repair boundary

`provider_permissions._verified_claude_hooks` selects the broker; `claude_permission_prompt_mcp` imports `evaluate_tool_request`; Bash evaluation calls production `classify_command`. Original `_is_safe_status_sync_command` compares only canonical workspace entrypoints, then accepts a prefix before segment/deny/redirection checks. It does not recognize the peer of the actual loaded release. Broad Python recognition is a second fallthrough, so changing only a script path is insufficient.

The repair routes status-related invocations (including quote/escape spellings) through complete shell inspection before the broad Python/Bash shortcuts. `_visible_status_shell` retains real newline separators and rejects unseen expansion/program constructs, including double quoted substitutions. `_classify_status_command` uses the original deny, canonical head-move, read/write, segment and pipe/force-push guards. A safe prefix cannot carry an unknown or dangerous suffix. Safe diagnostics such as `--help 2>&1 | head -40` and literal env/cwd wrappers remain supported.

`_matches_status_script` resolves a relative invocation from its real cwd. It recognizes the exact canonical source entrypoint or the exact peer of `THIS_DIR`, only when that loaded directory is the canonical workspace's release bundle. It does not scan releases or trust their names, the basename, a suffix, a supplied release variable or the worker checkout. Lexical and resolved paths must both equal the expected existing file, which rejects escaping symlinks and aliases. No release SHA, checkout path or task ID is hardcoded in production logic. Both wrapper/bash and Python entrypoints are covered.

Recognition conveys no lifecycle identity. Literal environment arguments still reach the native CLI; execution/dispatch-fence overrides are not inert wrappers. The small status-specific approval interaction in `hook_mode` preserves an exact denied or pending request before any newly recognized allow can bypass its existing approval path. Response protocol, explicit resume-override ordering and unrelated command policy remain unchanged. No approval is created, consumed or rewritten by classification.

The actual handlers remain `bin/ai_status.py::{command_handoff,command_approve,command_decline_acceptance_review,_require_acceptance_review_snapshot,_require_pending_acceptance_review}` behind `TaskBoardCommandExecutor._guard_worker_command` and existing dispatch policy. They continue to enforce owner/reviewer separation, native actor/scope, exact candidate SHA/generation, required candidate branch and current snapshot/request binding.

## Finding and acceptance evidence

| Finding / required acceptance | Source / change | Original → fixed result | Command, version and evidence | Remaining gate |
| --- | --- | --- | --- | --- |
| `bound-runtime-status-cli_actual-trusted-loaded-peer-and-canonical-recognition` | `_matches_status_script`, `_is_safe_status_sync_command`; loaded-file fixture tests | Eight complete saved production command pairs: actual runtime `defer` / canonical `allow` → prospective fixed runtime `allow` / canonical `allow`; full E04 decline and CI-phase approve argv retained | `before.json`, `paired-before-after.json`, offline probe below; installed original hash above; candidate source hashes below | Independent exact-candidate review, same-SHA CI, protected merge and bounded Source acceptance recording. Actual loaded adoption/proof is later maintainer work. |
| Unsafe prefix/composition bypass; second required key `bound-runtime-status-cli_full-negative-guard-regressions-and-exact-candidate-validation` | `_visible_status_shell`, `_classify_status_command`; every admitted form tested | Old source with the new 10-test class fails 160 assertions/subtests (exit 1); fixed full suite passes. Chained deny, adjacent fd redirection, newline, substitutions, pipe programs, shared force-push, secret reads and untrusted entrypoints stay guarded | `baseline-new-regressions.log`, `scoped.log`, `full-orchestrator.log` | Same exact-candidate review/CI/merge and key recording remain pending; local results do not grant them. |
| Exact existing deny/pending bindings | Status-only binding preservation in `hook_mode` | Newly recognizable clean request classifies allow; both PreToolUse and PermissionRequest retain existing denial, or keep a pending request pending; no new approval | `LoadedRuntimeStatusCliTests.test_recognition_keeps_existing_denial_and_pending_approval_binding`; external queue/log boundaries mocked, production decision path real | No live denied or pending operation executed. |
| Native actor/scope/candidate/request guards | Real native gateway + transaction + dispatch/handlers, isolated filesystem only | Wrong actor (including Supervisor), owner consuming reviewer decision, changed assignment/task/SHA/generation/snapshot/request all fail with identical board bytes and no appended log. Valid synthetic reviewer decision succeeds without acceptance credit | `test_recognition_does_not_replace_real_native_actor_candidate_request_guards`; original native suites in scoped/full runs | Synthetic board only; no real E04/CI-phase/SOS actor impersonation or queue mutation. |
| Existing legitimate forms / tests | Original canonical forms, env JSON, quoted notes, cwd wrapper, continuation, help pipeline and workspace output | Original test classes preserved; 271 focused tests and 1,076 full tests pass | Commands/results below | No product, browser, E2E, PG or Docker check claimed. |

## Exact saved live invocations (data only; do not execute)

These are complete original request strings, including the original env/snapshot/request and message. Duplicated approval IDs in the original artifact are retained in `paired-before-after.json`. Production comparison changes **only** the original entrypoint into the existing canonical entrypoint. The fixture comparison changes only that entrypoint into the loaded-file fixture peers. No lifecycle command string is sent to a shell for reproduction.

### apr-20261016T092400Z-003eddd2

Original command SHA-256: `844c8c5612554e9aaab053f026737757519db7e66b61ad7a12edaf974e08b306`.

```text
\
AI_NAME=Claude2 \
ACCEPTANCE_REVIEW_SNAPSHOT_JSON='{"candidate_generation": "4c7fac61222c46ca871adb36b79c3f73", "candidate_sha": "67a425d77e037f29e8c1053a01e8c7a2b6780e14", "merge_sha": "e323b9424f46bd9bcdfa684a61fbcad77c4eb4a4", "reviewed_sha": "67a425d77e037f29e8c1053a01e8c7a2b6780e14", "reviewer": "Claude2", "task_id": "PAX-RECEIPT-E04-CAPTURE-20261015"}' \
ACCEPTANCE_REVIEW_REQUEST_ID='551ea296bdcf4ab5b08b38ae7021fcea' \
/home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-4da15372d696/tools/development-orchestrator/bin/ai-status.sh decline-acceptance-review PAX-RECEIPT-E04-CAPTURE-20261015 551ea296bdcf4ab5b08b38ae7021fcea "E04-SHARED-OPS-CONFIG-401非本候選缺陷：候選67a425d77僅變更review-supply.service.ts(fleet-partner/driver-profile wiring)，未觸及control-plane-proxy/control-plane-auth/ops-console-web；401發生在Ops /review GET config經control-plane-proxy issueControlPlaneRequestAuth轉upstream，該路徑最後修改於cd9cae5d3(PAX-REVIEW-SHARED-ORDER-DEMO-20261015)與993d246d4(ENTRY-IAP-WORKFORCE-AUTH-20261005)，皆非本task write_scopes，E2E在prepare按鈕出現前即因401於line532 timeout，根本未進入候選prepare()邏輯；屬既有shared-dev auth/transport責任邊界，應由擁有該路徑的task追蹤修復，不弱化auth/validator不加timeout；decline，不reopen本候選。"
```

### apr-20261016T092607Z-89b38f54

Original command SHA-256: `71c688341afba58eec5d7c3e2db1dcaee458966e0d3ffaf45b1406e5a65024c8`.

```text
AI_NAME=Claude2 REVIEWED_SHA=cdde4ca010ccea87917155edbd51d10e771cb167 /home/lupin/workspace/drts-fleet-platform/.artifacts/releases/orchestrator-4da15372d696/tools/development-orchestrator/bin/ai-status.sh approve ORCH-CI-RECOVERY-INDEPENDENT-REVIEW-PHASE-20261016 "獨立複驗：HEAD=candidate cdde4ca010cc；本機重跑57(native)+84(policy/gateway/github)+1085(全orchestrator)測試全綠，git diff --check exit0，diff僅觸及write_scopes三檔。candidate_review_handoff_is_current邏輯正確恢復legacy C073與新handoff於queued/running/success CI-only情境之review路由，owner repair/reopen/closed/conflict/changed-head均正確要求重新handoff而非復活舊審查；未寫reviewed_sha外的偽造核准，未動product/workflow/dispatch policy。核准。"
```

## Verification and reproducibility

Machine-specific evidence directory: `/home/lupin/workspace/drts-fleet-platform/.local/bound-runtime-status-cli-20261016-codex/`.
Original supplied evidence: `/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261016T093442Z-actual-bound-runtime-status-CLI-support-root/Actual-installed-broker-vs-existing-canonical-CLI-same-argv-pure-classification-counterexamples.json`.

The original probe imports the **actual installed** broker and calls only `classify_command`. `offline-probe.py` additionally compiles candidate source in an isolated module using that installed module filename, modeling its prospective loaded location. This is explicitly a source overlay, **not an installed fixed runtime claim**. Independent committed tests copy/import real broker bytes via `importlib` from a release-shaped fixture with real files; they do not mock the recognition/parser/guard logic. All saved argv remain literal data. No task CLI, product runtime, supervisor restart or live queue operation occurs in either probe.

Re-run the pure pairs with:

```bash
python3 /home/lupin/workspace/drts-fleet-platform/.local/bound-runtime-status-cli-20261016-codex/offline-probe.py tools/development-orchestrator/permission_broker.py
```

| Check | Actual result / evidence |
| --- | --- |
| Original installed pure classification | Exit 0; 8 exact pairs reproduce runtime defer / canonical allow (`before.json`). |
| Prospective fixed pure classification | Exit 0; same 8 pairs allow / allow (`paired-before-after.json`), original installed file hash asserted unchanged. |
| New regressions against saved original bytes | Expected exit 1; 10 tests, 160 failing assertions/subtests, no setup errors (`baseline-new-regressions.log`). |
| Permission broker | 59 tests pass, exit 0 (`permission-third.log`); included in final scoped/full checks. |
| Provider permissions | Initial inherited-worker run: 79 tests, 2 relative-cwd expectation failures (`provider.log`). Isolated canonical default: 79 pass, exit 0 (`provider-isolated.log`). This setup discrepancy is retained, not hidden. |
| Focused original and added suites | 271 pass, exit 0, 8.207s (`scoped.log`). |
| Full original orchestrator discovery + added regressions | 1,076 pass, exit 0, 32.846s (`full-orchestrator.log`). |
| Original-test preservation | All 12 original test classes AST-identical, including every original assertion. |
| Syntax / diff | `python3 -m py_compile` for both changed Python files and `git diff --check`: exit 0. |

The existing provider tests assume that unqualified `tools/...` resolves from canonical, while a dispatched worker inherits `ORCH_WORKSPACE_ROOT` pointing to an untrusted worktree. Checks unset only `ORCH_WORKSPACE_ROOT` and `ORCH_CANONICAL_ROOT` **in the test subprocess**, so the ordinary canonical fallback matches those existing tests; native dispatch fencing is retained and tested. New explicit real-cwd fixtures verify that a relative worktree copy is refused and `cd <canonical> && ...` is accepted. No original assertion was relaxed.

```bash
env -u ORCH_WORKSPACE_ROOT -u ORCH_CANONICAL_ROOT PYTHONPATH=tools/development-orchestrator   python3 -m unittest test_permission_broker test_provider_permissions test_claude_permission_prompt_mcp   test_approval_queue test_live_approval_resume test_ai_status test_ai_status_merge_reachability   test_dispatch_contract control_plane.tests.test_task_board_commands control_plane.tests.test_dispatch_policy   control_plane.tests.acceptance_review_routing.test_transactions   control_plane.tests.acceptance_review_routing.test_runtime -v

env -u ORCH_WORKSPACE_ROOT -u ORCH_CANONICAL_ROOT   python3 -m unittest discover -s tools/development-orchestrator -p 'test_*.py' -v

python3 -m py_compile tools/development-orchestrator/permission_broker.py   tools/development-orchestrator/test_permission_broker.py
git diff --check
```

## Source delivery and retained external boundaries

The final pushed full `CANDIDATE_SHA`, `CANDIDATE_BRANCH` and PR URL are recorded atomically through the normal release CLI handoff, after local checks and remote/PR-head comparison. This document cannot embed its own containing commit SHA; the following content hashes bind local verification to the candidate source/tests. The final candidate requires **its own** independent Claude2 review and mandatory same-SHA full hosted CI, normal protected merge, and the two bounded Source keys above. None is inferred from this owner report or an older candidate's CI.

No installation, later loaded-runtime proof, actual pending/denied handoff/approve/decline, product denominator/Final edge, scope expansion, task dependency, four HOLD change, or USER Operator action is claimed. Full original 134/44/PAX scope stays unchanged. The sole maintainer retains subsequent reviewed runtime adoption. No product/dev/preview/browser/E2E/PG/Docker server was started on this VM.

### Verified source and evidence hashes

- `tools/development-orchestrator/permission_broker.py`: SHA-256 `c2e4610f9d1bb611e113d75ea4af2c1035a545cab01ba9293f49a8a333a2ebe6`.
- `tools/development-orchestrator/test_permission_broker.py`: SHA-256 `1a53e6e2800edfed1f26661f35a71a1211188e5d28befe9259f01072bac7f10b`.
- `/home/lupin/workspace/drts-fleet-platform/.local/bound-runtime-status-cli-20261016-codex/before.json`: SHA-256 `5c749933c8123e1fe4997d528df7826288a6593a1b88862f5df6e0de287c9174`.
- `/home/lupin/workspace/drts-fleet-platform/.local/bound-runtime-status-cli-20261016-codex/paired-before-after.json`: SHA-256 `fa3d7006a734e0b6432d9002daea6908053a11391ed3b8240f1922a4235fcbeb`.
- `/home/lupin/workspace/drts-fleet-platform/.local/bound-runtime-status-cli-20261016-codex/scoped.log`: SHA-256 `b57f76269a6e18793c8f8cc3090f01e4671740de0f66266953c827b363fed701`.
- `/home/lupin/workspace/drts-fleet-platform/.local/bound-runtime-status-cli-20261016-codex/full-orchestrator.log`: SHA-256 `2395ba383efe61dfefa9ce3c72d7668ae955f6444522ef2eac60f524aa690f22`.
