# STAGE1-CONTROLLABLE-AUDIT-20260731 Sidecar Review Packet

> **Parent Task:** `STAGE1-CONTROLLABLE-AUDIT-20260731`
> **Parent Owner / Reviewer:** `Codex` / `Codex2`
> **Sidecar Owner / Reviewer:** `Codex2` / `Codex`
> **Helper Kind:** `review_packet`
> **Mutates Canonical:** `false`
> **Created:** `2026-07-31`
> **Source of task truth:** `scripts/ai-status.sh show`, parent owner handoff text, parent branch commit `48d319fee79ce0399f2b2f8915413ce3289bcd5d`

This packet is a support artifact only. It does not modify L1 product truth, runtime contracts, or the main Stage 1 audit output. Its purpose is to give the assigned reviewer a compact evidence map for the already-produced parent audit and to clarify where that audit currently lives.

---

## 1. Parent Task Posture

### 1.1 Shared-truth status

- As of `2026-07-31` machine truth currently reports parent task `STAGE1-CONTROLLABLE-AUDIT-20260731` as `in_progress`.
- As of `2026-07-31` machine truth currently reports parent owner / reviewer as `Codex` / `Codex2`.
- As of `2026-07-31` machine truth currently reports this sidecar task `STAGE1-CONTROLLABLE-AUDIT-20260731-SIDECAR-REVIEW` as `in_progress`, with owner `Codex2` and reviewer `Codex`.
- Earlier parent handoff evidence in this packet is historical and remains cited with its original timestamps rather than restated as current status.

### 1.2 Why this packet is needed

- The parent handoff says the controllable audit report was completed and pushed on branch `origin/codex/stage1-controllable-audit-20260731` at commit `48d319fee79ce0399f2b2f8915413ce3289bcd5d`.
- That audit report file is not present in this isolated sidecar worktree, so a reviewer working only from the sidecar branch would otherwise miss the primary evidence artifact.
- This packet preserves the review context without rewriting the parent report or touching canonical truth.

### 1.3 Parent artifact location

| Item | Location |
| --- | --- |
| Parent pushed branch | `origin/codex/stage1-controllable-audit-20260731` |
| Parent audit commit | `48d319fee79ce0399f2b2f8915413ce3289bcd5d` |
| Audit report path on parent branch | `docs/04-uat/stage1-controllable-audit-20260731.md` |
| Parent base audited in report | `origin/dev @ 8a40248967bdc37a60a22e6d37c8ad5dca02bd41` |

`git ls-remote --heads origin 'refs/heads/codex/stage1-controllable-audit-20260731'` confirms the remote branch currently points at `48d319fee79ce0399f2b2f8915413ce3289bcd5d`.

---

## 2. Evidence Timeline

| Time (UTC) | Source | Meaning |
| --- | --- | --- |
| `2026-07-31T14:46:46Z` | parent commit metadata | `Codex` created commit `48d319fe` titled `STAGE1-CONTROLLABLE-AUDIT-20260731: add controllable Stage 1 audit report`. |
| `2026-07-31T14:46:59Z` | parent handoff record summarized in this packet | At that timestamp the parent task was handed to review with a summary citing `origin/dev` HEAD, GitHub issues `#71-#74`, GitHub variables, latest dev deploy run, and live URL probes. |
| `2026-07-31T14:50:05Z` | `scripts/ai-status.sh show STAGE1-CONTROLLABLE-AUDIT-20260731-SIDECAR-REVIEW` | This sidecar helper was created to prepare a review packet and evidence summary. |
| `2026-07-31T14:50:35Z` | `AI_NAME=Codex2 scripts/ai-status.sh start ...` | Sidecar owner moved this helper to `in_progress` to produce the packet below. |

The practical implication is simple: sidecar review should validate that the support packet accurately points to the parent audit evidence, distinguishes historical handoff moments from current machine truth, and does not overstate what exists on this branch.

---

## 3. Parent Audit Summary

The parent audit report is a read-only controllable-gap audit over `origin/dev`, workflow/config surfaces, and observable dev runtime/domain state. It explicitly excludes all four external gates:

- real bank / issuer live credentials
- live forwarded-platform adapter proof
- mobile store / distribution
- live CTI / recording / filing activation

### 3.1 Highest-signal findings captured by the parent report

| Priority | Gap | Parent evidence anchor | Dispatchable slices named by parent |
| --- | --- | --- | --- |
| `P0` | Driver SOS / incident creation fails for driver realm with `POST /api/incidents` returning `403` | `docs/04-uat/driver-app-verification-20260615/99-summary-and-findings.md`, `docs/04-uat/driver-app-verification-20260615/round-10-incident-heartbeat.md` | `STAGE1-SAFETY-INCIDENT-001` |
| `P1` | Governed billing / quota semantics and release truth are internally inconsistent | GitHub issues `#72`, `#73`, `#74`; `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`; `tests/e2e/README.md` | `STAGE1-FIN-GOV-SEM-001`, `STAGE1-FIN-GOV-AUDIT-001`, `STAGE1-FIN-GOV-LEDGER-001`, `STAGE1-FIN-GOV-DOC-001` |
| `P1` | Regulatory dispatchability does not recover after compliance restoration | GitHub issue `#71`; `docs/04-uat/phase1-uat-checklist.md` rows `OC-013` and `OC-014` | `STAGE1-REG-DSP-001` |
| `P1` | Official dev URL truth is stale and lacks executable acceptance gating | `docs/03-runbooks/smarttransport-tw-custom-domains.md`; `.github/workflows/domain-mappings-dev.yml`; `.github/workflows/deploy-dev.yml`; live probes dated `2026-07-31` | `STAGE1-URL-TRUTH-001` through `STAGE1-URL-TRUTH-003` |
| `P1` | Passenger / concierge / assisted-entry topology truth has drifted across docs, deploy config, and repo vars | `docs/02-architecture/app-entry-url-index-20260616.md`; `apps/concierge-portal-web/README.md`; `apps/assisted-entry-web/README.md`; workflow/config inventory | `STAGE1-TOPOLOGY-TRUTH-001` through `STAGE1-TOPOLOGY-TRUTH-003` |
| `P2` | Runtime verification does not cover every shipped or counted web surface | `tests/e2e/dev-runtime-matrix.spec.ts`; deploy/runtime inventory | `STAGE1-RUNTIME-MATRIX-001` |
| `P2` | Release wording compresses mixed evidence states too aggressively | release gates runbook, E2E README, verification dashboard | `STAGE1-RELEASE-TRUTH-001` |

### 3.2 Parent report also records areas that were not new controllable blockers

- CI/deploy foundations exist and have recent successful `Deploy — Dev` runs on `2026-07-31`.
- DB migration rails exist for dev/staging/prod and are wired through workflow/job paths.
- Referral entry evidence is materially stronger than several other web surfaces, including live `refer.smarttransport.tw` redirect behavior.

---

## 4. Reviewer Checks For This Sidecar

This sidecar is ready if the reviewer can confirm all of the following:

1. The packet points at a real pushed parent branch and commit.
2. The packet does not claim the parent audit file exists in this sidecar worktree when it does not.
3. The summarized findings match the parent report content at commit `48d319fe`.
4. The sidecar itself only adds support material under `support/sidecars/STAGE1-CONTROLLABLE-AUDIT-20260731/`.

Recommended verification commands:

```bash
AI_NAME=Codex2 scripts/ai-status.sh show STAGE1-CONTROLLABLE-AUDIT-20260731
AI_NAME=Codex2 scripts/ai-status.sh show STAGE1-CONTROLLABLE-AUDIT-20260731-SIDECAR-REVIEW
git ls-remote --heads origin 'refs/heads/codex/stage1-controllable-audit-20260731'
git show --stat --format=fuller 48d319fee79ce0399f2b2f8915413ce3289bcd5d
git show 48d319fee79ce0399f2b2f8915413ce3289bcd5d:docs/04-uat/stage1-controllable-audit-20260731.md
git diff --stat
```

What this sidecar did not do:

- it did not rerun the parent live probes
- it did not reproduce GitHub issue state independently
- it did not modify or republish the parent audit report

Those remain part of the parent task's own review scope.

---

## 5. Reviewer Handoff To Codex

The assigned reviewer for this helper should review the sidecar as a support-only packet, not as a re-audit.

Suggested review order:

1. Confirm current machine-truth state and reviewer routing for the parent and sidecar tasks.
2. Confirm the parent branch `origin/codex/stage1-controllable-audit-20260731` exists at `48d319fe`.
3. Spot-check the parent audit file at that commit and verify that the gap summary in section 3 is faithful.
4. Confirm the sidecar branch only introduces this support artifact.

If those checks hold, this sidecar should be approved and handed back as a valid reviewer support packet for `STAGE1-CONTROLLABLE-AUDIT-20260731`.
