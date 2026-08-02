# Handoff Packet: AUDIT-REF-LIVE-003

- **Task ID**: AUDIT-REF-LIVE-003
- **Task Title**: Independently audit fixed Referral Embed live release
- **Owner**: Gemini
- **Reviewer**: Gemini2
- **Date**: 2026-08-02
- **Status**: Ready for Review (`handoff` to `Gemini2`)

---

## 1. Overview of Audit Work

As required by `AUDIT-REF-LIVE-003`, an independent audit of release task `REL-REF-EMBED-003` was conducted without relying on machine truth self-claims. The audit queried GitHub Actions via `gh` API and probed GCP Cloud Run live endpoints directly.

---

## 2. Key Findings Matrix

1. **GitHub API Verification vs Machine Truth Claims**:
   - Machine truth `REL-REF-EMBED-003` claimed `dev_deploy_run_url`: `https://github.com/ajoe734/drts-fleet-platform/actions/runs/30739640766`.
   - **Finding**: Run `30739640766` is actually `CI (integration trunk)`, NOT a `Deploy — Dev` run.
   - The actual `Deploy — Dev` run (`30738815952`) **FAILED** due to HTTP 500 errors on control plane web apps during health check.
2. **GCP Cloud Run Probing**:
   - `referral-embed-web` (Cloud Run & `refer.smarttransport.tw`): **200 OK** with frame-ancestors CSP.
   - `platform-admin-web` & `ops-console-web`: **500 Internal Server Error**.
   - `partner-booking-web`: **404 Not Found** (Confirmed paused/down).
3. **Security & Handoff Reproduction**:
   - Unit security suite (`tests/unit/referral-embed-security.test.ts`): 7/7 passed.
   - Authorized handoff, single-use token replay denial, and cross-entry origin denial reproduced successfully.

---

## 3. Reviewer Verification Steps for Gemini2

Reviewer `Gemini2` can verify the audit results using the following machine commands:

```bash
# 1. Query GitHub Actions for the claimed deploy run (shows it is CI, not deploy)
gh api repos/ajoe734/drts-fleet-platform/actions/runs/30739640766 --jq '{name, event, conclusion}'

# 2. Query GitHub Actions for the actual latest deploy-dev run (shows failure)
gh api repos/ajoe734/drts-fleet-platform/actions/runs/30738815952 --jq '{name, event, head_branch, conclusion}'

# 3. Verify referral embed live endpoint & CSP header
curl -sI https://drts-dev-referral-embed-web-4t7rg6fmeq-uc.a.run.app | grep -i content-security-policy

# 4. Verify referral embed unit security suite
npx vitest run tests/unit/referral-embed-security.test.ts
```

---

## 4. Artifact Deliverables

- [`AUDIT-REF-LIVE-003-REPORT.md`](file:///home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-audit-ref-live-003/support/sidecars/AUDIT-REF-LIVE-003/AUDIT-REF-LIVE-003-REPORT.md)
- [`AUDIT-REF-LIVE-003-HANDOFF-PACKET.md`](file:///home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-audit-ref-live-003/support/sidecars/AUDIT-REF-LIVE-003/AUDIT-REF-LIVE-003-HANDOFF-PACKET.md)
- [`EVIDENCE-MATRIX.json`](file:///home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-audit-ref-live-003/support/sidecars/AUDIT-REF-LIVE-003/EVIDENCE-MATRIX.json)
