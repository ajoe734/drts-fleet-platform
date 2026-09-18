# Platform Admin OpenClaw Regression Root Cause

Date: 2026-06-06

## Summary

The Platform Admin assistant's OpenClaw-backed runtime was successfully merged
into `dev` on 2026-06-04 via PR `#519`, then startup-safe via PR `#520`, but it
was unintentionally removed later the same day by PR `#517`.

The regression did not come from an intentional architectural rollback. It came
from an unrelated i18n documentation PR whose final commit snapshot contained a
large reversion of assistant/OpenClaw files and wiring. When that PR merged, the
OpenClaw runtime path was replaced by the older mock-only assistant path.

## Evidence Chain

1. PR `#519` merged commit `2ccccb448e2c64c68fa9ef944b6120b045fd75be`.
   - Added `tools/development-orchestrator/bin/openclaw-*.sh`
   - Added `tools/development-orchestrator/openclaw/*`
   - Added `platform-admin-assistant.orchestrator-bridge.ts`
   - Switched the assistant module to `LlmGatewayPlatformAdminAssistantProvider`
   - Added read-tool, knowledge, and orchestrator bridge tests

2. PR `#520` merged commit `94c3aa2d5000846b5a582a7c7eb8cd43e2de9a25`.
   - Fixed `LlmGatewayService` Nest injection so the API container could start
   - `publish/v2026.06.04.2` deployed successfully with health checks passing

3. PR `#529` merged commit `15261896879a410b1cdc5122d3579752b626464e`.
   - This remained on top of the OpenClaw-enabled lineage
   - `git merge-base 15261896 2ccccb44` resolves to `2ccccb44`

4. PR `#517` merged commit `ac8d92901a5b758f830136a99d9fc7360cfca9a6`.
   - The PR head commit was `5d7ca98bb301c80a9820fe852771738108d1925f`
   - That commit's parent was `15261896879a410b1cdc5122d3579752b626464e`
   - The resulting diff deleted the OpenClaw runtime and reverted assistant
     wiring back to `MockPlatformAdminAssistantProvider`

## Direct Cause

`5d7ca98b` was created on top of the correct post-OpenClaw parent
(`15261896`), but its tree snapshot removed unrelated assistant/OpenClaw files.
Because `#517` merged normally into `dev`, those unrelated deletions became the
new canonical state.

This means the breakage was caused by an over-broad branch snapshot in `#517`,
not by a later merge conflict or by a deliberate decision to remove OpenClaw.

## Impacted Runtime Surface

The regression removed or downgraded:

- `tools/development-orchestrator/adapters/openclaw_drts_mcp.py`
- `tools/development-orchestrator/bin/openclaw-bootstrap.sh`
- `tools/development-orchestrator/bin/openclaw-launch.sh`
- `tools/development-orchestrator/bin/openclaw-prepare-auth-bridge.sh`
- `tools/development-orchestrator/bin/openclaw-smoke.sh`
- `tools/development-orchestrator/openclaw/pin.json`
- `tools/development-orchestrator/openclaw/runtime-profile.template.json`
- `apps/api/src/modules/platform-admin-assistant/platform-admin-assistant.orchestrator-bridge.ts`
- `apps/api/src/modules/platform-admin-assistant/platform-admin-assistant-read-tools.service.ts`
- `apps/api/src/modules/platform-admin-assistant/platform-admin-assistant.development.ts`
- assistant module/provider/service/type wiring needed for grounded + governed runtime
- deploy workflow support for non-mock LLM gateway configuration

After `ac8d9290`, the deployed assistant still exposed chat/session/action
routes, but it ran the mock provider path instead of the OpenClaw/LLM-backed
runtime.

## Why Detection Failed

- PR `#517` was nominally a docs/audit change, so the unrelated assistant diff
  was not caught early enough
- The merge commit message did not describe any assistant rollback
- The resulting app still deployed successfully because the mock provider path
  is valid and startable
- There was no dedicated guard asserting that OpenClaw bootstrap/runtime files
  must remain present once direct adoption was accepted

## Preventive Follow-ups

- Add an ownership/guard check for `tools/development-orchestrator/openclaw/*` and assistant
  runtime bridge files in CI
- Require scoped staging for docs-only PRs; avoid broad tree snapshots from
  mixed or stale worktrees
- Keep a smoke assertion that `PlatformAdminAssistantModule` does not regress to
  `MockPlatformAdminAssistantProvider` on `dev`
