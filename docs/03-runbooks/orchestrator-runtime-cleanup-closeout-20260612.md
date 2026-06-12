# Orchestrator Runtime Cleanup Closeout - 2026-06-12

Status: closed  
Owner: Codex  
Scope: Antigravity sidecar settings, chair review schema handling, and zombie process cleanup.

## Cleanup Items

| Item                         | Root cause                                                                                                                                                                                                                                                                                                        | Fix                                                                                                                                                                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Antigravity sidecar settings | `gemini` and `gemini2` were configured with display names `Antigravity` / `Antigravity2`, while `ai-status.json` uses canonical lane names `Gemini` / `Gemini2`. Sidecar assignment wrote the tool/adapter name into owner fields, then `scripts/ai_status.py assign` rejected it as an unknown agent.            | Keep `adapter: antigravity`, but restore canonical display names to `Gemini` / `Gemini2`. Supervisor now resolves task owner/reviewer names through the status-file canonical lane name before dispatching sidecar or chair review work. |
| Chair review schema          | `chair_review_invalid_schema` was being used for multiple failure classes. A stale provider capability report could describe an old adapter, and manual/file-inbox fallback workers could disappear without a JSON review payload. The refresh logic then reported the missing worker/output as a schema problem. | Chair reviewer selection now requires auto-delivery support, rejects stale adapter mismatches, and separates `chair_review_invalid_schema`, `chair_review_lost_queue_event`, and `chair_review_missing_output` telemetry.                |
| Zombie process cleanup       | The supervisor detected `/proc/<pid>/stat` state `Z` as not alive, but did not call `waitpid`. On Linux, a zombie remains until its parent reaps it, so detection alone did not clean the process table.                                                                                                          | `pid_is_alive` now reaps zombie children by PID, `terminate_worker_pid` reaps after termination, and each supervisor tick drains finished child processes with `waitpid(-1, WNOHANG)`.                                                   |

## Verification

- `PYTHONPATH=.orchestrator python3 -m unittest discover -s .orchestrator -p 'test_supervisor.py'` passed: 228 tests.
- `PYTHONPATH=.orchestrator python3 -m unittest discover -s .orchestrator -p 'test_ai_status.py'` passed: 26 tests.
- `PYTHONPATH=.orchestrator python3 -m unittest discover -s .orchestrator -p 'test_antigravity_adapter.py'` passed: 3 tests.
- `PYTHONPATH=.orchestrator python3 -m unittest discover -s .orchestrator -p 'test_provider_permissions.py'` passed: 39 tests.
- Targeted regression tests passed for canonical Antigravity owner mapping, chair reviewer auto-delivery gating, stale adapter rejection, lost queue event classification, and child process reaping.
- `systemctl --user restart drts-supervisor.service` loaded the fixed supervisor code. Post-restart state: supervisor running, queue empty, approvals empty, active workers zero, active chair review none.
- Post-restart event scan found zero new Antigravity owner leaks, sidecar create failures, chair review schema/lost-output events, or child-process reaper alerts.
- Process scan found no defunct/zombie worker processes.
