# Referral Embed Cloud Run Startup Recovery Execution Tasks

Status: authorized for supervisor-managed execution  
Version: `2026-08-02.v1`  
Incident reference: `REL-REF-EMBED-002` / `ORCH-STATUS-AUTHORITY-003`  
Authority: `tools/development-orchestrator/bin/ai-status.sh` / `tools/development-orchestrator/bin/ai_status.py` canonical status authority

## 1. Incident Overview & Root Cause Analysis

During execution of `REL-REF-EMBED-002`, a stale isolated worker worktree (branched prior to `ORCH-REL-GATE-002`) executed its local `tools/development-orchestrator/bin/ai_status.py` directly without canonical status authority delegation. The local script modified `ai-status.json` in canonical machine truth without calling `enforce_required_integration_closeout`. As a result, the task was falsely marked `done` despite having only `branch_pushed` status rather than `merged_to_dev` or `dev_deployed`.

### Root Cause

1. **Lack of Enforced Delegation in Worktree Status Scripts**: When `python3 tools/development-orchestrator/bin/ai_status.py` was executed directly inside a worktree, older worktree scripts read `AI_STATUS_ROOT` / `ORCH_STATUS_ROOT` to target `ai-status.json`, but executed the worktree's old Python logic instead of delegating to `$ORCH_STATUS_ROOT/tools/development-orchestrator/bin/ai_status.py`.
2. **Missing Version Handshake**: There was no version or capability handshake between `ai-status.json` and `tools/development-orchestrator/bin/ai_status.py` to reject state mutations performed by stale status script code.

## 2. Status Authority Hardening Rules

1. **Canonical Root Delegation**: Every worker state transition must execute the canonical root status script (`$ORCH_STATUS_ROOT/tools/development-orchestrator/bin/ai_status.py`). If `ai_status.py` is invoked inside a worktree where `ROOT != LOCAL_ROOT`, it must immediately delegate execution to the canonical root status implementation via `os.execv`.
2. **Version Handshake Enforcement**: Machine truth (`ai-status.json`) records `status_authority_version` (e.g. `2026-08-02.v1`). `tools/development-orchestrator/bin/ai_status.py` validates the version handshake before performing any state transitions. Stale scripts that omit version checking or canonical delegation fail closed.
3. **Required Integration & Evidence Validation**: Canonical status authority enforces `required_integration_status` and `required_evidence_fields` (such as `pr_url`, `ci_run_url`, `merge_commit`, `dev_deploy_run_url`, `dev_deploy_sha`, `live_verification_urls`). No required evidence field may be omitted on closeout.
4. **Preservation of Incident Evidence**: The false closeout of `REL-REF-EMBED-002` and superseding task records must remain preserved in machine truth and audit logs for incident post-mortem traceability.

## 3. Recovery Verification & Operational Checklist

- [ ] Execute `tools/development-orchestrator/bin/ai-status.sh show ORCH-STATUS-AUTHORITY-003` to verify machine truth status.
- [ ] Verify that stale worktrees running `python3 tools/development-orchestrator/bin/ai_status.py` delegate to `$ORCH_STATUS_ROOT/tools/development-orchestrator/bin/ai_status.py`.
- [ ] Verify that attempting to close a task with missing required integration/evidence fields fails with an explicit error.
- [ ] Verify all orchestrator control-plane and status test suites pass.
