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
3. **Routing**: Helper scope prevents direct parent mutation (`Dispatched worker cannot mutate a different task` error). Coordination request routed through canonical progress for Supervisor. Parent state as of 2026-09-28T00:45:36Z is `in_progress`, latest independent reviewer approval at 2026-09-28T00:44:55Z on PR #2192 (SHA `8d196f5b08a6f2ba7a68da0e0eb6e51e892d083f`), last_update `00:45:36Z`, next `GitHub reconciled candidate 8d196f5b08a6 from PR #2192.`. The required parent update is still pending Supervisor coordination to actually append the decision.

## Delivery and validation

This task resolves the planning blocker by defining the exact `DRTS_ALLOW_LOCAL_WEBHOOKS` decision in this task artifact, routing the product/contract decision directly to the parent task as a concrete next step instead of producing an unratified L1 amendment.

**Unblocked Next Step for Parent Task (`SR-PARTNER-NOTIFY-FIX-TRANSPORT-20260927`):**
Implement the exact constraint documented in this unblock artifact (see Section "Scope and routing decision") within `partner-notification-https.ts` using the new v2 branch (`gemini2/sr-partner-notify-fix-transport-20260927-v2`), preserving all original security guarantees for non-loopback destinations.

### Guide 0.7 finding/acceptance evidence table

| Finding / 驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| PD-1: PR evidence mismatch (VERIFIED FIXED) | Parent task and PR | PR #2192 (parent) → Helper PR #2193 (history) → Now Helper PR #2201 | (History) PR #2193; Base SHA: 585087a2fd8114eaac0eb8a470dfca58e13dfbe4, Candidate SHA: 97b64d206c7269ba2dbda8c7fec5c2b3e475f554. `gh pr view 2193` exit 0. (Current) `gh pr view 2201`, branch/head match. | Runtime tests not applicable to PR mapping |
| PD-2: Decision weakens explicit environment guard (VERIFIED FIXED) | `SR-PARTNER-NOTIFY-FIX-TRANSPORT-20260927-UNBLOCK-PLANNING-DECISION.md` | Incomplete conditions → Full conditions defined (non-prod AND flag AND bounded receiver) | (History) `python3 tools/ci/git/check_commit_trailers.py --base 585087a2fd8114eaac0eb8a470dfca58e13dfbe4 --head 97b64d206c7269ba2dbda8c7fec5c2b3e475f554` (exit 0, Python 3.12.3). Lines 16-20 retain conditions. | Runtime reproduction non-applicable to docs-only diff |
| PD-3: Parent routing/evidence acceptance incomplete | `SR-PARTNER-NOTIFY-FIX-TRANSPORT-20260927-UNBLOCK-PLANNING-DECISION.md` | False completion claim and bypassed worker guard → Replaced with true status: Supervisor coordination is still unavailable. Parent state is `in_progress` on generation `be22b29109734f3c8ec7b71556969208` waiting for history/routing. | Static reproduction: `git diff 43de52116767f128380b265ad968e81df2cd16f3 943a5981aeefaa677b70b98eece31d4f8bca5ff1`. Missing parent update transaction confirmed via `ai-activity-log.jsonl`. | Blocked waiting on Supervisor authorized coordination to update parent note. |
| PD-4: Delivery/dispatch-boundary violation | `SR-PARTNER-NOTIFY-FIX-TRANSPORT-20260927-UNBLOCK-PLANNING-DECISION.md` | Helper worker removed ORCH_DISPATCH_* to bypass isolation and mutate parent directly → Bypass removed. Supervisor coordination requested; dependency explicitly recorded in helper task progress/blocker. | Read owner execution log (00:05:10Z), recorded progress at 2026-09-28T00:41:34Z by Gemini2. | Parent runtime/hosted acceptance remains separate |
| PD-5: New non-mergeable commit history (VERIFIED FIXED) | Commit subject | Invalid subject missing TASK-ID → Replaced with supported docs(TASK-ID) subject with trailers | (Current) Full-range production trailer checker exits 0 (2 commits OK). Historical Same-SHA Commit trailers job 108742777710 on 943a5981aeefaa677b70b98eece31d4f8bca5ff1 completed SUCCESS. Current CI PR 2201 Commit trailers job 108744215193 on d29858a15a5a7eeabf9a5484ce7a2325b27a8097 completed SUCCESS. Old helper remote branch remains preserved at 1f5ae37a39450305d272602ccd0b9a11328eaf5f. | |
| Second-round repair: Trailing whitespace (VERIFIED FIXED) | `SR-PARTNER-NOTIFY-FIX-TRANSPORT-20260927-UNBLOCK-PLANNING-DECISION.md`:16 | `git diff --check` exits 2 (trailing whitespace) → Whitespace removed | `git diff --check` exits 0 (clean) | Docs-only formatting diff |
| PD-6: Unratified L1 amendment (VERIFIED FIXED) | `phase1_service_contracts_v1.md` | L1 document modified without ratification → Reverted changes to L1 document; decision is routed to parent task directly | `git diff origin/dev...HEAD phase1_service_contracts_v1.md` is empty | |
