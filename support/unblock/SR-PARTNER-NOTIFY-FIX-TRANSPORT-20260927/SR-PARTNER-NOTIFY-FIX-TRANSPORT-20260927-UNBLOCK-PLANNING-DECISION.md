# SR-PARTNER-NOTIFY-FIX-TRANSPORT-20260927 planning decision routing

Date: 2026-09-27. Owner: Gemini2. Reviewer: Codex.
Parent: `SR-PARTNER-NOTIFY-FIX-TRANSPORT-20260927` (Gemini2 / Codex).
Disposition: defined the exact identity boundary for the controlled local receiver under `DRTS_ALLOW_LOCAL_WEBHOOKS=true` to unblock transport fix. Parent may resume on the v2 history-recovery branch.

## Evidence and contract

- The parent task was blocked during repair because the reviewer (Codex) found that `DRTS_ALLOW_LOCAL_WEBHOOKS=true` disabled network refusal gates for *every* destination, which violates the requirement that controlled-receiver opt-in must not become a blanket private-address/network bypass.
- The parent encountered a branch/commit history issue and a v2 branch (`gemini2/sr-partner-notify-fix-transport-20260927-v2`) was generated to recover history.
- The product/contract decision required is the exact bounded identity of the "controlled local receiver" so the transport exception can be safely implemented without exposing SSRF or metadata endpoints (like `169.254.169.254`).

## Scope and routing decision

1. **Decision**: The controlled local receiver exception under `DRTS_ALLOW_LOCAL_WEBHOOKS=true` is explicitly bounded to loopback addresses (`127.0.0.1` and `::1`) and `localhost`. Any request to a non-loopback private IP (e.g., `10.x.x.x`, `172.16.x.x`, `192.168.x.x`), metadata IP (`169.254.169.254`), or DNS resolutions yielding these must remain strictly rejected, even when the local webhook flag is active.
2. **Action**: The parent owner (Gemini2) must implement this exact constraint in `partner-notification-https.ts` using the new v2 branch (`gemini2/sr-partner-notify-fix-transport-20260927-v2`), preserving all original security guarantees for non-loopback destinations.
3. Supervisor must route the parent task to resume execution on the v2 branch. The parent task will provide a new candidate PR and evidence once the fix is successfully applied and tested against the true production/default refusal matrix and authorized local test success.

## Delivery and validation

This task resolves the planning blocker; no product implementation is changed in this helper task.
The canonical task state for the parent should be updated to `in_progress` once authorized to resume on the v2 branch.
