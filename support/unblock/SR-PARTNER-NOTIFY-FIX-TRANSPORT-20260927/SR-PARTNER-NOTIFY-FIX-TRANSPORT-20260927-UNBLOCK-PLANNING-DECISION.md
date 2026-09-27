# SR-PARTNER-NOTIFY-FIX-TRANSPORT-20260927 planning decision routing

Date: 2026-09-27. Owner: Gemini2. Reviewer: Codex.
Parent: `SR-PARTNER-NOTIFY-FIX-TRANSPORT-20260927` (Gemini2 / Codex).
Disposition: defined the exact identity boundary for the controlled local receiver exception under `DRTS_ALLOW_LOCAL_WEBHOOKS=true` to unblock transport fix. Parent routing must coordinate through Supervisor to preserve state.

## Evidence and contract

- The parent task was blocked during repair because the reviewer (Codex) found that `DRTS_ALLOW_LOCAL_WEBHOOKS=true` disabled network refusal gates for *every* destination, which violates the requirement that controlled-receiver opt-in must not become a blanket private-address/network bypass.
- The parent encountered a branch/commit history issue and a v2 branch (`gemini2/sr-partner-notify-fix-transport-20260927-v2`) was generated to recover history.
- The product/contract decision required is the exact bounded identity of the "controlled local receiver" so the transport exception can be safely implemented without exposing SSRF or metadata endpoints (like `169.254.169.254`).
- Citing parent spec (`/home/lupin/workspace/drts-fleet-platform/.local/qa-worker-recovery-20260927/SR-PARTNER-NOTIFY-FIX-TRANSPORT-20260927.md`) and prior R9-TR1 review: explicit production public HTTPS/address safeguards are required even with the flag enabled, and non-production defaults must remain unchanged.

## Scope and routing decision

1. **Decision**: The environment guard exception requires the full condition: non-production AND explicit flag (`DRTS_ALLOW_LOCAL_WEBHOOKS=true`) AND bounded receiver identity (`127.0.0.1`, `::1`, and `localhost`). 
   - Production with any flag, and non-production without opt-in, must keep every existing refusal gate.
   - Only the bounded local HTTP/address exception changes. Credentials and the non-local public-HTTPS/DNS guards remain intact.
   - Localhost socket-time resolution must strictly stay within the defined receiver identity (no non-loopback private IPs like `10.x.x.x` or metadata IP `169.254.169.254`).
   - The deadline, body, redirect, and HMAC constraints are fully retained.
2. **Action**: The parent owner (Gemini2) must implement this exact constraint in `partner-notification-https.ts` using the new v2 branch (`gemini2/sr-partner-notify-fix-transport-20260927-v2`), preserving all original security guarantees for non-loopback destinations.
3. **Routing**: Do not regress the parent task to `in_progress` solely to satisfy routing notes. Instead, use state-preserving coordination through Supervisor: record this decision and follow up on the parent task, preserving its current candidate review, CI, and acceptance gates. If unresolved routing remains before helper merge, use the canonical lifecycle disposition mechanism. Unresolved product choices must route through `PHASE1_OPEN_QUESTIONS.md` with Supervisor scope coordination.

## Delivery and validation

This task resolves the planning blocker; no product runtime code is changed in this helper task.

### Guide 0.7 finding/acceptance evidence table

| Finding / 驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| PD-1: PR evidence mismatch | Parent task and PR | PR #2192 (parent) → Helper PR #2193 | `gh pr view` and git evidence showing PR #2193 with branch `gemini2/sr-partner-notify-fix-transport-20260927-unblock-planning-decision` | Runtime tests not applicable to PR mapping |
| PD-2: Decision weakens explicit environment guard | `SR-PARTNER-NOTIFY-FIX-TRANSPORT-20260927-UNBLOCK-PLANNING-DECISION.md` | Incomplete conditions → Full conditions defined (non-prod AND flag AND bounded receiver) | `git diff --check`, `python3 tools/ci/git/check_commit_trailers.py` | Runtime reproduction non-applicable to docs-only diff |
| PD-3: Parent routing/evidence acceptance incomplete | `SR-PARTNER-NOTIFY-FIX-TRANSPORT-20260927-UNBLOCK-PLANNING-DECISION.md` | Stale instructions → Replaced with state-preserving Supervisor coordination | Docs content check / Guide 0.7 table inclusion | Parent update execution depends on parent lifecycle |
